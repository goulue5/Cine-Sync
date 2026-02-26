import { app, BrowserWindow, shell, globalShortcut, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { getHwnd } from './window'
import { MpvProcess } from './mpv/MpvProcess'
import { MpvIpcClient } from './mpv/MpvIpcClient'
import { MpvCommandQueue } from './mpv/MpvCommandQueue'
import { registerMainHandlers, unregisterMainHandlers } from './ipc/mainHandlers'

// ── Electron security baseline ──────────────────────────────────────────────
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')

const mpvProcess = new MpvProcess()
let ipcClient: MpvIpcClient | null = null

async function createWindow(): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════════════
  // TWO-WINDOW ARCHITECTURE:
  //   videoWin (opaque, black) — mpv renders here via --wid=<HWND>
  //   mainWin  (transparent)   — React overlay sits on top
  //
  // mainWin is an "owned window" of videoWin via setParentWindow(),
  // which guarantees mainWin is ALWAYS above videoWin on Windows.
  // Transparent areas of mainWin reveal mpv's video underneath.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 1. Video host window (mpv renders here) ─────────────────────────────
  const videoWin = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    frame: false,
    show: false,
    backgroundColor: '#000000',
    title: 'LecteurFilm',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  videoWin.loadURL('about:blank')

  // ── 2. UI overlay window (transparent React shell) ──────────────────────
  const mainWin = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    frame: false,
    show: false,
    transparent: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // ── 3. Z-order: mainWin always above videoWin ───────────────────────────
  mainWin.setParentWindow(videoWin)

  // ── 4. Position/size sync ───────────────────────────────────────────────
  let syncing = false

  function syncVideoToMain(): void {
    if (syncing || mainWin.isDestroyed() || videoWin.isDestroyed()) return
    syncing = true
    videoWin.setBounds(mainWin.getBounds())
    setTimeout(() => { syncing = false }, 30)
  }

  function syncMainToVideo(): void {
    if (syncing || mainWin.isDestroyed() || videoWin.isDestroyed()) return
    syncing = true
    mainWin.setBounds(videoWin.getBounds())
    setTimeout(() => { syncing = false }, 30)
  }

  // Main window drag → video follows
  mainWin.on('move', syncVideoToMain)
  mainWin.on('resize', syncVideoToMain)

  // Taskbar/snap interaction affects videoWin → sync to main
  videoWin.on('move', syncMainToVideo)
  videoWin.on('resize', syncMainToVideo)

  // Minimize / maximize / restore sync
  videoWin.on('minimize', () => { if (!mainWin.isDestroyed()) mainWin.minimize() })
  videoWin.on('restore', () => {
    if (!mainWin.isDestroyed()) {
      mainWin.restore()
      mainWin.focus()
    }
  })
  videoWin.on('maximize', () => { if (!mainWin.isDestroyed()) mainWin.maximize() })
  videoWin.on('unmaximize', () => { if (!mainWin.isDestroyed()) mainWin.unmaximize() })

  // Clicking taskbar icon focuses videoWin → redirect focus to mainWin
  videoWin.on('focus', () => {
    if (!mainWin.isDestroyed()) mainWin.focus()
  })

  // ── 5. Window control IPC (since frame: false) ─────────────────────────
  ipcMain.handle('window:minimize', () => videoWin.minimize())
  ipcMain.handle('window:maximize', () => {
    if (videoWin.isMaximized()) {
      videoWin.unmaximize()
    } else {
      videoWin.maximize()
    }
  })
  ipcMain.handle('window:close', () => videoWin.close())

  // ── 6. DevTools (dev only) ──────────────────────────────────────────────
  if (!app.isPackaged) {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      mainWin?.webContents.toggleDevTools()
    })
  }

  // ── 7. File dialog ──────────────────────────────────────────────────────
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

  // External links
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // ── 8. Load renderer ───────────────────────────────────────────────────
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWin.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWin.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ── 9. Start mpv after renderer loads ───────────────────────────────────
  mainWin.webContents.once('did-finish-load', async () => {
    videoWin.show()
    mainWin.show()
    mainWin.focus()

    if (!mpvProcess.checkExists()) {
      console.warn('[main] mpv.exe not found')
      console.warn(`[main] Expected at: ${mpvProcess.getMpvPath()}`)
      mainWin.webContents.send('mpv:error', {
        type: 'mpv-not-found',
        path: mpvProcess.getMpvPath(),
      })
      return
    }

    try {
      // HWND from videoWin (not mainWin — mpv renders into video window)
      const hwnd = getHwnd(videoWin)
      mpvProcess.spawn(hwnd)

      ipcClient = new MpvIpcClient()
      await ipcClient.connect()
      console.log('[main] mpv IPC connected')

      const cmdQueue = new MpvCommandQueue(ipcClient)
      registerMainHandlers(mainWin, ipcClient, cmdQueue)

      ipcClient.on('error', (err) => console.error('[main] mpv IPC error:', err))
      ipcClient.on('close', () => console.log('[main] mpv IPC closed'))
    } catch (err) {
      console.error('[main] failed to start mpv:', err)
      mainWin.webContents.send('mpv:error', {
        type: 'launch-failed',
        message: String(err),
      })
    }
  })

  // ── 10. Lifecycle ───────────────────────────────────────────────────────
  mainWin.on('closed', () => {
    unregisterMainHandlers()
    ipcClient?.destroy()
    mpvProcess.kill()
    if (!videoWin.isDestroyed()) videoWin.close()
  })
  videoWin.on('closed', () => {
    if (!mainWin.isDestroyed()) mainWin.close()
  })
}

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
