import React, { useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { SeekBar } from './SeekBar'
import { VolumeControl } from './VolumeControl'

function SettingsIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

const MONO: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", monospace',
  letterSpacing: '0.04em',
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PlayIcon(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.5 4.5v15L20 12z" />
    </svg>
  )
}

function PauseIcon(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
    </svg>
  )
}

function PrevIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  )
}

function NextIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zm2.5-6l8.5 6V6z" transform="translate(-2, 0)" />
      <path d="M16 6h2v12h-2z" />
    </svg>
  )
}

function Skip10BackIcon(): React.ReactElement {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
      <text x="7.5" y="16.5" fontSize="6" fontWeight="600" fontFamily="system-ui" textAnchor="middle" fill="currentColor">10</text>
    </svg>
  )
}

function Skip10ForwardIcon(): React.ReactElement {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
      <text x="16.5" y="16.5" fontSize="6" fontWeight="600" fontFamily="system-ui" textAnchor="middle" fill="currentColor">10</text>
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ControlBar(): React.ReactElement {
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

  const handleTogglePause = useCallback(() => window.mpvBridge.togglePause(), [])
  const handleBack = useCallback(() => window.mpvBridge.seek(-10, 'relative'), [])
  const handleForward = useCallback(() => window.mpvBridge.seek(10, 'relative'), [])

  const handleOpenFiles = useCallback(async () => {
    try {
      const paths = await window.mpvBridge.openFiles()
      if (paths.length > 0) {
        loadPlaylist(paths)
      }
    } catch { /* dialog cancelled */ }
  }, [loadPlaylist])

  return (
    <div className="w-full flex flex-col" style={{ padding: '0 20px 18px' }}>
      {/* Seek bar row */}
      <div style={{ marginBottom: '10px' }}>
        <SeekBar />
      </div>

      {/* Controls row */}
      <div className="flex items-center">

        {/* ── Prev button ── */}
        {playlist.length > 1 && (
          <button
            onClick={playPrev}
            disabled={!hasPrev}
            className="flex items-center justify-center rounded-lg transition-colors duration-150"
            style={{
              width: '30px', height: '30px',
              color: hasPrev ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)',
              cursor: hasPrev ? 'pointer' : 'default',
            }}
            onMouseEnter={e => { if (hasPrev) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' } }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = hasPrev ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            aria-label="Piste précédente"
          >
            <PrevIcon />
          </button>
        )}

        {/* ── Playback cluster ── */}
        <div className="flex items-center" style={{ gap: '2px' }}>
          {/* Skip back */}
          <button
            onClick={handleBack}
            className="flex items-center justify-center rounded-lg transition-colors duration-150"
            style={{ width: '34px', height: '34px', color: 'rgba(255,255,255,0.45)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            aria-label="Reculer de 10 secondes"
          >
            <Skip10BackIcon />
          </button>

          {/* Play / Pause — primary button, larger */}
          <button
            onClick={handleTogglePause}
            className="flex items-center justify-center rounded-full transition-all duration-150"
            style={{
              width: '42px',
              height: '42px',
              color: '#fff',
              background: 'rgba(255,255,255,0.1)',
              margin: '0 4px',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.18)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
            aria-label={isPlaying ? 'Pause' : 'Lecture'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Skip forward */}
          <button
            onClick={handleForward}
            className="flex items-center justify-center rounded-lg transition-colors duration-150"
            style={{ width: '34px', height: '34px', color: 'rgba(255,255,255,0.45)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            aria-label="Avancer de 10 secondes"
          >
            <Skip10ForwardIcon />
          </button>
        </div>

        {/* ── Next button ── */}
        {playlist.length > 1 && (
          <button
            onClick={playNext}
            disabled={!hasNext}
            className="flex items-center justify-center rounded-lg transition-colors duration-150"
            style={{
              width: '30px', height: '30px',
              color: hasNext ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)',
              cursor: hasNext ? 'pointer' : 'default',
            }}
            onMouseEnter={e => { if (hasNext) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' } }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = hasNext ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            aria-label="Piste suivante"
          >
            <NextIcon />
          </button>
        )}

        {/* Volume — left of center */}
        <div style={{ marginLeft: '8px' }}>
          <VolumeControl />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Playlist position */}
        {playlist.length > 1 && (
          <span
            className="text-xs"
            style={{ ...MONO, color: 'rgba(255,255,255,0.3)', marginRight: '8px' }}
          >
            {playlistIndex + 1}/{playlist.length}
          </span>
        )}

        {/* File name — right-aligned, muted */}
        {fileName && (
          <span
            className="text-xs truncate"
            style={{ ...MONO, color: 'rgba(255,255,255,0.22)', maxWidth: '200px' }}
            title={fileName}
          >
            {fileName}
          </span>
        )}

        {/* Speed indicator */}
        {Math.abs(speed - 1) > 0.01 && (
          <span style={{ ...MONO, color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginLeft: '4px' }}>
            {speed}x
          </span>
        )}

        {/* Settings button */}
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex items-center justify-center rounded-lg transition-colors duration-150"
          style={{
            width: '32px', height: '32px', flexShrink: 0, marginLeft: '4px',
            color: settingsOpen ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
            background: settingsOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = settingsOpen ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)'
            ;(e.currentTarget as HTMLElement).style.background = settingsOpen ? 'rgba(255,255,255,0.08)' : 'transparent'
          }}
          aria-label="Paramètres"
          title="Pistes audio, sous-titres, vitesse"
        >
          <SettingsIcon />
        </button>

        {/* Open file(s) button */}
        <button
          onClick={handleOpenFiles}
          className="flex items-center justify-center rounded-lg transition-colors duration-150"
          style={{ width: '32px', height: '32px', color: 'rgba(255,255,255,0.35)', marginLeft: '4px', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          aria-label="Ouvrir des fichiers"
          title="Ouvrir des fichiers"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
