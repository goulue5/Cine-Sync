import { WebSocket } from 'ws'
import { EventEmitter } from 'events'
import * as https from 'https'
import * as http from 'http'

/**
 * Client for the Cine-Sync relay server (Watch Together online).
 * Connects to a remote relay via WebSocket and joins a room by code.
 *
 * Events emitted:
 * - 'sync'   → SyncMessage (play/pause/seek)
 * - 'chat'   → SyncMessage (chat message)
 * - 'users'  → SyncMessage (user list update)
 * - 'join'   → SyncMessage (user joined)
 * - 'leave'  → SyncMessage (user left)
 * - 'state'  → SyncMessage (playback state)
 * - 'state-request' → (someone needs current state)
 * - 'disconnected'  → ()
 */

interface RelaySyncMessage {
  type: 'sync' | 'chat' | 'join' | 'leave' | 'state' | 'users' | 'state-request'
  action?: 'pause' | 'play' | 'seek'
  time?: number
  playing?: boolean
  text?: string
  from?: string
  name?: string
  users?: string[]
}

function httpRequest(url: string, method: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.request(url, { method }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

export class WatchTogetherRelay extends EventEmitter {
  private ws: WebSocket | null = null
  private name: string
  private serverUrl: string
  private roomCode: string | null = null

  constructor(serverUrl: string, name = 'Guest') {
    super()
    // Normaliser l'URL (enlever le trailing slash)
    this.serverUrl = serverUrl.replace(/\/+$/, '')
    this.name = name
  }

  /** Créer une room sur le serveur relais, retourne le code */
  async createRoom(): Promise<string> {
    const response = await httpRequest(`${this.serverUrl}/room`, 'POST')
    const json = JSON.parse(response)
    this.roomCode = json.code
    return json.code
  }

  /** Vérifier si une room existe */
  async checkRoom(code: string): Promise<boolean> {
    try {
      await httpRequest(`${this.serverUrl}/room/${code}`, 'GET')
      return true
    } catch {
      return false
    }
  }

  /** Se connecter à une room via WebSocket */
  connect(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.roomCode = code.toUpperCase()

      // Convertir http(s) en ws(s)
      const wsUrl = this.serverUrl
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')

      this.ws = new WebSocket(`${wsUrl}/ws/${this.roomCode}`)

      this.ws.on('open', () => {
        console.log(`[relay-client] connected to room ${this.roomCode}`)
        // Envoyer le join
        this.send({ type: 'join', name: this.name })
        resolve()
      })

      this.ws.on('message', (raw) => {
        try {
          const msg: RelaySyncMessage = JSON.parse(raw.toString())
          this.emit(msg.type, msg)
        } catch { /* ignore */ }
      })

      this.ws.on('close', () => {
        console.log('[relay-client] disconnected')
        this.emit('disconnected')
      })

      this.ws.on('error', (err) => {
        console.error('[relay-client] error:', err)
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

  sendState(playing: boolean, time: number): void {
    this.send({ type: 'state', playing, time })
  }

  private send(msg: RelaySyncMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this.roomCode = null
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  get code(): string | null {
    return this.roomCode
  }
}
