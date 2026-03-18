import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import * as https from 'https'

const API_BASE = 'https://api.opensubtitles.com/api/v1'
const API_KEY = process.env.OPENSUBTITLES_API_KEY ?? ''
const USER_AGENT = 'CineSync v0.1.0'

interface SubtitleResult {
  id: string
  fileName: string
  language: string
  rating: number
  downloadCount: number
  fileId: number
  release: string
}

interface DownloadResult {
  filePath: string
  fileName: string
}

function httpRequest(url: string, options: https.RequestOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
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

/**
 * Compute OpenSubtitles hash for a file.
 * Algorithm: sum of first and last 64KB as little-endian uint64 + file size.
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const CHUNK_SIZE = 65536
  const stat = fs.statSync(filePath)
  const fileSize = stat.size

  if (fileSize < CHUNK_SIZE * 2) {
    return ''
  }

  const fd = fs.openSync(filePath, 'r')
  const headBuf = Buffer.alloc(CHUNK_SIZE)
  const tailBuf = Buffer.alloc(CHUNK_SIZE)

  fs.readSync(fd, headBuf, 0, CHUNK_SIZE, 0)
  fs.readSync(fd, tailBuf, 0, CHUNK_SIZE, fileSize - CHUNK_SIZE)
  fs.closeSync(fd)

  let hash = BigInt(fileSize)
  for (let i = 0; i < CHUNK_SIZE; i += 8) {
    hash += headBuf.readBigUInt64LE(i)
    hash += tailBuf.readBigUInt64LE(i)
    hash = hash & BigInt('0xFFFFFFFFFFFFFFFF')
  }

  return hash.toString(16).padStart(16, '0')
}

export async function searchSubtitles(
  query: string,
  languages: string[] = ['fr', 'en'],
  fileHash?: string
): Promise<SubtitleResult[]> {
  const params = new URLSearchParams()
  if (fileHash) params.set('moviehash', fileHash)
  else params.set('query', query)
  params.set('languages', languages.join(','))

  const url = `${API_BASE}/subtitles?${params.toString()}`

  const body = await httpRequest(url, {
    method: 'GET',
    headers: {
      'Api-Key': API_KEY,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
    },
  })

  const json = JSON.parse(body)
  const results: SubtitleResult[] = []

  for (const item of json.data ?? []) {
    const attrs = item.attributes
    const file = attrs?.files?.[0]
    if (!file) continue

    results.push({
      id: item.id,
      fileName: file.file_name ?? attrs.release ?? 'Unknown',
      language: attrs.language ?? '??',
      rating: attrs.ratings ?? 0,
      downloadCount: attrs.download_count ?? 0,
      fileId: file.file_id,
      release: attrs.release ?? '',
    })
  }

  return results
}

export async function downloadSubtitle(fileId: number): Promise<DownloadResult> {
  // Step 1: Get download link via POST
  const postData = JSON.stringify({ file_id: fileId })

  const linkResponse = await new Promise<string>((resolve, reject) => {
    const urlObj = new URL(`${API_BASE}/download`)
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Api-Key': API_KEY,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
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
    req.write(postData)
    req.end()
  })

  const linkJson = JSON.parse(linkResponse)
  const downloadUrl = linkJson.link
  const fileName = linkJson.file_name ?? `subtitle_${fileId}.srt`

  if (!downloadUrl) throw new Error('No download link returned')

  // Step 2: Download the file
  const subtitleDir = path.join(app.getPath('temp'), 'cinesync-subs')
  if (!fs.existsSync(subtitleDir)) fs.mkdirSync(subtitleDir, { recursive: true })
  const filePath = path.join(subtitleDir, fileName)

  const fileContent = await new Promise<Buffer>((resolve, reject) => {
    const makeRequest = (url: string) => {
      https.get(url, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location
          if (redirectUrl) return makeRequest(redirectUrl)
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    }
    makeRequest(downloadUrl)
  })

  fs.writeFileSync(filePath, fileContent)

  return { filePath, fileName }
}
