import { ipcMain, BrowserWindow } from 'electron'
import { MpvCommandQueue } from '../mpv/MpvCommandQueue'
import { MpvIpcClient } from '../mpv/MpvIpcClient'
import { MpvEvent } from '../mpv/mpvTypes'

// Observed property IDs
const OBS = {
  TIME_POS: 1,
  PAUSE: 2,
  DURATION: 3,
  VOLUME: 4,
  MUTE: 5,
  FILENAME: 6,
  EOF_REACHED: 7,
} as const

export function registerMainHandlers(
  win: BrowserWindow,
  client: MpvIpcClient,
  cmd: MpvCommandQueue
): void {
  // ── mpv commands (renderer → main → mpv) ────────────────────────────────
  ipcMain.handle('mpv:loadFile', (_e, filePath: string) => cmd.loadFile(filePath))
  ipcMain.handle('mpv:play', () => cmd.play())
  ipcMain.handle('mpv:pause', () => cmd.pause())
  ipcMain.handle('mpv:togglePause', () => cmd.togglePause())
  ipcMain.handle('mpv:seek', (_e, seconds: number, mode: 'absolute' | 'relative') =>
    cmd.seek(seconds, mode)
  )
  ipcMain.handle('mpv:setVolume', (_e, volume: number) => cmd.setVolume(volume))
  ipcMain.handle('mpv:setMute', (_e, mute: boolean) => cmd.setMute(mute))
  ipcMain.handle('mpv:stop', () => cmd.stop())
  ipcMain.handle('mpv:getProperty', (_e, name: string) => cmd.getProperty(name))

  // ── observe properties → forward as events to renderer ──────────────────
  _setupObservers(client, cmd, win)
}

async function _setupObservers(
  client: MpvIpcClient,
  cmd: MpvCommandQueue,
  win: BrowserWindow
): Promise<void> {
  try {
    await cmd.observeProperty(OBS.TIME_POS, 'time-pos')
    await cmd.observeProperty(OBS.PAUSE, 'pause')
    await cmd.observeProperty(OBS.DURATION, 'duration')
    await cmd.observeProperty(OBS.VOLUME, 'volume')
    await cmd.observeProperty(OBS.MUTE, 'mute')
    await cmd.observeProperty(OBS.FILENAME, 'filename')
    await cmd.observeProperty(OBS.EOF_REACHED, 'eof-reached')
  } catch (err) {
    console.error('[ipc] failed to setup observers:', err)
  }

  client.on('mpv-event', (event: MpvEvent) => {
    if (!win.isDestroyed()) {
      win.webContents.send('mpv:event', event)
    }
  })
}

export function unregisterMainHandlers(): void {
  const channels = [
    'mpv:loadFile', 'mpv:play', 'mpv:pause', 'mpv:togglePause',
    'mpv:seek', 'mpv:setVolume', 'mpv:setMute', 'mpv:stop', 'mpv:getProperty',
  ]
  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }
}
