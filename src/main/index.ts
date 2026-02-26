import { app, BaseWindow, BrowserWindow, shell, globalShortcut, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { getHwnd } from './window'
import { MpvProcess } from './mpv/MpvProcess'
import { MpvIpcClient } from './mpv/MpvIpcClient'
import { MpvCommandQueue } from './mpv/MpvCommandQueue'
import { registerMainHandlers, unregisterMainHandlers } from './ipc/mainHandlers'

// Disable Chromium GPU compositor so mainWin transparency works cleanly
app.disableHardwareAcceleration()

const mpvProcess = new MpvProcess()
let ipcClient: MpvIpcClient | null = null

async function createWindow(): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════════════
  // videoWin = BaseWindow (NO Chromium at all → zero D3D11 conflict)
  //   → mpv can use --vo=gpu --gpu-api=d3d11 freely for max quality
  //
  // mainWin = BrowserWindow (transparent overlay)
  //   → React UI, transparent areas show mpv video through
  // ═══════════════════════════════════════════════════════════════════════════

  const videoWin = new BaseWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    frame: false,
    show: false,
    title: 'LecteurFilm',
  })

  const mainWin = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // @ts-expect-error BaseWindow is compatible at runtime
  mainWin.setParentWindow(videoWin)

  // ── Position sync ───────────────────────────────────────────────────────
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

  // ── Window controls ─────────────────────────────────────────────────────
  ipcMain.handle('window:minimize', () => videoWin.minimize())
  ipcMain.handle('window:maximize', () => {
    if (videoWin.isMaximized()) videoWin.unmaximize()
    else videoWin.maximize()
  })
  ipcMain.handle('window:close', () => videoWin.close())

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

  // ── Load renderer ───────────────────────────────────────────────────────
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWin.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWin.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ── Start mpv ───────────────────────────────────────────────────────────
  mainWin.webContents.once('did-finish-load', async () => {
    videoWin.show()
    mainWin.show()
    mainWin.focus()

    if (!mpvProcess.checkExists()) {
      console.warn('[main] mpv.exe not found at:', mpvProcess.getMpvPath())
      mainWin.webContents.send('mpv:error', {
        type: 'mpv-not-found',
        path: mpvProcess.getMpvPath(),
      })
      return
    }

    try {
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

  // ── Lifecycle ───────────────────────────────────────────────────────────
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
