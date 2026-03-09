import { ipcMain, BrowserWindow, dialog } from 'electron'
import { MpvCommandQueue } from '../mpv/MpvCommandQueue'
import { MpvIpcClient } from '../mpv/MpvIpcClient'
import { MpvEvent } from '../mpv/mpvTypes'
import { savePosition, getResumePosition } from '../resumeStore'

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
  PATH: 14,
} as const

// ── Resume playback state ───────────────────────────────────────────────────
let currentFilePath: string | null = null
let currentTimePos = 0
let currentDuration = 0
let lastSaveTime = 0
const SAVE_INTERVAL_MS = 5000

export function registerMainHandlers(
  win: BrowserWindow,
  client: MpvIpcClient,
  cmd: MpvCommandQueue
): void {
  // ── Playback ────────────────────────────────────────────────────────────
  ipcMain.handle('mpv:loadFile', (_e, filePath: string) => {
    // Save position of previous file before loading new one
    if (currentFilePath && currentDuration > 0) {
      savePosition(currentFilePath, currentTimePos, currentDuration)
    }
    currentFilePath = filePath
    currentTimePos = 0
    currentDuration = 0
    return cmd.loadFile(filePath)
  })
  ipcMain.handle('mpv:play', () => cmd.play())
  ipcMain.handle('mpv:pause', () => cmd.pause())
  ipcMain.handle('mpv:togglePause', () => cmd.togglePause())
  ipcMain.handle('mpv:seek', (_e, seconds: number, mode: 'absolute' | 'relative') =>
    cmd.seek(seconds, mode)
  )
  ipcMain.handle('mpv:setVolume', (_e, volume: number) => cmd.setVolume(volume))
  ipcMain.handle('mpv:setMute', (_e, mute: boolean) => cmd.setMute(mute))
  ipcMain.handle('mpv:stop', () => {
    // Save position before stopping
    if (currentFilePath && currentDuration > 0) {
      savePosition(currentFilePath, currentTimePos, currentDuration)
    }
    currentFilePath = null
    return cmd.stop()
  })
  ipcMain.handle('mpv:getProperty', (_e, name: string) => cmd.getProperty(name))
  ipcMain.handle('mpv:setProperty', (_e, name: string, value: string | number | boolean) => cmd.setProperty(name, value))

  // ── Tracks ──────────────────────────────────────────────────────────────
  ipcMain.handle('mpv:getTrackList', () => cmd.getTrackList())
  ipcMain.handle('mpv:setAudioTrack', (_e, id: number | 'auto' | 'no') => cmd.setAudioTrack(id))
  ipcMain.handle('mpv:setSubtitleTrack', (_e, id: number | 'auto' | 'no') => cmd.setSubtitleTrack(id))

  // ── Subtitles ─────────────────────────────────────────────────────────
  ipcMain.handle('mpv:addSubtitle', (_e, filePath: string) => cmd.addSubtitle(filePath))

  // ── Playback options ──────────────────────────────────────────────────
  ipcMain.handle('mpv:setSpeed', (_e, speed: number) => cmd.setSpeed(speed))
  ipcMain.handle('mpv:setSubDelay', (_e, seconds: number) => cmd.setSubDelay(seconds))
  ipcMain.handle('mpv:setAudioDelay', (_e, seconds: number) => cmd.setAudioDelay(seconds))

  // ── Resume playback ───────────────────────────────────────────────────
  ipcMain.handle('mpv:getResumePosition', (_e, filePath: string) => {
    return getResumePosition(filePath)
  })

  // ── Subtitle file dialog ──────────────────────────────────────────────
  ipcMain.handle('dialog:openSubtitle', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Charger des sous-titres',
      properties: ['openFile'],
      filters: [
        {
          name: 'Sous-titres',
          extensions: ['srt', 'ass', 'ssa', 'sub', 'vtt', 'idx', 'sup', 'smi'],
        },
        { name: 'Tous les fichiers', extensions: ['*'] },
      ],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // ── Multiple files dialog (playlist) ──────────────────────────────────
  ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Ouvrir des vidéos',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Vidéo',
          extensions: ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm',
                       'm4v', 'ts', 'm2ts', 'mts', 'mpg', 'mpeg', 'ogv'],
        },
        { name: 'Tous les fichiers', extensions: ['*'] },
      ],
    })
    return result.canceled ? [] : result.filePaths
  })
}

export async function setupObservers(
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
    await cmd.observeProperty(OBS.PATH, 'path')
  } catch (err) {
    console.error('[ipc] failed to setup observers:', err)
  }

  client.on('mpv-event', (event: MpvEvent) => {
    // ── Resume: save position periodically ────────────────────────────
    if (event.event === 'property-change') {
      const e = event as { event: string; name: string; data: unknown }

      if (e.name === 'time-pos' && typeof e.data === 'number') {
        currentTimePos = e.data
        const now = Date.now()
        if (currentFilePath && currentDuration > 0 && now - lastSaveTime > SAVE_INTERVAL_MS) {
          lastSaveTime = now
          savePosition(currentFilePath, currentTimePos, currentDuration)
        }
      }

      if (e.name === 'duration' && typeof e.data === 'number') {
        currentDuration = e.data
      }

      if (e.name === 'path' && typeof e.data === 'string') {
        currentFilePath = e.data
      }
    }

    // ── Resume: seek to saved position on file load ───────────────────
    if (event.event === 'file-loaded' && currentFilePath) {
      const resumePos = getResumePosition(currentFilePath)
      if (resumePos !== null && resumePos > 0) {
        console.log(`[ipc] resuming ${currentFilePath} at ${resumePos}s`)
        cmd.seek(resumePos, 'absolute').catch(() => {})
        // Notify renderer about resume
        if (!win.isDestroyed()) {
          win.webContents.send('mpv:resumed', { position: resumePos })
        }
      }
    }

    // ── Forward all events to renderer ────────────────────────────────
    if (!win.isDestroyed()) {
      win.webContents.send('mpv:event', event)
    }
  })
}

export function unregisterMainHandlers(): void {
  // Save final position on cleanup
  if (currentFilePath && currentDuration > 0) {
    savePosition(currentFilePath, currentTimePos, currentDuration)
  }

  const channels = [
    'mpv:loadFile', 'mpv:play', 'mpv:pause', 'mpv:togglePause',
    'mpv:seek', 'mpv:setVolume', 'mpv:setMute', 'mpv:stop',
    'mpv:getProperty', 'mpv:setProperty',
    'mpv:getTrackList', 'mpv:setAudioTrack', 'mpv:setSubtitleTrack',
    'mpv:addSubtitle',
    'mpv:setSpeed', 'mpv:setSubDelay', 'mpv:setAudioDelay',
    'mpv:getResumePosition',
    'dialog:openSubtitle', 'dialog:openFiles',
  ]
  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }
}
