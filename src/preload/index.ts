import { contextBridge, ipcRenderer } from 'electron'

const mpvBridge = {
  // ── Resume playback ─────────────────────────────────────────────────
  getResumePosition: (filePath: string): Promise<number | null> =>
    ipcRenderer.invoke('resume:getPosition', filePath),
  savePosition: (filePath: string, position: number, duration: number) =>
    ipcRenderer.invoke('resume:savePosition', filePath, position, duration),

  // ── Recent files ────────────────────────────────────────────────────
  getRecentFiles: (): Promise<{ filePath: string; fileName: string; position: number; duration: number; timestamp: number }[]> =>
    ipcRenderer.invoke('history:getRecent'),

  // ── File dialogs ────────────────────────────────────────────────────
  openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  openFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFiles'),
  openSubtitleFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openSubtitle'),

  // ── Subtitle operations ─────────────────────────────────────────────
  readSubtitleFile: (filePath: string): Promise<{ content: string; fileName: string }> =>
    ipcRenderer.invoke('subs:readFile', filePath),

  // ── Watch Together (LAN) ────────────────────────────────────────────
  syncHost: (port?: number) => ipcRenderer.invoke('sync:host', port),
  syncJoin: (host: string, port: number, name: string) => ipcRenderer.invoke('sync:join', host, port, name),
  syncSend: (action: 'pause' | 'play' | 'seek', time?: number) => ipcRenderer.invoke('sync:send', action, time),
  syncSendChat: (text: string) => ipcRenderer.invoke('sync:sendChat', text),
  syncSendState: (playing: boolean, time: number) => ipcRenderer.invoke('sync:sendState', playing, time),
  syncStop: () => ipcRenderer.invoke('sync:stop'),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  syncGetLocalIP: (): Promise<string> => ipcRenderer.invoke('sync:getLocalIP'),
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
  onSyncDisconnected: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('sync:disconnected', handler)
    return () => ipcRenderer.removeListener('sync:disconnected', handler)
  },
  onSyncStateRequest: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('sync:state-request', handler)
    return () => ipcRenderer.removeListener('sync:state-request', handler)
  },

  // ── Watch Together (Online relay) ───────────────────────────────────
  relayCreate: (serverUrl: string, name: string): Promise<{ ok: boolean; code: string }> =>
    ipcRenderer.invoke('relay:create', serverUrl, name),
  relayJoin: (serverUrl: string, code: string, name: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('relay:join', serverUrl, code, name),

  // ── Window controls ─────────────────────────────────────────────────
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:isFullscreen'),
  onFullscreenChanged: (cb: (fs: boolean) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, fs: boolean) => cb(fs)
    ipcRenderer.on('window:fullscreen-changed', handler)
    return () => ipcRenderer.removeListener('window:fullscreen-changed', handler)
  },

  // ── Picture-in-Picture ──────────────────────────────────────────────
  windowPip: (): Promise<boolean> => ipcRenderer.invoke('window:pip'),
  isPip: (): Promise<boolean> => ipcRenderer.invoke('window:isPip'),
  onPipChanged: (cb: (pip: boolean) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, pip: boolean) => cb(pip)
    ipcRenderer.on('window:pip-changed', handler)
    return () => ipcRenderer.removeListener('window:pip-changed', handler)
  },

  // ── Theme ───────────────────────────────────────────────────────────
  getTheme: (): Promise<string> => ipcRenderer.invoke('theme:get'),
  setTheme: (color: string) => ipcRenderer.invoke('theme:set', color),

  // ── Audio remux (DTS/AC3 → AAC)
  remuxAudio: (filePath: string): Promise<{ ok: boolean; path?: string }> =>
    ipcRenderer.invoke('audio:remux', filePath),

  // ── Power save (notify main process of playback state)
  notifyPlaying: () => ipcRenderer.send('player:playing'),
  notifyPaused: () => ipcRenderer.send('player:paused'),

  // ── External file (double-click / Open With) ────────────────────────
  onExternalFile: (cb: (filePath: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, filePath: string) => cb(filePath)
    ipcRenderer.on('external-file', handler)
    return () => ipcRenderer.removeListener('external-file', handler)
  },
}

contextBridge.exposeInMainWorld('mpvBridge', mpvBridge)

export type MpvBridge = typeof mpvBridge
