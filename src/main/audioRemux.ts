import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

function findFfmpeg(): string {
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return 'ffmpeg'
}

/**
 * Remux a file: copy video as-is, convert audio to AAC.
 * This is very fast because only audio is re-encoded.
 * Returns the path to the remuxed file.
 */
export function remuxAudio(inputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempDir = app.getPath('temp')
    const baseName = inputPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'remuxed'
    const outputPath = join(tempDir, `${baseName}_aac.mp4`)

    // Skip if already remuxed
    if (existsSync(outputPath)) {
      resolve(outputPath)
      return
    }

    console.log('[remux] converting audio to AAC:', inputPath)

    const ffmpeg = spawn(findFfmpeg(), [
      '-i', inputPath,
      '-c:v', 'copy',      // video: copy as-is (no re-encoding, instant)
      '-c:a', 'aac',       // audio: convert to AAC
      '-b:a', '192k',
      '-y',                 // overwrite
      outputPath,
    ])

    ffmpeg.stderr.on('data', (data) => {
      const line = data.toString().trim()
      if (line.includes('time=')) {
        const match = line.match(/time=(\d{2}:\d{2}:\d{2})/)
        if (match) console.log('[remux] progress:', match[1])
      }
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('[remux] done:', outputPath)
        resolve(outputPath)
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`))
      }
    })

    ffmpeg.on('error', reject)
  })
}
