import { contextBridge, ipcRenderer } from 'electron'

type MpvEventCallback = (event: unknown) => void

const mpvBridge = {
  // Playback
  loadFile: (filePath: string) => ipcRenderer.invoke('mpv:loadFile', filePath),
  play: () => ipcRenderer.invoke('mpv:play'),
  pause: () => ipcRenderer.invoke('mpv:pause'),
  togglePause: () => ipcRenderer.invoke('mpv:togglePause'),
  seek: (seconds: number, mode: 'absolute' | 'relative' = 'absolute') =>
    ipcRenderer.invoke('mpv:seek', seconds, mode),
  setVolume: (volume: number) => ipcRenderer.invoke('mpv:setVolume', volume),
  setMute: (mute: boolean) => ipcRenderer.invoke('mpv:setMute', mute),
  stop: () => ipcRenderer.invoke('mpv:stop'),
  getProperty: (name: string) => ipcRenderer.invoke('mpv:getProperty', name),
  setProperty: (name: string, value: unknown) => ipcRenderer.invoke('mpv:setProperty', name, value),

  // Tracks
  getTrackList: (): Promise<unknown> => ipcRenderer.invoke('mpv:getTrackList'),
  setAudioTrack: (id: number | 'auto' | 'no') => ipcRenderer.invoke('mpv:setAudioTrack', id),
  setSubtitleTrack: (id: number | 'auto' | 'no') => ipcRenderer.invoke('mpv:setSubtitleTrack', id),

  // Subtitles
  addSubtitle: (filePath: string) => ipcRenderer.invoke('mpv:addSubtitle', filePath),
  openSubtitleFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openSubtitle'),

  // Playback options
  setSpeed: (speed: number) => ipcRenderer.invoke('mpv:setSpeed', speed),
  setSubDelay: (seconds: number) => ipcRenderer.invoke('mpv:setSubDelay', seconds),
  setAudioDelay: (seconds: number) => ipcRenderer.invoke('mpv:setAudioDelay', seconds),

  // Resume playback
  getResumePosition: (filePath: string): Promise<number | null> =>
    ipcRenderer.invoke('mpv:getResumePosition', filePath),

  // Recent files
  getRecentFiles: (): Promise<{ filePath: string; fileName: string; position: number; duration: number; timestamp: number }[]> =>
    ipcRenderer.invoke('history:getRecent'),

  // File dialogs
  openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  openFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFiles'),

  // Subtitle search
  searchSubtitles: (query: string, filePath?: string) =>
    ipcRenderer.invoke('subs:search', query, filePath),
  downloadSubtitle: (fileId: number) =>
    ipcRenderer.invoke('subs:download', fileId),

  // Watch Together (LAN)
  syncHost: (port?: number) => ipcRenderer.invoke('sync:host', port),
  syncJoin: (host: string, port: number, name: string) => ipcRenderer.invoke('sync:join', host, port, name),
  syncSend: (action: 'pause' | 'play' | 'seek', time?: number) => ipcRenderer.invoke('sync:send', action, time),
  syncSendState: (playing: boolean, time: number) => ipcRenderer.invoke('sync:sendState', playing, time),
  syncStop: () => ipcRenderer.invoke('sync:stop'),
  syncStatus: () => ipcRenderer.invoke('sync:status'),

  // Watch Together (Online relay)
  relayCreate: (serverUrl: string, name: string): Promise<{ ok: boolean; code: string }> =>
    ipcRenderer.invoke('relay:create', serverUrl, name),
  relayJoin: (serverUrl: string, code: string, name: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('relay:join', serverUrl, code, name),
  onSyncStateRequest: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('sync:state-request', handler)
    return () => ipcRenderer.removeListener('sync:state-request', handler)
  },
  onSyncAction: (cb: (msg: unknown) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: unknown) => cb(msg)
    ipcRenderer.on('sync:action', handler)
    return () => ipcRenderer.removeListener('sync:action', handler)
  },
  onSyncUsers: (cb: (users: string[]) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, users: string[]) => cb(users)
    ipcRenderer.on('sync:users', handler)
    return () => ipcRenderer.removeListener('sync:users', handler)
  },
  onSyncUserJoined: (cb: (name: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('sync:user-joined', handler)
    return () => ipcRenderer.removeListener('sync:user-joined', handler)
  },
  onSyncUserLeft: (cb: (name: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('sync:user-left', handler)
    return () => ipcRenderer.removeListener('sync:user-left', handler)
  },
  onSyncChat: (cb: (msg: { from: string; text: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: { from: string; text: string }) => cb(msg)
    ipcRenderer.on('sync:chat', handler)
    return () => ipcRenderer.removeListener('sync:chat', handler)
  },
  syncSendChat: (text: string) => ipcRenderer.invoke('sync:sendChat', text),
  syncGetLocalIP: (): Promise<string> => ipcRenderer.invoke('sync:getLocalIP'),
  onSyncDisconnected: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('sync:disconnected', handler)
    return () => ipcRenderer.removeListener('sync:disconnected', handler)
  },

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:isFullscreen'),
  onFullscreenChanged: (cb: (fs: boolean) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, fs: boolean) => cb(fs)
    ipcRenderer.on('window:fullscreen-changed', handler)
    return () => ipcRenderer.removeListener('window:fullscreen-changed', handler)
  },

  // Picture-in-Picture
  windowPip: (): Promise<boolean> => ipcRenderer.invoke('window:pip'),
  isPip: (): Promise<boolean> => ipcRenderer.invoke('window:isPip'),
  onPipChanged: (cb: (pip: boolean) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, pip: boolean) => cb(pip)
    ipcRenderer.on('window:pip-changed', handler)
    return () => ipcRenderer.removeListener('window:pip-changed', handler)
  },

  // Theme
  getTheme: (): Promise<string> => ipcRenderer.invoke('theme:get'),
  setTheme: (color: string) => ipcRenderer.invoke('theme:set', color),

  // Events
  onMpvEvent: (cb: MpvEventCallback): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: unknown) => cb(event)
    ipcRenderer.on('mpv:event', handler)
    return () => ipcRenderer.removeListener('mpv:event', handler)
  },
  onMpvError: (cb: MpvEventCallback): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, error: unknown) => cb(error)
    ipcRenderer.on('mpv:error', handler)
    return () => ipcRenderer.removeListener('mpv:error', handler)
  },
  onMpvResumed: (cb: (data: { position: number }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { position: number }) => cb(data)
    ipcRenderer.on('mpv:resumed', handler)
    return () => ipcRenderer.removeListener('mpv:resumed', handler)
  },
}

contextBridge.exposeInMainWorld('mpvBridge', mpvBridge)

export type MpvBridge = typeof mpvBridge
