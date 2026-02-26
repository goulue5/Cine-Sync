import { contextBridge, ipcRenderer } from 'electron'

type MpvEventCallback = (event: unknown) => void

const mpvBridge = {
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
  openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),

  // Window controls (frame: false → need custom buttons)
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),

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
}

contextBridge.exposeInMainWorld('mpvBridge', mpvBridge)

export type MpvBridge = typeof mpvBridge
