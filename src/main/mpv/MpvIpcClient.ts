import * as net from 'net'
import { EventEmitter } from 'events'
import { MpvMessage, isMpvEvent, isMpvResponse } from './mpvTypes'

const PIPE_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\mpvsocket'
  : '/tmp/mpvsocket'
const CONNECT_TIMEOUT_MS = 5000
const RETRY_INTERVAL_MS = 100
const RECONNECT_ATTEMPTS = 10
const RECONNECT_INTERVAL_MS = 1000

export class MpvIpcClient extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = ''
  private requestId = 1
  private pendingRequests = new Map<number, {
    resolve: (data: unknown) => void
    reject: (err: Error) => void
  }>()
  private _autoReconnect = false
  private _reconnecting = false
  private _destroyed = false

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed
  }

  async connect(): Promise<void> {
    const deadline = Date.now() + CONNECT_TIMEOUT_MS

    while (Date.now() < deadline) {
      try {
        await this._tryConnect()
        return
      } catch {
        await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS))
      }
    }

    throw new Error(`mpv IPC pipe not available after ${CONNECT_TIMEOUT_MS}ms`)
  }

  enableAutoReconnect(): void {
    this._autoReconnect = true
  }

  private _tryConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(PIPE_PATH)

      const onError = (err: Error) => {
        socket.destroy()
        reject(err)
      }

      socket.once('error', onError)
      socket.once('connect', () => {
        socket.removeListener('error', onError)
        this.socket = socket
        this._attachHandlers(socket)
        resolve()
      })
    })
  }

  private _attachHandlers(socket: net.Socket): void {
    socket.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8')
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const msg: MpvMessage = JSON.parse(trimmed)
          this._handleMessage(msg)
        } catch {
          // ignore malformed lines
        }
      }
    })

    socket.on('error', (err) => {
      this.emit('error', err)
    })

    socket.on('close', () => {
      this.emit('close')
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error('mpv IPC connection closed'))
        this.pendingRequests.delete(id)
      }
      if (this._autoReconnect && !this._reconnecting && !this._destroyed) {
        this._tryReconnect()
      }
    })
  }

  private async _tryReconnect(): Promise<void> {
    this._reconnecting = true
    this.emit('disconnected')
    console.log('[MpvIpcClient] attempting reconnection...')

    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt++) {
      if (this._destroyed) break
      try {
        await new Promise(r => setTimeout(r, RECONNECT_INTERVAL_MS))
        await this._tryConnect()
        this._reconnecting = false
        console.log('[MpvIpcClient] reconnected')
        this.emit('reconnected')
        return
      } catch {
        console.log(`[MpvIpcClient] reconnect attempt ${attempt + 1}/${RECONNECT_ATTEMPTS} failed`)
      }
    }

    this._reconnecting = false
    console.error('[MpvIpcClient] reconnection failed after all attempts')
    this.emit('reconnect-failed')
  }

  private _handleMessage(msg: MpvMessage): void {
    if (isMpvEvent(msg)) {
      this.emit('mpv-event', msg)
      return
    }

    if (isMpvResponse(msg) && msg.request_id !== undefined) {
      const pending = this.pendingRequests.get(msg.request_id)
      if (pending) {
        this.pendingRequests.delete(msg.request_id)
        if (msg.error === 'success') {
          pending.resolve(msg.data)
        } else {
          pending.reject(new Error(`mpv error: ${msg.error}`))
        }
      }
    }
  }

  sendCommand(command: (string | number | boolean)[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new Error('mpv IPC not connected'))
        return
      }

      const id = this.requestId++
      this.pendingRequests.set(id, { resolve, reject })

      const msg = JSON.stringify({ command, request_id: id }) + '\n'
      this.socket.write(msg, 'utf8', (err) => {
        if (err) {
          this.pendingRequests.delete(id)
          reject(err)
        }
      })

      // Timeout individual commands after 3s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`mpv command timed out: ${command[0]}`))
        }
      }, 3000)
    })
  }

  destroy(): void {
    this._destroyed = true
    this._autoReconnect = false
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    this.pendingRequests.clear()
  }
}
