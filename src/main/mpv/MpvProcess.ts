import { spawn, execFileSync, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { buildQualityFlags, DisplayInfo } from './displayProfile'

const IS_WINDOWS = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

export const IPC_PATH = IS_WINDOWS
  ? '\\\\.\\pipe\\mpvsocket'
  : '/tmp/mpvsocket'

export interface MpvSpawnOptions {
  /** Native window handle for --wid embedding (HWND on Windows only) */
  wid?: string
  /** Initial window geometry for macOS (e.g. "1280x720+0+23") */
  geometry?: string
  /** Display info for adaptive quality flags */
  displayInfo?: DisplayInfo
}

export class MpvProcess {
  private process: ChildProcess | null = null
  private mpvPath: string

  constructor() {
    this.mpvPath = this._resolveMpvPath()
  }

  private _resolveMpvPath(): string {
    // Windows: bundled mpv.exe
    if (IS_WINDOWS) {
      if (app.isPackaged) {
        return path.join(process.resourcesPath, 'mpv', 'mpv.exe')
      }
      return path.join(app.getAppPath(), 'resources', 'mpv', 'mpv.exe')
    }

    // macOS / Linux: check common paths then PATH
    const candidates = [
      '/opt/homebrew/bin/mpv',   // macOS Apple Silicon
      '/usr/local/bin/mpv',      // macOS Intel
      '/usr/bin/mpv',            // Linux
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
    try {
      return execFileSync('which', ['mpv'], { encoding: 'utf8' }).trim()
    } catch {
      return 'mpv'
    }
  }

  checkExists(): boolean {
    if (this.mpvPath === 'mpv') return false
    return fs.existsSync(this.mpvPath)
  }

  spawn(options: MpvSpawnOptions): void {
    if (this.process) {
      throw new Error('mpv process already running')
    }

    if (!this.checkExists()) {
      const hint = IS_WINDOWS
        ? 'Download from https://sourceforge.net/projects/mpv-player-windows/files/'
        : 'Install with: brew install mpv'
      throw new Error(`mpv not found at: ${this.mpvPath}\n${hint}`)
    }

    // Kill any stale mpv process using our IPC socket from a previous run
    if (!IS_WINDOWS) {
      try {
        execFileSync('pkill', ['-f', `input-ipc-server=${IPC_PATH}`], { stdio: 'ignore' })
        // Give it a moment to die
      } catch { /* no matching process — fine */ }
      try { fs.unlinkSync(IPC_PATH) } catch { /* ignore */ }
    }

    const args = [
      `--input-ipc-server=${IPC_PATH}`,
      '--no-terminal',
      '--no-osc',
      '--no-osd-bar',
      '--idle=yes',
      '--keep-open=yes',

      // ── Hardware decoding ─────────────────────────────────────────────
      '--hwdec=auto-safe',
    ]

    // ── Display-adaptive quality flags ─────────────────────────────────────
    if (options.displayInfo) {
      args.push(...buildQualityFlags(options.displayInfo, process.platform))
    }

    // ── Platform-specific window flags ──────────────────────────────────────
    if (options.wid) {
      args.push(`--wid=${options.wid}`)
      if (IS_WINDOWS) {
        args.push('--hidpi-window-scale=no')
      }
    } else if (IS_MAC) {
      // macOS: standalone borderless window — positioned via Accessibility API
      args.push(
        '--force-window=immediate',
        '--no-border',
        '--native-fs=no',
        '--keepaspect-window=no',
        '--on-all-workspaces=yes',
      )
      if (options.geometry) {
        args.push(`--geometry=${options.geometry}`)
      }
    } else {
      // Linux fallback: standalone mpv window
      args.push('--force-window=immediate')
    }

    args.push('--msg-level=all=v')

    console.log('[mpv] spawn args:', args.join(' '))

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

    console.log(`[mpv] spawned PID=${this.process.pid} platform=${process.platform}`)
  }

  kill(): void {
    if (this.process && !this.process.killed) {
      console.log('[mpv] killing process')
      this.process.kill('SIGTERM')
      this.process = null
    }
  }

  get pid(): number | undefined {
    return this.process?.pid
  }

  get isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }

  getMpvPath(): string {
    return this.mpvPath
  }
}
