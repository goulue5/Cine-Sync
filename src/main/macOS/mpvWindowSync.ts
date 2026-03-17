import { BrowserWindow, screen } from 'electron'
import * as path from 'path'

// ── Native addon for fast in-process window positioning ─────────────────────
interface MpvWindowBounds {
  x: number; y: number; width: number; height: number
}
interface MpvNativeAddon {
  repositionMpvWindow: (pid: number, x: number, y: number, width: number, height: number) => boolean
  getMpvWindowBounds: (pid: number) => MpvWindowBounds | null
  raiseMpvWindow: (pid: number) => boolean
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
let fastSyncTimer: ReturnType<typeof setInterval> | null = null
let cleanupFn: (() => void) | null = null
let currentPid: number | undefined

// ── Failure tracking to avoid log spam ──────────────────────────────────────
let consecutiveFailures = 0
let lastFailureLog = 0
const FAILURE_LOG_INTERVAL_MS = 30_000
const MAX_FAILURES_BEFORE_STOP = 50

// ── Track previous bounds to detect large changes (fullscreen toggle) ───────
let prevWidth = 0
let prevHeight = 0

// ── Fullscreen state (set from index.ts via notifyFullscreen) ───────────────
let isFullscreen = false

/**
 * Get the correct target bounds for mpv.
 * In fullscreen: use display bounds directly (avoids shadow/offset issues with getBounds).
 * In windowed: use mainWin.getBounds().
 */
function getTargetBounds(mainWin: BrowserWindow): { x: number; y: number; width: number; height: number } {
  if (isFullscreen) {
    const display = screen.getDisplayMatching(mainWin.getBounds())
    return display.bounds // { x: 0, y: 0, width: screenW, height: screenH }
  }
  return mainWin.getBounds()
}

// ── Core: reposition mpv window via native Accessibility API ────────────────

function repositionMpvWindow(
  pid: number,
  bounds: { x: number; y: number; width: number; height: number }
): boolean {
  if (!native) return false
  const ok = native.repositionMpvWindow(pid, bounds.x, bounds.y, bounds.width, bounds.height)
  if (ok) {
    if (consecutiveFailures > 0) {
      console.log(`[mpvWindowSync] recovered after ${consecutiveFailures} failures`)
    }
    consecutiveFailures = 0
  } else {
    consecutiveFailures++
    const now = Date.now()
    if (consecutiveFailures === 1 || now - lastFailureLog > FAILURE_LOG_INTERVAL_MS) {
      console.warn(`[mpvWindowSync] reposition failed (failures: ${consecutiveFailures})`)
      lastFailureLog = now
    }
  }
  return ok
}

function raiseMpvWindow(pid: number): void {
  if (!native) return
  native.raiseMpvWindow(pid)
}

/**
 * Reposition mpv, then verify it actually ended up at the right place.
 * If mpv moved itself (e.g. internal constraints), correct with a second attempt.
 */
function repositionAndVerify(
  pid: number,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  if (!native) return
  const ok = repositionMpvWindow(pid, bounds)
  if (!ok) return

  // Read back actual position and check for drift
  const actual = native.getMpvWindowBounds(pid)
  if (!actual) return

  const dx = Math.abs(actual.x - bounds.x)
  const dy = Math.abs(actual.y - bounds.y)
  const dw = Math.abs(actual.width - bounds.width)
  const dh = Math.abs(actual.height - bounds.height)

  if (dx > 2 || dy > 2 || dw > 2 || dh > 2) {
    console.log(`[mpvWindowSync] drift detected: wanted (${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}) got (${actual.x},${actual.y} ${actual.width}x${actual.height}), correcting...`)
    // Force correct position again
    native.repositionMpvWindow(pid, bounds.x, bounds.y, bounds.width, bounds.height)
  }
}

function debouncedReposition(mainWin: BrowserWindow, pid: number): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    if (!mainWin.isDestroyed()) {
      repositionMpvWindow(pid, getTargetBounds(mainWin))
    }
  }, 16)
}

// ── Fast sync: 50ms interval for a short burst after fullscreen transitions ─
function startFastSync(mainWin: BrowserWindow, pid: number, durationMs: number): void {
  stopFastSync()
  fastSyncTimer = setInterval(() => {
    if (!mainWin.isDestroyed()) {
      const bounds = getTargetBounds(mainWin)
      repositionAndVerify(pid, bounds)
      raiseMpvWindow(pid)
    }
  }, 50)
  setTimeout(stopFastSync, durationMs)
}

function stopFastSync(): void {
  if (fastSyncTimer) { clearInterval(fastSyncTimer); fastSyncTimer = null }
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

/** Notify the sync module of fullscreen state changes (called from index.ts) */
export function notifyFullscreen(fs: boolean): void {
  isFullscreen = fs
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
  consecutiveFailures = 0
  lastFailureLog = 0
  const initBounds = mainWin.getBounds()
  prevWidth = initBounds.width
  prevHeight = initBounds.height
  console.log(`[mpvWindowSync] starting native sync (pid=${pid})`)

  // Initial reposition: retry aggressively until mpv's window appears
  let initialSyncDone = false
  const tryInitialSync = () => {
    if (initialSyncDone || mainWin.isDestroyed()) return
    const b = getTargetBounds(mainWin)
    const ok = native!.repositionMpvWindow(pid, b.x, b.y, b.width, b.height)
    if (ok) {
      initialSyncDone = true
      native!.raiseMpvWindow(pid)
      console.log('[mpvWindowSync] initial sync succeeded')
    }
  }
  for (let delay = 200; delay <= 5000; delay += 200) {
    setTimeout(tryInitialSync, delay)
  }

  const onMove = () => debouncedReposition(mainWin, pid)

  const onResize = () => {
    if (mainWin.isDestroyed()) return
    const b = mainWin.getBounds()
    const dw = Math.abs(b.width - prevWidth)
    const dh = Math.abs(b.height - prevHeight)
    prevWidth = b.width
    prevHeight = b.height

    // Large size change (>200px) = likely fullscreen toggle → aggressive sync
    if (dw > 200 || dh > 200) {
      startFastSync(mainWin, pid, 2000)
    } else {
      debouncedReposition(mainWin, pid)
    }
  }

  mainWin.on('move', onMove)
  mainWin.on('resize', onResize)
  // Also listen to enter/leave-full-screen as fallback (may fire with setSimpleFullScreen on some macOS versions)
  const onFullscreen = () => {
    startFastSync(mainWin, pid, 2000)
  }
  mainWin.on('enter-full-screen', onFullscreen)
  mainWin.on('leave-full-screen', onFullscreen)

  // Periodic correction every 2s to catch drift
  periodicTimer = setInterval(() => {
    if (!mainWin.isDestroyed()) {
      repositionAndVerify(pid, getTargetBounds(mainWin))
      if (consecutiveFailures >= MAX_FAILURES_BEFORE_STOP) {
        console.warn('[mpvWindowSync] too many failures, stopping periodic sync. Grant Accessibility permission and restart.')
        if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null }
      }
    }
  }, 2000)

  cleanupFn = () => {
    mainWin.removeListener('move', onMove)
    mainWin.removeListener('resize', onResize)
    mainWin.removeListener('enter-full-screen', onFullscreen)
    mainWin.removeListener('leave-full-screen', onFullscreen)
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }
    if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null }
    stopFastSync()
    currentPid = undefined
    cleanupFn = null
  }

  return cleanupFn
}
