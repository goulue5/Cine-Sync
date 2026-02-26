import { ipcMain, BrowserWindow } from 'electron'
import { MpvCommandQueue } from '../mpv/MpvCommandQueue'
import { MpvIpcClient } from '../mpv/MpvIpcClient'
import { MpvEvent } from '../mpv/mpvTypes'

const OBS = {
  TIME_POS: 1,
  PAUSE: 2,
  DURATION: 3,
  VOLUME: 4,
  MUTE: 5,
  FILENAME: 6,
  EOF_REACHED: 7,
  TRACK_LIST: 8,
  AID: 9,
  SID: 10,
  SPEED: 11,
  SUB_DELAY: 12,
  AUDIO_DELAY: 13,
} as const

export function registerMainHandlers(
  win: BrowserWindow,
  client: MpvIpcClient,
  cmd: MpvCommandQueue
): void {
  // ── Playback ────────────────────────────────────────────────────────────
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
  ipcMain.handle('mpv:setProperty', (_e, name: string, value: string | number | boolean) => cmd.setProperty(name, value))

  // ── Tracks ──────────────────────────────────────────────────────────────
  ipcMain.handle('mpv:getTrackList', () => cmd.getTrackList())
  ipcMain.handle('mpv:setAudioTrack', (_e, id: number | 'auto' | 'no') => cmd.setAudioTrack(id))
  ipcMain.handle('mpv:setSubtitleTrack', (_e, id: number | 'auto' | 'no') => cmd.setSubtitleTrack(id))

  // ── Playback options ────────────────────────────────────────────────────
  ipcMain.handle('mpv:setSpeed', (_e, speed: number) => cmd.setSpeed(speed))
  ipcMain.handle('mpv:setSubDelay', (_e, seconds: number) => cmd.setSubDelay(seconds))
  ipcMain.handle('mpv:setAudioDelay', (_e, seconds: number) => cmd.setAudioDelay(seconds))

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
    await cmd.observeProperty(OBS.TRACK_LIST, 'track-list')
    await cmd.observeProperty(OBS.AID, 'aid')
    await cmd.observeProperty(OBS.SID, 'sid')
    await cmd.observeProperty(OBS.SPEED, 'speed')
    await cmd.observeProperty(OBS.SUB_DELAY, 'sub-delay')
    await cmd.observeProperty(OBS.AUDIO_DELAY, 'audio-delay')
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
    'mpv:seek', 'mpv:setVolume', 'mpv:setMute', 'mpv:stop',
    'mpv:getProperty', 'mpv:setProperty',
    'mpv:getTrackList', 'mpv:setAudioTrack', 'mpv:setSubtitleTrack',
    'mpv:setSpeed', 'mpv:setSubDelay', 'mpv:setAudioDelay',
  ]
  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }
}
