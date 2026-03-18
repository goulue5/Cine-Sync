import { app, BrowserWindow, shell, globalShortcut, dialog, ipcMain, screen, powerSaveBlocker } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { registerMainHandlers, unregisterMainHandlers } from './ipc/mainHandlers'
import { loadResumeStore } from './resumeStore'

const IS_MAC = process.platform === 'darwin'

// Load saved playback positions
loadResumeStore()

// Simple JSON settings (replaces electron-store)
const settingsPath = join(app.getPath('userData'), 'settings.json')
let settings: Record<string, unknown> = {}
try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch { settings = {} }
function saveSettings(): void {
  try { fs.writeFileSync(settingsPath, JSON.stringify(settings), 'utf8') } catch { /* ignore */ }
}

// Prevent display sleep during playback
let powerSaveId: number | null = null

async function createWindow(): Promise<void> {
  const mainWin = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    frame: false,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false, // Allow <video> to load local file:// URLs
    },
  })

  // ── Window controls ─────────────────────────────────────────────────
  let macFullscreen = false

  ipcMain.handle('window:minimize', () => mainWin.minimize())
  ipcMain.handle('window:maximize', () => {
    if (IS_MAC) {
      macFullscreen = !macFullscreen
      mainWin.setSimpleFullScreen(macFullscreen)
      mainWin.webContents.send('window:fullscreen-changed', macFullscreen)
    } else if (mainWin.isMaximized()) {
      mainWin.unmaximize()
    } else {
      mainWin.maximize()
    }
  })
  ipcMain.handle('window:isFullscreen', () => macFullscreen)
  ipcMain.handle('window:close', () => mainWin.close())

  // ── Picture-in-Picture ──────────────────────────────────────────────
  let pipActive = false
  let prePipBounds: Electron.Rectangle | null = null

  ipcMain.handle('window:pip', () => {
    if (macFullscreen) return false

    if (!pipActive) {
      prePipBounds = mainWin.getBounds()
      const display = screen.getDisplayMatching(mainWin.getBounds())
      const pipWidth = 400
      const pipHeight = 225
      const margin = 20
      const x = display.workArea.x + display.workArea.width - pipWidth - margin
      const y = display.workArea.y + display.workArea.height - pipHeight - margin
      mainWin.setBounds({ x, y, width: pipWidth, height: pipHeight })
      mainWin.setAlwaysOnTop(true)
      pipActive = true
    } else {
      if (prePipBounds) mainWin.setBounds(prePipBounds)
      mainWin.setAlwaysOnTop(false)
      pipActive = false
      prePipBounds = null
    }
    mainWin.webContents.send('window:pip-changed', pipActive)
    return pipActive
  })
  ipcMain.handle('window:isPip', () => pipActive)

  // ── Theme ───────────────────────────────────────────────────────────
  ipcMain.handle('theme:get', () => settings.accentColor ?? 'blue')
  ipcMain.handle('theme:set', (_e: Electron.IpcMainInvokeEvent, color: string) => {
    settings.accentColor = color
    saveSettings()
  })

  // ── DevTools ────────────────────────────────────────────────────────
  if (!app.isPackaged) {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      mainWin?.webContents.toggleDevTools()
    })
  }

  // ── File dialog ─────────────────────────────────────────────────────
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

  // ── Load renderer ──────────────────────────────────────────────────
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWin.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWin.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ── Show window when ready ─────────────────────────────────────────
  mainWin.webContents.once('did-finish-load', () => {
    mainWin.show()
    mainWin.focus()

    // Power save blocker — only during playback
    ipcMain.on('player:playing', () => {
      if (powerSaveId === null) powerSaveId = powerSaveBlocker.start('prevent-display-sleep')
    })
    ipcMain.on('player:paused', () => {
      if (powerSaveId !== null) { powerSaveBlocker.stop(powerSaveId); powerSaveId = null }
    })

    // Register IPC handlers for subtitles, sync, resume, etc.
    registerMainHandlers(mainWin)

    // Store ref for open-file handler
    mainWinRef = mainWin

    // If a file was opened via double-click before the app was ready, load it now
    if (pendingFilePath) {
      console.log('[main] loading pending file:', pendingFilePath)
      mainWin.webContents.send('external-file', pendingFilePath)
      pendingFilePath = null
    }
  })

  // ── Lifecycle ──────────────────────────────────────────────────────
  mainWin.on('closed', () => {
    if (powerSaveId !== null) powerSaveBlocker.stop(powerSaveId)
    unregisterMainHandlers()
    for (const ch of ['window:minimize', 'window:maximize', 'window:close', 'window:isFullscreen', 'window:pip', 'window:isPip', 'theme:get', 'theme:set', 'dialog:openFile']) {
      ipcMain.removeHandler(ch)
    }
  })
}

// ── File association: handle files opened via double-click / "Open With" ─────
let pendingFilePath: string | null = null
let mainWinRef: BrowserWindow | null = null

// macOS: open-file event
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWinRef) {
    mainWinRef.webContents.send('external-file', filePath)
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
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
