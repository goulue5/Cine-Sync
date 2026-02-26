import React, { useEffect, useRef, useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { useMpv } from '../../hooks/useMpv'
import { DragZone } from '../player/DragZone'
import { ControlBar } from '../player/ControlBar'
import { SettingsPanel } from '../player/SettingsPanel'

const CONTROLS_HIDE_DELAY = 3000

export function PlayerShell(): React.ReactElement {
  useMpv()

  const controlsVisible = usePlayerStore(s => s.controlsVisible)
  const setControlsVisible = usePlayerStore(s => s.setControlsVisible)
  const fileName = usePlayerStore(s => s.fileName)
  const settingsOpen = usePlayerStore(s => s.settingsOpen)
  const setSettingsOpen = usePlayerStore(s => s.setSettingsOpen)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (fileName) {
      hideTimer.current = setTimeout(() => {
        setControlsVisible(false)
      }, CONTROLS_HIDE_DELAY)
    }
  }, [fileName, setControlsVisible])

  useEffect(() => {
    if (!fileName) {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setControlsVisible(true)
    } else {
      showControls()
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [fileName, setControlsVisible, showControls])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          window.mpvBridge.togglePause()
          showControls()
          break
        case 'ArrowRight':
          e.preventDefault()
          window.mpvBridge.seek(5, 'relative')
          showControls()
          break
        case 'ArrowLeft':
          e.preventDefault()
          window.mpvBridge.seek(-5, 'relative')
          showControls()
          break
        case 'ArrowUp':
          e.preventDefault()
          window.mpvBridge.setVolume(Math.min(130, usePlayerStore.getState().volume + 5))
          showControls()
          break
        case 'ArrowDown':
          e.preventDefault()
          window.mpvBridge.setVolume(Math.max(0, usePlayerStore.getState().volume - 5))
          showControls()
          break
        case 'KeyM':
          window.mpvBridge.setMute(!usePlayerStore.getState().mute)
          break
        case 'KeyF':
          window.mpvBridge.windowMaximize()
          break
        case 'Escape':
          if (settingsOpen) setSettingsOpen(false)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showControls, settingsOpen, setSettingsOpen])

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      onMouseMove={showControls}
      onMouseEnter={showControls}
    >
      {/* Black background — ONLY when no video is loaded */}
      {!fileName && (
        <div className="absolute inset-0 bg-black" />
      )}

      {/* Title bar drag region + window controls (z-30, always visible)
          background rgba(0,0,0,0.01) so transparent window still captures clicks */}
      <div
        className="absolute top-0 left-0 right-0 z-30 flex items-center justify-end"
        style={{
          height: '32px',
          background: 'rgba(0,0,0,0.01)',
          // @ts-expect-error WebkitAppRegion is valid in Electron
          WebkitAppRegion: 'drag',
        }}
      >
        <div
          className="flex items-center"
          style={{
            // @ts-expect-error WebkitAppRegion
            WebkitAppRegion: 'no-drag',
          }}
        >
          <button
            onClick={() => window.mpvBridge.windowMinimize()}
            className="flex items-center justify-center"
            style={{ width: '46px', height: '32px', color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.01)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.01)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
            aria-label="Réduire"
          >
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button
            onClick={() => window.mpvBridge.windowMaximize()}
            className="flex items-center justify-center"
            style={{ width: '46px', height: '32px', color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.01)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.01)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
            aria-label="Agrandir"
          >
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button
            onClick={() => window.mpvBridge.windowClose()}
            className="flex items-center justify-center"
            style={{ width: '46px', height: '32px', color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.01)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.9)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.01)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
            aria-label="Fermer"
          >
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
        </div>
      </div>

      {/* DragZone — full area, z-10 */}
      <div className="absolute inset-0 z-10">
        <DragZone />
      </div>

      {/* Settings panel — z-25 */}
      {settingsOpen && controlsVisible && (
        <div className="absolute inset-0 z-25" onClick={() => setSettingsOpen(false)}>
          <SettingsPanel />
        </div>
      )}

      {/* ControlBar — bottom, z-20 */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 45%, transparent 100%)',
        }}
      >
        <ControlBar />
      </div>
    </div>
  )
}
