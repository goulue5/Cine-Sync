import React, { useEffect, useState, useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'

interface MediaInfo {
  videoCodec: string
  audioCodec: string
  width: number
  height: number
  fps: number
  videoBitrate: number
  audioBitrate: number
  audioChannels: string
  audioSampleRate: number
  fileSize: number
  format: string
  hwdec: string
  pixelFormat: string
  colorspace: string
}

function formatBitrate(bps: number): string {
  if (!bps || bps <= 0) return '—'
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mb/s`
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kb/s`
  return `${bps} b/s`
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} Go`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} Mo`
  return `${(bytes / 1024).toFixed(0)} Ko`
}

async function fetchMediaInfo(): Promise<MediaInfo> {
  const get = (prop: string) => window.mpvBridge.getProperty(prop).catch(() => null)

  const [
    videoCodec, audioCodec, width, height, fps,
    videoBitrate, audioBitrate, audioChannels, audioSampleRate,
    fileSize, format, hwdec, pixelFormat, colorspace,
  ] = await Promise.all([
    get('video-codec'),
    get('audio-codec-name'),
    get('width'),
    get('height'),
    get('estimated-vf-fps'),
    get('video-bitrate'),
    get('audio-bitrate'),
    get('audio-params/channel-count'),
    get('audio-params/samplerate'),
    get('file-size'),
    get('file-format'),
    get('hwdec-current'),
    get('video-params/pixelformat'),
    get('video-params/colormatrix'),
  ])

  return {
    videoCodec: videoCodec ?? '—',
    audioCodec: audioCodec ?? '—',
    width: width ?? 0,
    height: height ?? 0,
    fps: fps ?? 0,
    videoBitrate: videoBitrate ?? 0,
    audioBitrate: audioBitrate ?? 0,
    audioChannels: audioChannels ? `${audioChannels}ch` : '—',
    audioSampleRate: audioSampleRate ?? 0,
    fileSize: fileSize ?? 0,
    format: format ?? '—',
    hwdec: hwdec ?? 'none',
    pixelFormat: pixelFormat ?? '—',
    colorspace: colorspace ?? '—',
  }
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-white/50 text-xs">{label}</span>
      <span className="text-white/90 text-xs font-mono text-right">{value}</span>
    </div>
  )
}

interface MediaInfoPanelProps {
  onClose: () => void
}

export function MediaInfoPanel({ onClose }: MediaInfoPanelProps): React.ReactElement {
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const fileName = usePlayerStore((s) => s.fileName)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMediaInfo()
      setInfo(data)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [refresh, fileName])

  return (
    <div
      className="absolute top-10 left-4 z-30 rounded-lg overflow-hidden"
      style={{
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        width: '300px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-white/80 text-xs font-semibold uppercase tracking-wider">
          Informations média
        </span>
        <button
          onClick={onClose}
          className="text-white/50 hover:text-white transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      {!info ? (
        <div className="px-3 py-4 text-white/40 text-xs text-center">Chargement...</div>
      ) : (
        <div className="px-3 py-2 space-y-1">
          <div className="text-white/30 text-[10px] uppercase tracking-wider pt-1">Vidéo</div>
          <InfoRow label="Codec" value={info.videoCodec} />
          <InfoRow label="Résolution" value={info.width ? `${info.width}×${info.height}` : '—'} />
          <InfoRow label="FPS" value={info.fps ? info.fps.toFixed(2) : '—'} />
          <InfoRow label="Bitrate" value={formatBitrate(info.videoBitrate)} />
          <InfoRow label="Pixel format" value={info.pixelFormat} />
          <InfoRow label="Colorspace" value={info.colorspace} />
          <InfoRow label="Décodage HW" value={info.hwdec === 'none' ? 'Non' : info.hwdec} />

          <div className="text-white/30 text-[10px] uppercase tracking-wider pt-2">Audio</div>
          <InfoRow label="Codec" value={info.audioCodec} />
          <InfoRow label="Canaux" value={info.audioChannels} />
          <InfoRow label="Bitrate" value={formatBitrate(info.audioBitrate)} />
          <InfoRow
            label="Échantillonnage"
            value={info.audioSampleRate ? `${(info.audioSampleRate / 1000).toFixed(1)} kHz` : '—'}
          />

          <div className="text-white/30 text-[10px] uppercase tracking-wider pt-2">Fichier</div>
          <InfoRow label="Format" value={info.format} />
          <InfoRow label="Taille" value={formatFileSize(info.fileSize)} />
        </div>
      )}
    </div>
  )
}
