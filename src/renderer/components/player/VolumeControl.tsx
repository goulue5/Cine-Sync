import React, { useCallback, useState } from 'react'
import { usePlayerStore } from '../../store/playerStore'

function VolumeIcon({ level }: { level: 'off' | 'low' | 'high' }): React.ReactElement {
  if (level === 'off') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
      </svg>
    )
  }
  if (level === 'low') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.5 12A4.5 4.5 0 0016 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  )
}

export function VolumeControl(): React.ReactElement {
  const volume = usePlayerStore(s => s.volume)
  const mute = usePlayerStore(s => s.mute)
  const [hovering, setHovering] = useState(false)

  const toggleMute = useCallback(() => {
    window.mpvBridge.setMute(!mute)
  }, [mute])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    window.mpvBridge.setVolume(val)
    if (mute && val > 0) window.mpvBridge.setMute(false)
  }, [mute])

  const display = mute ? 0 : volume
  const fillPct = Math.min((display / 130) * 100, 100)
  const level = mute || volume === 0 ? 'off' : volume < 60 ? 'low' : 'high'

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleMute}
        className="transition-colors duration-150"
        style={{ color: mute ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.55)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = mute ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.55)' }}
        aria-label={mute ? 'Activer le son' : 'Couper le son'}
      >
        <VolumeIcon level={level} />
      </button>

      {/* Slider */}
      <div
        className="relative flex items-center cursor-pointer"
        style={{ width: '68px', height: '20px' }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {/* Rail */}
        <div
          className="absolute inset-x-0 rounded-full transition-all duration-150"
          style={{
            height: hovering ? '4px' : '2px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.12)',
          }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${fillPct}%`,
              background: hovering ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)',
              transition: 'background 0.15s',
            }}
          />
        </div>

        {/* Thumb */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: '9px',
            height: '9px',
            left: `${fillPct}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#fff',
            opacity: hovering ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        />

        <input
          type="range"
          min={0}
          max={130}
          step={1}
          value={display}
          onChange={handleChange}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          style={{ height: '100%' }}
          aria-label="Volume"
        />
      </div>
    </div>
  )
}
