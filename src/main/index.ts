import { app, BaseWindow, BrowserWindow, shell, globalShortcut, dialog, ipcMain, screen, powerSaveBlocker } from 'electron'
import { join } from 'path'
import { getNativeViewHandle } from './window'
import { MpvProcess } from './mpv/MpvProcess'
import { MpvIpcClient } from './mpv/MpvIpcClient'
import { MpvCommandQueue } from './mpv/MpvCommandQueue'
import { registerMainHandlers, setupObservers, unregisterMainHandlers } from './ipc/mainHandlers'
import { loadResumeStore } from './resumeStore'
import Store from 'electron-store'
import { DisplayInfo } from './mpv/displayProfile'
import {
  startMpvWindowSync,
  notifyFullscreen,
} from './macOS/mpvWindowSync'

const IS_MAC = process.platform === 'darwin'
const IS_WIN = process.platform === 'win32'

// Disable Chromium GPU compositor so mainWin transparency works cleanly
// On macOS with embedded mpv, we keep HW acceleration for proper layer compositing
if (IS_WIN) {
  app.disableHardwareAcceleration()
}

// Load saved playback positions
loadResumeStore()

// Persistent settings
const settingsStore = new Store({ name: 'settings' })

const mpvProcess = new MpvProcess()
let ipcClient: MpvIpcClient | null = null

// Track macOS window sync cleanup
let stopMpvSync: (() => void) | null = null

// Prevent display sleep during playback
let powerSaveId: number | null = null

async function createWindow(): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════════════
  // Windows: videoWin (BaseWindow) + mainWin (transparent overlay)
  //   → mpv embeds via --wid into videoWin, mainWin is a child overlay
  //
  // macOS: mainWin (transparent, always-on-top) + mpv borderless window behind
  //   → Accessibility API syncs mpv window position to match mainWin
  //
  // Linux: mainWin only (fallback — mpv creates its own window)
  // ═══════════════════════════════════════════════════════════════════════════

  let videoWin: BaseWindow | null = null

  if (IS_WIN) {
    videoWin = new BaseWindow({
      width: 1280,
      height: 720,
      minWidth: 640,
      minHeight: 360,
      frame: false,
      show: false,
      hasShadow: false,
      title: 'Cine-Sync',
    })
  }

  const mainWin = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: IS_WIN && !!videoWin,
    hasShadow: IS_MAC, // Keep shadow on macOS since it's the only window
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // ── Platform-specific window setup ──────────────────────────────────────

  if (videoWin && IS_WIN) {
    // Windows: native parent-child relationship
    // @ts-expect-error BaseWindow is compatible at runtime
    mainWin.setParentWindow(videoWin)

    let syncing = false

    function syncVideoToMain(): void {
      if (syncing || mainWin.isDestroyed() || videoWin!.isDestroyed()) return
      syncing = true
      videoWin!.setBounds(mainWin.getBounds())
      setTimeout(() => { syncing = false }, 30)
    }
    function syncMainToVideo(): void {
      if (syncing || mainWin.isDestroyed() || videoWin!.isDestroyed()) return
      syncing = true
      mainWin.setBounds(videoWin!.getBounds())
      setTimeout(() => { syncing = false }, 30)
    }

    mainWin.on('move', syncVideoToMain)
    mainWin.on('resize', syncVideoToMain)
    videoWin.on('move', syncMainToVideo)
    videoWin.on('resize', syncMainToVideo)

    videoWin.on('minimize', () => { if (!mainWin.isDestroyed()) mainWin.minimize() })
    videoWin.on('restore', () => {
      if (!mainWin.isDestroyed()) { mainWin.restore(); mainWin.focus() }
    })
    videoWin.on('maximize', () => { if (!mainWin.isDestroyed()) mainWin.maximize() })
    videoWin.on('unmaximize', () => { if (!mainWin.isDestroyed()) mainWin.unmaximize() })
    videoWin.on('focus', () => { if (!mainWin.isDestroyed()) mainWin.focus() })
  }
  // macOS: single window — no special window setup needed

  // ── Window controls ─────────────────────────────────────────────────────
  const controlTarget = videoWin ?? mainWin

  // macOS simulated fullscreen state
  let macFullscreen = false

  ipcMain.handle('window:minimize', () => controlTarget.minimize())
  ipcMain.handle('window:maximize', () => {
    if (IS_MAC) {
      // macOS: use simulated fullscreen (no separate Space — mpv stays synced)
      macFullscreen = !macFullscreen
      notifyFullscreen(macFullscreen)
      mainWin.setHasShadow(!macFullscreen) // Disable shadow in fullscreen to avoid bounds offset
      mainWin.setSimpleFullScreen(macFullscreen)
      // screen-saver level floats above dock/menu bar in fullscreen
      mainWin.setAlwaysOnTop(true, macFullscreen ? 'screen-saver' : 'floating')
      if (macFullscreen) {
        // Force Electron window to exactly cover the display (no offset from shadow/animation)
        const display = screen.getDisplayMatching(mainWin.getBounds())
        mainWin.setBounds(display.bounds)
      }
      mainWin.webContents.send('window:fullscreen-changed', macFullscreen)
    } else if (controlTarget.isMaximized()) {
      controlTarget.unmaximize()
    } else {
      controlTarget.maximize()
    }
  })
  ipcMain.handle('window:isFullscreen', () => macFullscreen)
  ipcMain.handle('window:close', () => controlTarget.close())

  // ── Picture-in-Picture ──────────────────────────────────────────────────
  let pipActive = false
  let prePipBounds: Electron.Rectangle | null = null

  ipcMain.handle('window:pip', () => {
    if (macFullscreen) return false // Exit fullscreen first

    if (!pipActive) {
      // Save current bounds
      prePipBounds = controlTarget.getBounds()
      // Calculate PiP position (bottom-right corner)
      const display = screen.getDisplayMatching(controlTarget.getBounds())
      const pipWidth = 400
      const pipHeight = 225
      const margin = 20
      const x = display.workArea.x + display.workArea.width - pipWidth - margin
      const y = display.workArea.y + display.workArea.height - pipHeight - margin
      controlTarget.setBounds({ x, y, width: pipWidth, height: pipHeight })
      if (!IS_MAC) controlTarget.setAlwaysOnTop(true)
      pipActive = true
    } else {
      // Restore previous bounds
      if (prePipBounds) controlTarget.setBounds(prePipBounds)
      if (!IS_MAC) controlTarget.setAlwaysOnTop(false)
      pipActive = false
      prePipBounds = null
    }
    mainWin.webContents.send('window:pip-changed', pipActive)
    return pipActive
  })
  ipcMain.handle('window:isPip', () => pipActive)

  // ── Theme ───────────────────────────────────────────────────────────────
  ipcMain.handle('theme:get', () => settingsStore.get('accentColor', 'blue'))
  ipcMain.handle('theme:set', (_e, color: string) => {
    settingsStore.set('accentColor', color)
  })

  // ── DevTools ────────────────────────────────────────────────────────────
  if (!app.isPackaged) {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      mainWin?.webContents.toggleDevTools()
    })
  }

  // ── File dialog ─────────────────────────────────────────────────────────
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWin, {
      title: 'Ouvrir une vidéo',
      properties: ['openFile'],
      filters: [
        {
          name: 'Vidéo',
          extensions: ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm',
                       'm4v', 'ts', 'm2ts', 'mts', 'mpg', 'mpeg', 'ogv'],
        },
        { name: 'Tous les fichiers', extensions: ['*'] },
      ],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // ── Load renderer ─────────────────────────────────────────────────────
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWin.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWin.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ── Start mpv ─────────────────────────────────────────────────────────
  mainWin.webContents.once('did-finish-load', async () => {
    if (videoWin) {
      videoWin.show()
    }
    mainWin.show()
    mainWin.focus()

    if (!mpvProcess.checkExists()) {
      console.warn('[main] mpv not found at:', mpvProcess.getMpvPath())
      mainWin.webContents.send('mpv:error', {
        type: 'mpv-not-found',
        path: mpvProcess.getMpvPath(),
      })
      return
    }

    // ── Register handlers BEFORE connecting ──────────────────────────
    ipcClient = new MpvIpcClient()
    const cmdQueue = new MpvCommandQueue(ipcClient)
    registerMainHandlers(mainWin, ipcClient, cmdQueue)

    try {
      // ── Detect display for quality optimization ─────────────────────
      const primary = screen.getPrimaryDisplay()
      const displayInfo: DisplayInfo = {
        widthPx: primary.size.width * primary.scaleFactor,
        heightPx: primary.size.height * primary.scaleFactor,
        scaleFactor: primary.scaleFactor,
        refreshRate: primary.displayFrequency,
        colorSpace: primary.colorSpace,
        colorDepth: primary.colorDepth,
        depthPerComponent: primary.depthPerComponent,
      }
      console.log('[main] detected display:', JSON.stringify(displayInfo))

      // ── Spawn mpv ─────────────────────────────────────────────────────
      if (IS_WIN && videoWin) {
        // Windows: embed into BaseWindow via HWND
        const wid = getNativeViewHandle(videoWin)
        mpvProcess.spawn({ wid, displayInfo })
      } else if (IS_MAC) {
        // macOS: borderless mpv window synced via Accessibility API
        const bounds = mainWin.getBounds()
        const geometry = `${bounds.width}x${bounds.height}+${bounds.x}+${bounds.y}`
        mpvProcess.spawn({ geometry, displayInfo })

        // Make Electron overlay float above mpv
        mainWin.setAlwaysOnTop(true, 'floating')

        // Start position sync once mpv has a PID
        const pid = mpvProcess.pid
        if (pid) {
          stopMpvSync = startMpvWindowSync(mainWin, pid)
        } else {
          console.warn('[main] macOS: mpv PID not available for window sync')
        }
      } else {
        // Linux fallback — standalone mpv window
        mpvProcess.spawn({ displayInfo })
      }

      // Prevent screen from sleeping during playback
      powerSaveId = powerSaveBlocker.start('prevent-display-sleep')
      console.log('[main] display sleep blocked')

      await ipcClient.connect()
      ipcClient.enableAutoReconnect()
      console.log('[main] mpv IPC connected')

      // Re-register observers on reconnection
      ipcClient.on('reconnected', async () => {
        console.log('[main] re-registering observers after reconnect')
        try {
          await setupObservers(ipcClient!, cmdQueue, mainWin)
        } catch (err) {
          console.error('[main] failed to re-setup observers:', err)
        }
      })

      await setupObservers(ipcClient, cmdQueue, mainWin)
      console.log('[main] mpv observers registered')

      ipcClient.on('error', (err) => console.error('[main] mpv IPC error:', err))
      ipcClient.on('close', () => console.log('[main] mpv IPC closed'))

      // Store ref for open-file handler
      mainWinRef = mainWin

      // If a file was opened via double-click before the app was ready, load it now
      if (pendingFilePath) {
        console.log('[main] loading pending file:', pendingFilePath)
        mainWin.webContents.send('mpv:event', {
          event: 'external-file',
          data: pendingFilePath,
        })
        pendingFilePath = null
      }
    } catch (err) {
      console.error('[main] failed to start mpv:', err)
      mainWin.webContents.send('mpv:error', {
        type: 'launch-failed',
        message: String(err),
      })
    }
  })

  // ── Lifecycle ─────────────────────────────────────────────────────────
  mainWin.on('closed', () => {
    if (powerSaveId !== null) powerSaveBlocker.stop(powerSaveId)
    if (stopMpvSync) stopMpvSync()
    unregisterMainHandlers()
    // Clean up window control handlers registered in this scope
    for (const ch of ['window:minimize', 'window:maximize', 'window:close', 'window:isFullscreen', 'window:pip', 'window:isPip', 'theme:get', 'theme:set', 'dialog:openFile']) {
      ipcMain.removeHandler(ch)
    }
    ipcClient?.destroy()
    mpvProcess.kill()
    if (videoWin && !videoWin.isDestroyed()) videoWin.close()
  })
  if (videoWin) {
    videoWin.on('closed', () => {
      if (!mainWin.isDestroyed()) mainWin.close()
    })
  }
}

// ── File association: handle files opened via double-click / "Open With" ─────
let pendingFilePath: string | null = null
let mainWinRef: BrowserWindow | null = null

// macOS: open-file event
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWinRef && ipcClient) {
    mainWinRef.webContents.send('mpv:event', {
      event: 'external-file',
      data: filePath,
    })
  } else {
    pendingFilePath = filePath
  }
})

// Windows/Linux: file path passed as command-line argument
const cliFile = process.argv.find((arg) =>
  /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|ts|m2ts|mts|mpg|mpeg|ogv)$/i.test(arg)
)
if (cliFile) pendingFilePath = cliFile

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  mpvProcess.kill()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
