import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

interface ResumeEntry {
  position: number
  duration: number
  timestamp: number
}

const RESUME_FILE = path.join(app.getPath('userData'), 'resume-positions.json')
const MAX_ENTRIES = 500

let data: Record<string, ResumeEntry> = {}

export function loadResumeStore(): void {
  try {
    data = JSON.parse(fs.readFileSync(RESUME_FILE, 'utf8'))
  } catch {
    data = {}
  }
}

function save(): void {
  try {
    fs.writeFileSync(RESUME_FILE, JSON.stringify(data), 'utf8')
  } catch (err) {
    console.error('[resumeStore] save error:', err)
  }
}

export function savePosition(filePath: string, position: number, duration: number): void {
  if (!filePath) return

  // Don't save if near the beginning or end
  if (position < 5 || (duration > 0 && position > duration - 10)) {
    if (data[filePath]) {
      delete data[filePath]
      save()
    }
    return
  }

  data[filePath] = { position, duration, timestamp: Date.now() }

  // Prune old entries
  const entries = Object.entries(data)
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (const [key] of entries.slice(0, entries.length - MAX_ENTRIES)) {
      delete data[key]
    }
  }

  save()
}

export function getResumePosition(filePath: string): number | null {
  const entry = data[filePath]
  if (!entry) return null
  return entry.position
}

export interface RecentFile {
  filePath: string
  fileName: string
  position: number
  duration: number
  timestamp: number
}

export function getRecentFiles(limit = 20): RecentFile[] {
  return Object.entries(data)
    .sort((a, b) => b[1].timestamp - a[1].timestamp)
    .slice(0, limit)
    .map(([filePath, entry]) => ({
      filePath,
      fileName: path.basename(filePath),
      position: entry.position,
      duration: entry.duration,
      timestamp: entry.timestamp,
    }))
}
