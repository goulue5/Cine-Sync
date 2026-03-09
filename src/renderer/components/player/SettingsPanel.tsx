import React, { useCallback } from 'react'
import { usePlayerStore, MpvTrack } from '../../store/playerStore'

const MONO: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", monospace',
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4]

function trackLabel(t: MpvTrack): string {
  const parts: string[] = []
  if (t.title) parts.push(t.title)
  if (t.lang) parts.push(t.lang.toUpperCase())
  if (t.codec) parts.push(t.codec)
  if (parts.length === 0) parts.push(`Piste ${t.id}`)
  if (t.external) parts.push('(ext)')
  return parts.join(' · ')
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px', ...MONO }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function TrackButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        borderRadius: '4px',
        border: 'none',
        background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.6)',
        fontSize: '12px',
        cursor: 'pointer',
        ...MONO,
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {active && '● '}{label}
    </button>
  )
}

export function SettingsPanel(): React.ReactElement {
  const trackList = usePlayerStore(s => s.trackList)
  const currentAid = usePlayerStore(s => s.currentAid)
  const currentSid = usePlayerStore(s => s.currentSid)
  const speed = usePlayerStore(s => s.speed)
  const subDelay = usePlayerStore(s => s.subDelay)
  const audioDelay = usePlayerStore(s => s.audioDelay)
  const setSettingsOpen = usePlayerStore(s => s.setSettingsOpen)

  const audioTracks = trackList.filter(t => t.type === 'audio')
  const subTracks = trackList.filter(t => t.type === 'sub')

  const handleAudioTrack = useCallback((id: number | 'no') => {
    window.mpvBridge.setAudioTrack(id)
  }, [])

  const handleSubTrack = useCallback((id: number | 'no') => {
    window.mpvBridge.setSubtitleTrack(id)
  }, [])

  const handleSpeed = useCallback((s: number) => {
    window.mpvBridge.setSpeed(s)
  }, [])

  const adjustSubDelay = useCallback((delta: number) => {
    window.mpvBridge.setSubDelay(Math.round((subDelay + delta) * 10) / 10)
  }, [subDelay])

  const adjustAudioDelay = useCallback((delta: number) => {
    window.mpvBridge.setAudioDelay(Math.round((audioDelay + delta) * 10) / 10)
  }, [audioDelay])

  const handleLoadSubtitle = useCallback(async () => {
    try {
      const path = await window.mpvBridge.openSubtitleFile()
      if (path) {
        await window.mpvBridge.addSubtitle(path)
      }
    } catch (err) {
      console.error('[SettingsPanel] failed to load subtitle:', err)
    }
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        right: '12px',
        bottom: '80px',
        width: '280px',
        maxHeight: '420px',
        overflowY: 'auto',
        background: 'rgba(15,15,15,0.95)',
        backdropFilter: 'blur(12px)',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '16px',
        zIndex: 50,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Close */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontWeight: 500 }}>Paramètres</span>
        <button
          onClick={() => setSettingsOpen(false)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px' }}
        >
          ✕
        </button>
      </div>

      {/* Audio tracks */}
      {audioTracks.length > 0 && (
        <Section title="Piste audio">
          {audioTracks.map(t => (
            <TrackButton
              key={t.id}
              label={trackLabel(t)}
              active={currentAid === t.id}
              onClick={() => handleAudioTrack(t.id)}
            />
          ))}
        </Section>
      )}

      {/* Subtitle tracks */}
      <Section title="Sous-titres">
        <TrackButton
          label="Désactivés"
          active={currentSid === null || String(currentSid) === 'no' || currentSid === false as never}
          onClick={() => handleSubTrack('no')}
        />
        {subTracks.map(t => (
          <TrackButton
            key={t.id}
            label={trackLabel(t)}
            active={currentSid === t.id}
            onClick={() => handleSubTrack(t.id)}
          />
        ))}
        {/* Load external subtitle */}
        <button
          onClick={handleLoadSubtitle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: '100%',
            textAlign: 'left',
            padding: '7px 10px',
            borderRadius: '4px',
            border: '1px dashed rgba(255,255,255,0.15)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.4)',
            fontSize: '11px',
            cursor: 'pointer',
            marginTop: '4px',
            ...MONO,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
            ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Charger un fichier de sous-titres
        </button>
      </Section>

      {/* Speed */}
      <Section title="Vitesse">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => handleSpeed(s)}
              style={{
                padding: '5px 8px',
                borderRadius: '4px',
                border: 'none',
                background: Math.abs(speed - s) < 0.01 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
                color: Math.abs(speed - s) < 0.01 ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: '11px',
                cursor: 'pointer',
                ...MONO,
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </Section>

      {/* Subtitle delay */}
      <Section title={`Décalage sous-titres (${subDelay > 0 ? '+' : ''}${subDelay.toFixed(1)}s)`}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <DelayButton label="−0.5" onClick={() => adjustSubDelay(-0.5)} />
          <DelayButton label="−0.1" onClick={() => adjustSubDelay(-0.1)} />
          <DelayButton label="Reset" onClick={() => window.mpvBridge.setSubDelay(0)} />
          <DelayButton label="+0.1" onClick={() => adjustSubDelay(0.1)} />
          <DelayButton label="+0.5" onClick={() => adjustSubDelay(0.5)} />
        </div>
      </Section>

      {/* Audio delay */}
      <Section title={`Décalage audio (${audioDelay > 0 ? '+' : ''}${audioDelay.toFixed(1)}s)`}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <DelayButton label="−0.5" onClick={() => adjustAudioDelay(-0.5)} />
          <DelayButton label="−0.1" onClick={() => adjustAudioDelay(-0.1)} />
          <DelayButton label="Reset" onClick={() => window.mpvBridge.setAudioDelay(0)} />
          <DelayButton label="+0.1" onClick={() => adjustAudioDelay(0.1)} />
          <DelayButton label="+0.5" onClick={() => adjustAudioDelay(0.5)} />
        </div>
      </Section>
    </div>
  )
}

function DelayButton({ label, onClick }: { label: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '5px 2px',
        borderRadius: '4px',
        border: 'none',
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.55)',
        fontSize: '10px',
        cursor: 'pointer',
        ...MONO,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
    >
      {label}
    </button>
  )
}
