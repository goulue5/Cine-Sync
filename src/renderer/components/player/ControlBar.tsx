import React, { useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { videoEngine } from '../../video/videoEngine'
import { SeekBar } from './SeekBar'
import { VolumeControl } from './VolumeControl'

/* ── Icons ────────────────────────────────────────────────────────────── */

function PlayIcon(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
    </svg>
  )
}

function PrevIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  )
}

function NextIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zm2.5-6l8.5 6V6z" transform="translate(-2, 0)" />
      <path d="M16 6h2v12h-2z" />
    </svg>
  )
}

/* ── Shared button component ──────────────────────────────────────────── */

function ControlButton({ onClick, disabled, label, title, children, size = 36 }: {
  onClick: () => void; disabled?: boolean; label: string; title?: string
  children: React.ReactNode; size?: number
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      style={{
        width: size, height: size, borderRadius: size > 40 ? '50%' : 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: disabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.5)',
        background: 'transparent', border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (disabled) return
        e.currentTarget.style.color = 'rgba(255,255,255,0.95)'
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = disabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.5)'
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

/* ── Component ────────────────────────────────────────────────────────── */

interface ControlBarProps {
  onToggleWatchTogether?: () => void
  watchTogetherOpen?: boolean
}

export function ControlBar({ onToggleWatchTogether, watchTogetherOpen }: ControlBarProps): React.ReactElement {
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const fileName = usePlayerStore(s => s.fileName)
  const settingsOpen = usePlayerStore(s => s.settingsOpen)
  const setSettingsOpen = usePlayerStore(s => s.setSettingsOpen)
  const speed = usePlayerStore(s => s.speed)
  const playlist = usePlayerStore(s => s.playlist)
  const playlistIndex = usePlayerStore(s => s.playlistIndex)
  const playNext = usePlayerStore(s => s.playNext)
  const playPrev = usePlayerStore(s => s.playPrev)
  const loadPlaylist = usePlayerStore(s => s.loadPlaylist)

  const hasPrev = playlistIndex > 0
  const hasNext = playlistIndex < playlist.length - 1

  const handleTogglePause = useCallback(() => videoEngine.togglePause(), [])
  const handleBack = useCallback(() => videoEngine.seek(-10, 'relative'), [])
  const handleForward = useCallback(() => videoEngine.seek(10, 'relative'), [])

  const handleOpenFiles = useCallback(async () => {
    try {
      const paths = await window.mpvBridge.openFiles()
      if (paths.length > 0) loadPlaylist(paths)
    } catch { /* cancelled */ }
  }, [loadPlaylist])

  return (
    <div style={{ width: '100%', padding: '0 24px 20px' }}>
      {/* Seek bar */}
      <div style={{ marginBottom: 14 }}>
        <SeekBar />
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>

        {/* ── Left: playback controls ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Prev */}
          {playlist.length > 1 && (
            <ControlButton onClick={playPrev} disabled={!hasPrev} label="Piste précédente" size={32}>
              <PrevIcon />
            </ControlButton>
          )}

          {/* Skip back */}
          <ControlButton onClick={handleBack} label="Reculer 10s" size={36}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
              <text x="12" y="15.5" fontSize="7" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle" fontFamily="system-ui">10</text>
            </svg>
          </ControlButton>

          {/* Play / Pause — hero button */}
          <button
            onClick={handleTogglePause}
            aria-label={isPlaying ? 'Pause' : 'Lecture'}
            style={{
              width: 48, height: 48, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', border: 'none', cursor: 'pointer',
              background: 'var(--accent, rgb(59,130,246))',
              margin: '0 4px',
              transition: 'all 0.2s',
              boxShadow: '0 4px 16px color-mix(in srgb, var(--accent, rgb(59,130,246)) 35%, transparent)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.06)'
              e.currentTarget.style.boxShadow = '0 6px 24px color-mix(in srgb, var(--accent, rgb(59,130,246)) 50%, transparent)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = '0 4px 16px color-mix(in srgb, var(--accent, rgb(59,130,246)) 35%, transparent)'
            }}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Skip forward */}
          <ControlButton onClick={handleForward} label="Avancer 10s" size={36}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 11-2.13-9.36L23 10" />
              <text x="12" y="15.5" fontSize="7" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle" fontFamily="system-ui">10</text>
            </svg>
          </ControlButton>

          {/* Next */}
          {playlist.length > 1 && (
            <ControlButton onClick={playNext} disabled={!hasNext} label="Piste suivante" size={32}>
              <NextIcon />
            </ControlButton>
          )}
        </div>

        {/* Volume */}
        <div style={{ marginLeft: 8 }}>
          <VolumeControl />
        </div>

        {/* ── Center: file info ── */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 0 }}>
          {fileName && (
            <span style={{
              color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 240,
            }} title={fileName}>
              {fileName}
            </span>
          )}
          {Math.abs(speed - 1) > 0.01 && (
            <span style={{
              color: 'var(--accent, rgb(59,130,246))', fontSize: 10, fontWeight: 600,
              fontFamily: 'ui-monospace, monospace',
              background: 'color-mix(in srgb, var(--accent, rgb(59,130,246)) 10%, transparent)',
              padding: '2px 6px', borderRadius: 4,
            }}>
              {speed}x
            </span>
          )}
          {playlist.length > 1 && (
            <span style={{
              color: 'rgba(255,255,255,0.2)', fontSize: 10,
              fontFamily: 'ui-monospace, monospace',
            }}>
              {playlistIndex + 1}/{playlist.length}
            </span>
          )}
        </div>

        {/* ── Right: tool buttons ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Watch Together */}
          {onToggleWatchTogether && (
            <button
              onClick={onToggleWatchTogether}
              aria-label="Watch Together"
              title="Watch Together (W)"
              style={{
                width: 34, height: 34, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: watchTogetherOpen ? 'var(--accent, rgb(59,130,246))' : 'rgba(255,255,255,0.4)',
                background: watchTogetherOpen ? 'color-mix(in srgb, var(--accent, rgb(59,130,246)) 12%, transparent)' : 'transparent',
                border: 'none', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
              }}
              onMouseEnter={e => { if (!watchTogetherOpen) { e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' } }}
              onMouseLeave={e => {
                e.currentTarget.style.color = watchTogetherOpen ? 'var(--accent, rgb(59,130,246))' : 'rgba(255,255,255,0.4)'
                e.currentTarget.style.background = watchTogetherOpen ? 'color-mix(in srgb, var(--accent, rgb(59,130,246)) 12%, transparent)' : 'transparent'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </button>
          )}

          {/* PiP */}
          {fileName && (
            <ControlButton onClick={() => window.mpvBridge.windowPip()} label="Picture-in-Picture" title="Picture-in-Picture (Alt+P)" size={34}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <rect x="11" y="9" width="9" height="7" rx="1" fill="currentColor" opacity="0.25" />
              </svg>
            </ControlButton>
          )}

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-label="Paramètres"
            title="Paramètres"
            style={{
              width: 34, height: 34, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: settingsOpen ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
              background: settingsOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: 'none', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => {
              e.currentTarget.style.color = settingsOpen ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)'
              e.currentTarget.style.background = settingsOpen ? 'rgba(255,255,255,0.08)' : 'transparent'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>

          {/* Open files */}
          <ControlButton onClick={handleOpenFiles} label="Ouvrir des fichiers" title="Ouvrir" size={34}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
          </ControlButton>
        </div>
      </div>
    </div>
  )
}
