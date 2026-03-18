import React, { useEffect, useRef, useCallback, useState } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { videoEngine } from '../../video/videoEngine'
import { VideoPlayer } from '../player/VideoPlayer'
import { DragZone } from '../player/DragZone'
import { ControlBar } from '../player/ControlBar'
import { SettingsPanel } from '../player/SettingsPanel'
import { OsdNotification, useOsd } from '../player/OsdNotification'
import { MediaInfoPanel } from '../player/MediaInfoPanel'
import { WatchTogetherPanel } from '../player/WatchTogetherPanel'

const CONTROLS_HIDE_DELAY = 3000

export function PlayerShell(): React.ReactElement {
  const controlsVisible = usePlayerStore(s => s.controlsVisible)
  const setControlsVisible = usePlayerStore(s => s.setControlsVisible)
  const fileName = usePlayerStore(s => s.fileName)
  const settingsOpen = usePlayerStore(s => s.settingsOpen)
  const setSettingsOpen = usePlayerStore(s => s.setSettingsOpen)
  const osdShow = useOsd((s) => s.show)
  const [mediaInfoOpen, setMediaInfoOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track fullscreen state from main process
  useEffect(() => {
    const cleanup = window.mpvBridge.onFullscreenChanged((fs) => setIsFullscreen(fs))
    return cleanup
  }, [])

  // Listen for external file opens (double-click / "Open With")
  useEffect(() => {
    const cleanup = window.mpvBridge.onExternalFile((filePath) => {
      if (filePath) {
        usePlayerStore.getState().loadPlaylist([filePath], 0)
      }
    })
    return cleanup
  }, [])

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

  // ── Scroll wheel → volume ─────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (usePlayerStore.getState().settingsOpen) return
    e.preventDefault()
    const delta = e.deltaY < 0 ? 5 : -5
    const newVol = Math.max(0, Math.min(100, usePlayerStore.getState().volume + delta))
    videoEngine.setVolume(newVol)
    osdShow(`Volume : ${newVol}%`)
    showControls()
  }, [showControls, osdShow])

  // ── Double-click → fullscreen ─────────────────────────────────────────
  const handleDoubleClick = useCallback(() => {
    window.mpvBridge.windowMaximize()
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.code) {
        case 'Space': {
          e.preventDefault()
          const wasPlaying = usePlayerStore.getState().isPlaying
          videoEngine.togglePause()
          osdShow(wasPlaying ? 'Pause' : 'Lecture')
          showControls()
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const secs = e.shiftKey ? 30 : 5
          videoEngine.seek(secs, 'relative')
          osdShow(`Avancer +${secs}s`)
          showControls()
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          const secs = e.shiftKey ? 30 : 5
          videoEngine.seek(-secs, 'relative')
          osdShow(`Reculer -${secs}s`)
          showControls()
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const vol = Math.min(100, usePlayerStore.getState().volume + 5)
          videoEngine.setVolume(vol)
          osdShow(`Volume : ${vol}%`)
          showControls()
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          const vol = Math.max(0, usePlayerStore.getState().volume - 5)
          videoEngine.setVolume(vol)
          osdShow(`Volume : ${vol}%`)
          showControls()
          break
        }
        case 'KeyM': {
          const muted = !usePlayerStore.getState().mute
          videoEngine.setMute(muted)
          osdShow(muted ? 'Son coupé' : 'Son activé')
          break
        }
        case 'KeyF':
          window.mpvBridge.windowMaximize()
          break
        case 'KeyN':
          usePlayerStore.getState().playNext()
          showControls()
          break
        case 'KeyP':
          if (e.altKey) {
            e.preventDefault()
            window.mpvBridge.windowPip()
          } else {
            usePlayerStore.getState().playPrev()
            showControls()
          }
          break
        case 'KeyI':
          setMediaInfoOpen((v) => !v)
          break
        case 'KeyW':
          setSyncOpen((v) => !v)
          break
        case 'Escape':
          if (syncOpen) setSyncOpen(false)
          else if (mediaInfoOpen) setMediaInfoOpen(false)
          else if (settingsOpen) setSettingsOpen(false)
          else if (isFullscreen) window.mpvBridge.windowMaximize()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showControls, settingsOpen, setSettingsOpen, mediaInfoOpen, syncOpen, isFullscreen, osdShow])

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      onMouseMove={showControls}
      onMouseEnter={showControls}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
    >
      {/* Video element — behind everything */}
      <VideoPlayer />

      {/* Black background — ONLY when no video is loaded */}
      {!fileName && (
        <div className="absolute inset-0 bg-black" />
      )}

      {/* OSD notifications */}
      <OsdNotification />

      {/* Media info overlay */}
      {mediaInfoOpen && fileName && (
        <MediaInfoPanel onClose={() => setMediaInfoOpen(false)} />
      )}

      {/* Watch Together */}
      {syncOpen && (
        <WatchTogetherPanel onClose={() => setSyncOpen(false)} />
      )}

      {/* Title bar drag region + window controls */}
      <div
        className="absolute top-0 left-0 right-0 z-30 flex items-center justify-end"
        style={{
          height: '38px',
          background: 'rgba(0,0,0,0.01)',
          // @ts-expect-error WebkitAppRegion is valid in Electron
          WebkitAppRegion: 'drag',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6, paddingRight: 12,
            // @ts-expect-error WebkitAppRegion
            WebkitAppRegion: 'no-drag',
          }}
        >
          <button
            onClick={() => window.mpvBridge.windowMinimize()}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)', border: 'none',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'transparent',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgb(254,189,46)'; e.currentTarget.style.color = 'rgba(0,0,0,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'transparent' }}
            aria-label="Réduire"
          >
            <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4h6" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
          <button
            onClick={() => window.mpvBridge.windowMaximize()}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)', border: 'none',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'transparent',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgb(39,201,63)'; e.currentTarget.style.color = 'rgba(0,0,0,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'transparent' }}
            aria-label="Agrandir"
          >
            <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 3L1 1L3 1M5 7L7 7L7 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
          </button>
          <button
            onClick={() => window.mpvBridge.windowClose()}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)', border: 'none',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'transparent',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgb(255,95,86)'; e.currentTarget.style.color = 'rgba(0,0,0,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'transparent' }}
            aria-label="Fermer"
          >
            <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
        </div>
      </div>

      {/* DragZone — full area, z-10 */}
      <div className="absolute inset-0 z-10">
        <DragZone onOpenWatchTogether={() => setSyncOpen(v => !v)} />
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
        <ControlBar
          onToggleWatchTogether={() => setSyncOpen(v => !v)}
          watchTogetherOpen={syncOpen}
        />
      </div>
    </div>
  )
}
