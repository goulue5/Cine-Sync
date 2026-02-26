import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

export class MpvProcess {
  private process: ChildProcess | null = null
  private mpvPath: string

  constructor() {
    this.mpvPath = this._resolveMpvPath()
  }

  private _resolveMpvPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'mpv', 'mpv.exe')
    }
    return path.join(app.getAppPath(), 'resources', 'mpv', 'mpv.exe')
  }

  checkExists(): boolean {
    return fs.existsSync(this.mpvPath)
  }

  spawn(hwnd: string): void {
    if (this.process) {
      throw new Error('mpv process already running')
    }

    if (!this.checkExists()) {
      throw new Error(`mpv.exe not found at: ${this.mpvPath}\nDownload from https://sourceforge.net/projects/mpv-player-windows/files/`)
    }

    const args = [
      `--wid=${hwnd}`,
      `--input-ipc-server=\\\\.\\pipe\\mpvsocket`,
      '--no-terminal',
      '--no-osc',
      '--no-osd-bar',
      '--idle=yes',
      '--keep-open=yes',
      '--force-window=immediate',

      // ── Video output: D3D11 GPU (safe — BaseWindow has zero Chromium) ──
      '--vo=gpu',
      '--gpu-api=d3d11',
      '--hwdec=auto-safe',          // hardware decoding (essential for 4K)

      // ── High quality rendering ────────────────────────────────────────
      '--scale=ewa_lanczossharp',   // high quality upscaling
      '--dscale=mitchell',          // clean downscaling
      '--cscale=ewa_lanczossharp',  // chroma upscaling
      '--deband',                   // remove banding artifacts
      '--deband-iterations=4',
      '--deband-threshold=35',
      '--deband-range=16',
      '--deband-grain=5',

      // ── Smooth playback ───────────────────────────────────────────────
      '--video-sync=display-resync',

      // ── HDR ───────────────────────────────────────────────────────────
      '--tone-mapping=auto',
      '--target-colorspace-hint=yes',

      // ── DPI ───────────────────────────────────────────────────────────
      '--hidpi-window-scale=no',
    ]

    this.process = spawn(this.mpvPath, args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      console.log('[mpv stdout]', data.toString().trim())
    })
    this.process.stderr?.on('data', (data: Buffer) => {
      console.log('[mpv stderr]', data.toString().trim())
    })

    this.process.on('error', (err) => {
      console.error('[mpv] process error:', err)
    })

    this.process.on('exit', (code, signal) => {
      console.log(`[mpv] process exited: code=${code} signal=${signal}`)
      this.process = null
    })

    console.log(`[mpv] spawned PID=${this.process.pid} wid=${hwnd}`)
  }

  kill(): void {
    if (this.process && !this.process.killed) {
      console.log('[mpv] killing process')
      this.process.kill('SIGTERM')
      this.process = null
    }
  }

  get isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }

  getMpvPath(): string {
    return this.mpvPath
  }
}
