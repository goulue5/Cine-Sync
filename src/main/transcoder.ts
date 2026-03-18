import { spawn, spawnSync, ChildProcess } from 'child_process'
import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import { existsSync } from 'fs'

let server: Server | null = null
let serverPort: number | null = null
let currentProcess: ChildProcess | null = null

function findBinary(name: string): string {
  const candidates = [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return name // fallback to PATH
}

function findFfmpeg(): string {
  return findBinary('ffmpeg')
}

function findFfprobe(): string {
  return findBinary('ffprobe')
}

/** Get duration in seconds using ffprobe (safe, no shell) */
function probeDuration(filePath: string): number {
  try {
    const result = spawnSync(findFfprobe(), [
      '-v', 'quiet', '-print_format', 'json', '-show_format', filePath,
    ], { encoding: 'utf8', timeout: 10000 })
    const json = JSON.parse(result.stdout)
    return parseFloat(json.format?.duration ?? '0')
  } catch {
    return 0
  }
}

function handleStream(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://localhost`)
  const filePath = url.searchParams.get('path')

  if (!filePath) {
    res.writeHead(400)
    res.end('Missing path parameter')
    return
  }

  // Kill any previous transcoding process
  if (currentProcess) {
    currentProcess.kill('SIGTERM')
    currentProcess = null
  }

  console.log('[transcoder] starting ffmpeg for:', filePath)

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
    'Transfer-Encoding': 'chunked',
  })

  const isMac = process.platform === 'darwin'

  const args = [
    '-i', filePath,
    '-pix_fmt', 'yuv420p',
  ]

  if (isMac) {
    // Hardware-accelerated encoding via Apple VideoToolbox (GPU, full quality)
    args.push('-c:v', 'h264_videotoolbox', '-q:v', '65')
  } else {
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18')
  }

  args.push(
    '-c:a', 'aac',
    '-b:a', '192k',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+faststart',
    '-y',
    'pipe:1',
  )

  const ffmpeg = spawn(findFfmpeg(), args, { stdio: ['pipe', 'pipe', 'pipe'] })

  currentProcess = ffmpeg

  ffmpeg.stdout.pipe(res)

  ffmpeg.stderr.on('data', (data) => {
    const line = data.toString().trim()
    if (line.includes('frame=') || line.includes('Stream')) {
      console.log('[transcoder]', line)
    }
  })

  ffmpeg.on('close', (code) => {
    console.log(`[transcoder] ffmpeg exited with code ${code}`)
    currentProcess = null
    if (!res.writableEnded) res.end()
  })

  ffmpeg.on('error', (err) => {
    console.error('[transcoder] ffmpeg error:', err)
    currentProcess = null
    if (!res.writableEnded) res.end()
  })

  // Clean up if client disconnects
  req.on('close', () => {
    if (currentProcess === ffmpeg) {
      ffmpeg.kill('SIGTERM')
      currentProcess = null
    }
  })
}

/** Start the local transcoding HTTP server. Returns the port. */
export function startTranscoder(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server && serverPort) {
      resolve(serverPort)
      return
    }

    server = createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*' })
        res.end()
        return
      }

      const url = new URL(req.url ?? '/', 'http://localhost')

      // GET /info?path=... → return real duration
      if (url.pathname === '/info') {
        const filePath = url.searchParams.get('path')
        if (!filePath) { res.writeHead(400); res.end(); return }
        const duration = probeDuration(filePath)
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ duration }))
        return
      }

      handleStream(req, res)
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      if (addr && typeof addr === 'object') {
        serverPort = addr.port
        console.log(`[transcoder] server listening on port ${serverPort}`)
        resolve(serverPort)
      } else {
        reject(new Error('Failed to start transcoder server'))
      }
    })

    server.on('error', reject)
  })
}

export function stopTranscoder(): void {
  if (currentProcess) {
    currentProcess.kill('SIGTERM')
    currentProcess = null
  }
  if (server) {
    server.close()
    server = null
    serverPort = null
  }
}
