import React, { useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { SeekBar } from './SeekBar'
import { VolumeControl } from './VolumeControl'

const MONO: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", monospace',
  letterSpacing: '0.04em',
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PlayIcon(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      {/* Slightly offset for optical centering */}
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

  const handleTogglePause = useCallback(() => window.mpvBridge.togglePause(), [])
  const handleBack = useCallback(() => window.mpvBridge.seek(-10, 'relative'), [])
  const handleForward = useCallback(() => window.mpvBridge.seek(10, 'relative'), [])

  return (
    <div className="w-full flex flex-col" style={{ padding: '0 20px 18px' }}>
      {/* Seek bar row */}
      <div style={{ marginBottom: '10px' }}>
        <SeekBar />
      </div>

      {/* Controls row */}
      <div className="flex items-center">

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

        {/* Volume — left of center */}
        <div style={{ marginLeft: '8px' }}>
          <VolumeControl />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

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

        {/* Open file button */}
        <button
          onClick={async () => {
            try {
              const path = await window.mpvBridge.openFile()
              if (path) await window.mpvBridge.loadFile(path)
            } catch {}
          }}
          className="flex items-center justify-center rounded-lg transition-colors duration-150"
          style={{ width: '32px', height: '32px', color: 'rgba(255,255,255,0.35)', marginLeft: '8px', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          aria-label="Ouvrir un fichier"
          title="Ouvrir un fichier"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
