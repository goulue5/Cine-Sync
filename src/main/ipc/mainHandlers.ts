import { ipcMain, BrowserWindow, dialog } from 'electron'
import * as os from 'os'
import * as fs from 'fs'
import { savePosition, getResumePosition, getRecentFiles } from '../resumeStore'
import { searchSubtitles, downloadSubtitle, computeFileHash } from '../subtitles/opensubtitles'
import { WatchTogetherHost, WatchTogetherClient, SyncMessage } from '../sync/watchTogether'
import { WatchTogetherRelay } from '../sync/watchTogetherRelay'

let syncHost: WatchTogetherHost | null = null
let syncClient: WatchTogetherClient | null = null
let syncRelay: WatchTogetherRelay | null = null

export function registerMainHandlers(win: BrowserWindow): void {
  // ── Resume playback ───────────────────────────────────────────────────
  ipcMain.handle('resume:getPosition', (_e, filePath: string) => {
    return getResumePosition(filePath)
  })

  ipcMain.handle('resume:savePosition', (_e, filePath: string, position: number, duration: number) => {
    savePosition(filePath, position, duration)
  })

  // ── Recent files ───────────────────────────────────────────────────
  ipcMain.handle('history:getRecent', () => getRecentFiles())

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

  // ── Read subtitle file and convert SRT → VTT ─────────────────────────
  ipcMain.handle('subs:readFile', (_e, filePath: string) => {
    try {
      let content = fs.readFileSync(filePath, 'utf8')
      // SRT → VTT conversion
      if (filePath.toLowerCase().endsWith('.srt')) {
        content = 'WEBVTT\n\n' + content
          .replace(/\r\n/g, '\n')
          .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      }
      return { content, fileName: filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'subtitle' }
    } catch (err) {
      console.error('[subs] read error:', err)
      throw err
    }
  })

  // ── Subtitle search (OpenSubtitles) ──────────────────────────────────
  ipcMain.handle('subs:search', async (_e, query: string, filePath?: string) => {
    try {
      let hash: string | undefined
      if (filePath) {
        hash = await computeFileHash(filePath)
      }
      return await searchSubtitles(query, ['fr', 'en'], hash || undefined)
    } catch (err) {
      console.error('[subs] search error:', err)
      return []
    }
  })

  ipcMain.handle('subs:download', async (_e, fileId: number) => {
    try {
      const result = await downloadSubtitle(fileId)
      // Read the downloaded file and convert to VTT
      let content = fs.readFileSync(result.filePath, 'utf8')
      if (result.filePath.toLowerCase().endsWith('.srt')) {
        content = 'WEBVTT\n\n' + content
          .replace(/\r\n/g, '\n')
          .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      }
      return { ...result, vttContent: content }
    } catch (err) {
      console.error('[subs] download error:', err)
      throw err
    }
  })

  // ── Watch Together (LAN) ──────────────────────────────────────────────
  ipcMain.handle('sync:host', async (_e, port?: number) => {
    if (syncHost?.isRunning) return { ok: true, port }
    syncHost = new WatchTogetherHost(port ?? 9876)
    const actualPort = await syncHost.start()

    syncHost.on('sync', (msg: SyncMessage) => {
      if (!win.isDestroyed()) win.webContents.send('sync:action', msg)
    })
    syncHost.on('users', (users: string[]) => {
      if (!win.isDestroyed()) win.webContents.send('sync:users', users)
    })
    syncHost.on('user-joined', (name: string) => {
      if (!win.isDestroyed()) win.webContents.send('sync:user-joined', name)
    })
    syncHost.on('user-left', (name: string) => {
      if (!win.isDestroyed()) win.webContents.send('sync:user-left', name)
    })
    syncHost.on('chat', (msg: SyncMessage) => {
      if (!win.isDestroyed()) win.webContents.send('sync:chat', msg)
    })

    return { ok: true, port: actualPort }
  })

  ipcMain.handle('sync:join', async (_e, host: string, port: number, name: string) => {
    syncClient = new WatchTogetherClient(name)
    await syncClient.connect(host, port)

    syncClient.on('sync', (msg: SyncMessage) => {
      if (!win.isDestroyed()) win.webContents.send('sync:action', msg)
    })
    syncClient.on('users', (msg: SyncMessage) => {
      if (!win.isDestroyed()) win.webContents.send('sync:users', msg.users ?? [])
    })
    syncClient.on('state', (msg: SyncMessage) => {
      if (!win.isDestroyed()) win.webContents.send('sync:action', msg)
    })
    syncClient.on('disconnected', () => {
      if (!win.isDestroyed()) win.webContents.send('sync:disconnected')
    })
    syncClient.on('chat', (msg: SyncMessage) => {
      if (!win.isDestroyed()) win.webContents.send('sync:chat', msg)
    })

    return { ok: true }
  })

  ipcMain.handle('sync:send', (_e, action: 'pause' | 'play' | 'seek', time?: number) => {
    if (syncHost?.isRunning) syncHost.sendSync(action, time)
    else if (syncClient?.isConnected) syncClient.sendSync(action, time)
    else if (syncRelay?.isConnected) syncRelay.sendSync(action, time)
  })

  ipcMain.handle('sync:sendChat', (_e, text: string) => {
    if (syncHost?.isRunning) {
      const msg: SyncMessage = { type: 'chat', text, from: 'Hôte' }
      syncHost.broadcast(msg)
      if (!win.isDestroyed()) win.webContents.send('sync:chat', msg)
    } else if (syncClient?.isConnected) {
      syncClient.sendChat(text)
    } else if (syncRelay?.isConnected) {
      syncRelay.sendChat(text)
    }
  })

  ipcMain.handle('sync:sendState', (_e, playing: boolean, time: number) => {
    if (syncRelay?.isConnected) syncRelay.sendState(playing, time)
  })

  ipcMain.handle('sync:getLocalIP', () => {
    const nets = os.networkInterfaces()
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address
        }
      }
    }
    return '127.0.0.1'
  })

  ipcMain.handle('sync:stop', () => {
    syncHost?.stop()
    syncHost = null
    syncClient?.disconnect()
    syncClient = null
    syncRelay?.disconnect()
    syncRelay = null
  })

  ipcMain.handle('sync:status', () => {
    if (syncHost?.isRunning) return { role: 'host', users: syncHost.userCount }
    if (syncClient?.isConnected) return { role: 'client' }
    if (syncRelay?.isConnected) return { role: 'relay', code: syncRelay.code }
    return { role: null }
  })

  // ── Watch Together Online (relay) ─────────────────────────────────────
  ipcMain.handle('relay:create', async (_e, serverUrl: string, name: string) => {
    syncRelay = new WatchTogetherRelay(serverUrl, name)
    try {
      const code = await syncRelay.createRoom()
      await syncRelay.connect(code)

      syncRelay.on('sync', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:action', msg)
      })
      syncRelay.on('users', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:users', msg.users ?? [])
      })
      syncRelay.on('join', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:user-joined', msg.name ?? 'Guest')
      })
      syncRelay.on('leave', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:user-left', msg.name ?? 'Guest')
      })
      syncRelay.on('chat', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:chat', msg)
      })
      syncRelay.on('state-request', () => {
        if (!win.isDestroyed()) win.webContents.send('sync:state-request')
      })
      syncRelay.on('disconnected', () => {
        if (!win.isDestroyed()) win.webContents.send('sync:disconnected')
      })

      return { ok: true, code }
    } catch (err) {
      syncRelay = null
      throw err
    }
  })

  ipcMain.handle('relay:join', async (_e, serverUrl: string, code: string, name: string) => {
    syncRelay = new WatchTogetherRelay(serverUrl, name)
    try {
      const exists = await syncRelay.checkRoom(code)
      if (!exists) throw new Error('Room introuvable')

      await syncRelay.connect(code)

      syncRelay.on('sync', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:action', msg)
      })
      syncRelay.on('users', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:users', msg.users ?? [])
      })
      syncRelay.on('join', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:user-joined', msg.name ?? 'Guest')
      })
      syncRelay.on('leave', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:user-left', msg.name ?? 'Guest')
      })
      syncRelay.on('chat', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:chat', msg)
      })
      syncRelay.on('state', (msg: SyncMessage) => {
        if (!win.isDestroyed()) win.webContents.send('sync:action', msg)
      })
      syncRelay.on('disconnected', () => {
        if (!win.isDestroyed()) win.webContents.send('sync:disconnected')
      })

      return { ok: true }
    } catch (err) {
      syncRelay = null
      throw err
    }
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

export function unregisterMainHandlers(): void {
  syncHost?.stop()
  syncHost = null
  syncClient?.disconnect()
  syncClient = null
  syncRelay?.disconnect()
  syncRelay = null

  const channels = [
    'resume:getPosition', 'resume:savePosition',
    'history:getRecent',
    'dialog:openSubtitle', 'dialog:openFiles',
    'subs:readFile', 'subs:search', 'subs:download',
    'sync:host', 'sync:join', 'sync:send', 'sync:sendChat', 'sync:sendState', 'sync:getLocalIP', 'sync:stop', 'sync:status',
    'relay:create', 'relay:join',
  ]
  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }
}
