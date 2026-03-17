import React, { useCallback, useState, useRef } from 'react'
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
  const chapters = usePlayerStore(s => s.chapters)
  const [hovering, setHovering] = useState(false)
  const [hoverPos, setHoverPos] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const progress = duration > 0 ? Math.min(timePos / duration, 1) : 0

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    window.mpvBridge.seek(parseFloat(e.target.value), 'absolute')
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current || duration <= 0) return
    const rect = trackRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHoverPos(pct)
  }, [duration])

  // Find chapter at hover position
  const hoverTime = hoverPos !== null && duration > 0 ? hoverPos * duration : null
  const hoverChapter = hoverTime !== null && chapters.length > 0
    ? chapters.reduce<string | null>((found, ch) => {
        if (ch.time <= hoverTime) return ch.title || found
        return found
      }, null)
    : null

  return (
    <div className="flex items-center gap-3 w-full select-none">
      {/* Elapsed */}
      <span className="shrink-0 w-10 text-right text-xs text-white/50" style={MONO}>
        {formatTime(timePos)}
      </span>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative flex-1 flex items-center cursor-pointer"
        style={{ height: '20px' }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => { setHovering(false); setHoverPos(null) }}
        onMouseMove={handleMouseMove}
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
              background: hovering ? 'var(--accent, #fff)' : 'var(--accent-muted, rgba(255,255,255,0.75))',
              transition: 'background 0.15s',
            }}
          />
        </div>

        {/* Chapter markers */}
        {duration > 0 && chapters.map((ch, i) => {
          const pct = (ch.time / duration) * 100
          if (pct <= 0 || pct >= 100) return null
          return (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={{
                left: `${pct}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '3px',
                height: hovering ? '9px' : '7px',
                borderRadius: '1px',
                background: 'rgba(255,255,255,0.5)',
                transition: 'height 0.15s',
              }}
            />
          )
        })}

        {/* Hover time tooltip */}
        {hovering && hoverPos !== null && duration > 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${hoverPos * 100}%`,
              bottom: '18px',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.85)',
              borderRadius: '4px',
              padding: hoverChapter ? '4px 8px' : '3px 7px',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ color: '#fff', fontSize: '11px', ...MONO }}>
              {formatTime(hoverPos * duration)}
            </div>
            {hoverChapter && (
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '9px', marginTop: '1px', ...MONO }}>
                {hoverChapter}
              </div>
            )}
          </div>
        )}

        {/* Thumb dot — visible on hover */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: '11px',
            height: '11px',
            left: `${progress * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--accent, #fff)',
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
