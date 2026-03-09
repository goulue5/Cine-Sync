import { BrowserWindow } from 'electron'
import * as path from 'path'

// ── Native addon for fast in-process window positioning ─────────────────────
interface MpvNativeAddon {
  repositionMpvWindow: (pid: number, x: number, y: number, width: number, height: number) => boolean
  checkAccessibility: () => boolean
  requestAccessibility: () => void
}

let native: MpvNativeAddon | null = null
try {
  native = require(path.join(__dirname, '../../build/Release/mpv_native.node'))
} catch (err) {
  console.warn('[mpvWindowSync] native addon not available:', err)
}

let syncTimer: ReturnType<typeof setTimeout> | null = null
let periodicTimer: ReturnType<typeof setInterval> | null = null
let cleanupFn: (() => void) | null = null
let currentPid: number | undefined

// ── Core: reposition mpv window via native Accessibility API ────────────────

function repositionMpvWindow(
  pid: number,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  if (!native) return
  const ok = native.repositionMpvWindow(pid, bounds.x, bounds.y, bounds.width, bounds.height)
  if (!ok) {
    console.warn('[mpvWindowSync] repositionMpvWindow returned false (window not found or no permission)')
  }
}

function debouncedReposition(mainWin: BrowserWindow, pid: number): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    if (!mainWin.isDestroyed()) {
      repositionMpvWindow(pid, mainWin.getBounds())
    }
  }, 16) // ~1 frame at 60fps
}

// ── Public API ───────────────────────────────────────────────────────────────

export function isNativeAvailable(): boolean {
  return native !== null
}

export function hasAccessibility(): boolean {
  return native?.checkAccessibility() ?? false
}

export function promptAccessibility(): void {
  native?.requestAccessibility()
}

/**
 * Start syncing mainWin position/size → mpv's native window via Accessibility API.
 * Returns a cleanup function.
 */
export function startMpvWindowSync(
  mainWin: BrowserWindow,
  pid: number
): () => void {
  if (cleanupFn) cleanupFn()

  if (!native) {
    console.warn('[mpvWindowSync] native addon not loaded, sync disabled')
    return () => {}
  }

  // Check accessibility permissions
  if (!native.checkAccessibility()) {
    console.warn('[mpvWindowSync] no Accessibility permission — requesting...')
    native.requestAccessibility()
  }

  currentPid = pid
  console.log(`[mpvWindowSync] starting native sync (pid=${pid})`)

  // Initial reposition: retry aggressively until mpv's window appears
  let initialSyncDone = false
  const tryInitialSync = () => {
    if (initialSyncDone || mainWin.isDestroyed()) return
    const b = mainWin.getBounds()
    const ok = native!.repositionMpvWindow(pid, b.x, b.y, b.width, b.height)
    if (ok) {
      initialSyncDone = true
      console.log('[mpvWindowSync] initial sync succeeded')
    }
  }
  // Try every 200ms for up to 5 seconds
  for (let delay = 200; delay <= 5000; delay += 200) {
    setTimeout(tryInitialSync, delay)
  }

  const onMove = () => debouncedReposition(mainWin, pid)
  const onResize = () => debouncedReposition(mainWin, pid)
  const onFullscreen = () => {
    setTimeout(() => {
      if (!mainWin.isDestroyed()) repositionMpvWindow(pid, mainWin.getBounds())
    }, 300)
  }

  mainWin.on('move', onMove)
  mainWin.on('resize', onResize)
  mainWin.on('enter-full-screen', onFullscreen)
  mainWin.on('leave-full-screen', onFullscreen)

  // Periodic correction every 2s to catch drift
  periodicTimer = setInterval(() => {
    if (!mainWin.isDestroyed()) {
      repositionMpvWindow(pid, mainWin.getBounds())
    }
  }, 2000)

  cleanupFn = () => {
    mainWin.removeListener('move', onMove)
    mainWin.removeListener('resize', onResize)
    mainWin.removeListener('enter-full-screen', onFullscreen)
    mainWin.removeListener('leave-full-screen', onFullscreen)
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }
    if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null }
    currentPid = undefined
    cleanupFn = null
  }

  return cleanupFn
}

/** Hide mpv's native window (minimize) */
export function hideMpvWindow(): void {
  // Use IPC minimize — no easy AX way to hide another process's window
}

/** Show mpv's native window (restore) */
export function showMpvWindow(): void {
  // Re-trigger reposition on restore
  if (currentPid && native) {
    // Will be repositioned by periodic timer or next move/resize event
  }
}
