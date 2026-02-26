import React, { useCallback, useState } from 'react'
import { usePlayerStore } from '../../store/playerStore'

const MONO: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", monospace',
  letterSpacing: '0.04em',
}

function formatTime(secs: number): string {
  if (!isFinite(secs) || isNaN(secs) || secs < 0) return '0:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export function SeekBar(): React.ReactElement {
  const timePos = usePlayerStore(s => s.timePos)
  const duration = usePlayerStore(s => s.duration)
  const [hovering, setHovering] = useState(false)

  const progress = duration > 0 ? Math.min(timePos / duration, 1) : 0

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    window.mpvBridge.seek(parseFloat(e.target.value), 'absolute')
  }, [])

  return (
    <div className="flex items-center gap-3 w-full select-none">
      {/* Elapsed */}
      <span className="shrink-0 w-10 text-right text-xs text-white/50" style={MONO}>
        {formatTime(timePos)}
      </span>

      {/* Track */}
      <div
        className="relative flex-1 flex items-center cursor-pointer"
        style={{ height: '20px' }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {/* Background rail */}
        <div
          className="absolute inset-x-0 rounded-full transition-all duration-150"
          style={{
            height: hovering ? '5px' : '3px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.12)',
          }}
        >
          {/* Filled portion */}
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: hovering ? '#fff' : 'rgba(255,255,255,0.75)',
              transition: 'background 0.15s',
            }}
          />
        </div>

        {/* Thumb dot — visible on hover */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: '11px',
            height: '11px',
            left: `${progress * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#fff',
            opacity: hovering ? 1 : 0,
            boxShadow: '0 0 0 2px rgba(255,255,255,0.15)',
            transition: 'opacity 0.15s',
          }}
        />

        {/* Invisible range input covering full hit area */}
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 100}
          step={0.5}
          value={timePos}
          onChange={handleSeek}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          style={{ height: '100%' }}
          aria-label="Position de lecture"
        />
      </div>

      {/* Remaining */}
      <span className="shrink-0 w-10 text-xs text-white/25" style={MONO}>
        {formatTime(duration)}
      </span>
    </div>
  )
}
