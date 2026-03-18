import React, { useCallback, useState } from 'react'
import { usePlayerStore, MpvTrack } from '../../store/playerStore'
import { videoEngine } from '../../video/videoEngine'
import { useOsd } from './OsdNotification'
import { useThemeStore, ACCENT_THEMES } from '../../store/themeStore'

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
  const setSettingsOpen = usePlayerStore(s => s.setSettingsOpen)

  const audioTracks = trackList.filter(t => t.type === 'audio')
  const subTracks = trackList.filter(t => t.type === 'sub')

  const handleAudioTrack = useCallback((id: number | 'no') => {
    videoEngine.setAudioTrack(id)
  }, [])

  const handleSubTrack = useCallback((id: number | 'no') => {
    videoEngine.setSubtitleTrack(id)
  }, [])

  const osdShow = useOsd((st) => st.show)

  const handleSpeed = useCallback((s: number) => {
    videoEngine.setSpeed(s)
    osdShow(`Vitesse : ${s}x`)
  }, [osdShow])

  const handleLoadSubtitle = useCallback(async () => {
    try {
      const path = await window.mpvBridge.openSubtitleFile()
      if (path) {
        const { content, fileName } = await window.mpvBridge.readSubtitleFile(path)
        await videoEngine.addSubtitle(content, fileName, 'fr')
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

      {/* Video filters */}
      <VideoFilters osdShow={osdShow} />

      {/* Theme */}
      <ThemePicker />
    </div>
  )
}

const FILTERS = [
  { key: 'brightness', label: 'Luminosité', min: -100, max: 100 },
  { key: 'contrast', label: 'Contraste', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'gamma', label: 'Gamma', min: -100, max: 100 },
] as const

function VideoFilters({ osdShow }: { osdShow: (msg: string) => void }): React.ReactElement {
  const [values, setValues] = useState<Record<string, number>>({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    gamma: 0,
  })

  const handleChange = useCallback((key: string, value: number) => {
    setValues(prev => ({ ...prev, [key]: value }))
    videoEngine.setProperty(key, value)
  }, [])

  const handleReset = useCallback(() => {
    const reset = { brightness: 0, contrast: 0, saturation: 0, gamma: 0 }
    setValues(reset)
    for (const [key, val] of Object.entries(reset)) {
      videoEngine.setProperty(key, val)
    }
    osdShow('Filtres réinitialisés')
  }, [osdShow])

  const hasChanges = Object.values(values).some(v => v !== 0)

  return (
    <Section title="Filtres vidéo">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {FILTERS.map(f => (
          <FilterSlider
            key={f.key}
            label={f.label}
            value={values[f.key]}
            min={f.min}
            max={f.max}
            onChange={(v) => handleChange(f.key, v)}
          />
        ))}
        {hasChanges && (
          <button
            onClick={handleReset}
            style={{
              marginTop: '4px',
              padding: '5px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.45)',
              fontSize: '10px',
              cursor: 'pointer',
              ...MONO,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>
    </Section>
  )
}

function FilterSlider({ label, value, min, max, onChange }: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}): React.ReactElement {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', ...MONO }}>{label}</span>
        <span style={{ color: value !== 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', fontSize: '11px', ...MONO }}>
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        onDoubleClick={() => onChange(0)}
        style={{
          width: '100%',
          height: '4px',
          appearance: 'none',
          background: `linear-gradient(to right, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.3) ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
          borderRadius: '2px',
          outline: 'none',
          cursor: 'pointer',
        }}
      />
    </div>
  )
}

function ThemePicker(): React.ReactElement {
  const accent = useThemeStore((s) => s.accent)
  const setAccent = useThemeStore((s) => s.setAccent)

  return (
    <Section title="Couleur d'accent">
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {Object.entries(ACCENT_THEMES).map(([key, theme]) => (
          <button
            key={key}
            onClick={() => setAccent(key)}
            title={theme.name}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              border: accent === key ? '2px solid #fff' : '2px solid transparent',
              background: theme.color,
              cursor: 'pointer',
              boxShadow: accent === key ? '0 0 0 2px rgba(255,255,255,0.2)' : 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          />
        ))}
      </div>
    </Section>
  )
}