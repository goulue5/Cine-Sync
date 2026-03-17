import { WebSocketServer, WebSocket } from 'ws'
import { EventEmitter } from 'events'

/**
 * Watch Together protocol messages:
 * - { type: 'sync', action: 'pause' | 'play' | 'seek', time?: number }
 * - { type: 'chat', text: string, from: string }
 * - { type: 'join', name: string }
 * - { type: 'leave', name: string }
 * - { type: 'state', playing: boolean, time: number }
 * - { type: 'users', users: string[] }
 */

export interface SyncMessage {
  type: 'sync' | 'chat' | 'join' | 'leave' | 'state' | 'users'
  action?: 'pause' | 'play' | 'seek'
  time?: number
  playing?: boolean
  text?: string
  from?: string
  name?: string
  users?: string[]
}

export class WatchTogetherHost extends EventEmitter {
  private wss: WebSocketServer | null = null
  private clients = new Map<WebSocket, string>() // ws → username
  private port: number

  constructor(port = 9876) {
    super()
    this.port = port
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        console.log(`[sync] host started on port ${this.port}`)
        resolve(this.port)
      })

      this.wss.on('error', (err) => {
        console.error('[sync] server error:', err)
        reject(err)
      })

      this.wss.on('connection', (ws) => {
        console.log('[sync] new client connected')

        ws.on('message', (raw) => {
          try {
            const msg: SyncMessage = JSON.parse(raw.toString())
            this.handleMessage(ws, msg)
          } catch { /* ignore malformed */ }
        })

        ws.on('close', () => {
          const name = this.clients.get(ws)
          if (name) {
            this.clients.delete(ws)
            this.broadcast({ type: 'leave', name })
            this.broadcastUsers()
            this.emit('user-left', name)
          }
        })
      })
    })
  }

  private handleMessage(ws: WebSocket, msg: SyncMessage): void {
    switch (msg.type) {
      case 'join':
        this.clients.set(ws, msg.name ?? 'Guest')
        this.broadcastUsers()
        this.emit('user-joined', msg.name)
        // Send current state to new user
        this.emit('state-request', (state: SyncMessage) => {
          ws.send(JSON.stringify(state))
        })
        break

      case 'sync':
        // Forward sync actions from any client to all others + host
        this.broadcast(msg, ws)
        this.emit('sync', msg)
        break

      case 'chat':
        msg.from = this.clients.get(ws) ?? 'Guest'
        this.broadcast(msg)
        this.emit('chat', msg)
        break
    }
  }

  /** Broadcast to all connected clients (optionally exclude sender) */
  broadcast(msg: SyncMessage, exclude?: WebSocket): void {
    const data = JSON.stringify(msg)
    this.wss?.clients.forEach((client) => {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    })
  }

  /** Send sync action from host to all clients */
  sendSync(action: 'pause' | 'play' | 'seek', time?: number): void {
    this.broadcast({ type: 'sync', action, time })
  }

  private broadcastUsers(): void {
    const users = ['Hôte', ...Array.from(this.clients.values())]
    this.broadcast({ type: 'users', users })
    this.emit('users', users)
  }

  stop(): void {
    this.wss?.clients.forEach((c) => c.close())
    this.wss?.close()
    this.wss = null
    this.clients.clear()
    console.log('[sync] host stopped')
  }

  get userCount(): number {
    return this.clients.size + 1 // +1 for host
  }

  get isRunning(): boolean {
    return this.wss !== null
  }
}

export class WatchTogetherClient extends EventEmitter {
  private ws: WebSocket | null = null
  private name: string

  constructor(name = 'Guest') {
    super()
    this.name = name
  }

  connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://${host}:${port}`)

      this.ws.on('open', () => {
        console.log(`[sync] connected to ${host}:${port}`)
        this.ws!.send(JSON.stringify({ type: 'join', name: this.name }))
        resolve()
      })

      this.ws.on('message', (raw) => {
        try {
          const msg: SyncMessage = JSON.parse(raw.toString())
          this.emit(msg.type, msg)
        } catch { /* ignore */ }
      })

      this.ws.on('close', () => {
        console.log('[sync] disconnected')
        this.emit('disconnected')
      })

      this.ws.on('error', (err) => {
        console.error('[sync] client error:', err)
        reject(err)
      })
    })
  }

  sendSync(action: 'pause' | 'play' | 'seek', time?: number): void {
    this.send({ type: 'sync', action, time })
  }

  sendChat(text: string): void {
    this.send({ type: 'chat', text, from: this.name })
  }

  private send(msg: SyncMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
