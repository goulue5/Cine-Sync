import * as net from 'net'
import { EventEmitter } from 'events'
import { MpvMessage, isMpvEvent, isMpvResponse } from './mpvTypes'

const PIPE_PATH = '\\\\.\\pipe\\mpvsocket'
const CONNECT_TIMEOUT_MS = 5000
const RETRY_INTERVAL_MS = 100

export class MpvIpcClient extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = ''
  private requestId = 1
  private pendingRequests = new Map<number, {
    resolve: (data: unknown) => void
    reject: (err: Error) => void
  }>()

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
    })
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
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    this.pendingRequests.clear()
  }
}
