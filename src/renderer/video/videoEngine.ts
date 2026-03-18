/**
 * VideoEngine — wraps HTMLVideoElement with the same API surface as the old mpv bridge.
 * All playback control happens directly in the renderer (no IPC needed).
 */

let videoEl: HTMLVideoElement | null = null
const subtitleBlobUrls: string[] = []

// CSS filter values
const filters = { brightness: 0, contrast: 0, saturation: 0, gamma: 0 }

function applyFilters(): void {
  if (!videoEl) return
  const b = 1 + filters.brightness / 100
  const c = 1 + filters.contrast / 100
  const s = 1 + filters.saturation / 100
  // gamma approximation via brightness curve
  const g = filters.gamma !== 0 ? Math.pow(1 + Math.abs(filters.gamma) / 100, filters.gamma > 0 ? 1 : -1) : 1
  videoEl.style.filter = `brightness(${b * g}) contrast(${c}) saturate(${s})`
}

export const videoEngine = {
  /** Register the <video> element */
  attach(el: HTMLVideoElement): void {
    videoEl = el
  },

  detach(): void {
    videoEl = null
  },

  get element(): HTMLVideoElement | null {
    return videoEl
  },

  // ── Playback ──────────────────────────────────────────────────────────

  loadFile(filePath: string): void {
    if (!videoEl) return
    this.clearSubtitles()
    videoEl.src = `file://${filePath}`
    videoEl.load()
  },

  play(): void {
    videoEl?.play().catch(() => {})
  },

  pause(): void {
    videoEl?.pause()
  },

  togglePause(): void {
    if (!videoEl) return
    if (videoEl.paused) videoEl.play().catch(() => {})
    else videoEl.pause()
  },

  seek(seconds: number, mode: 'absolute' | 'relative' = 'absolute'): void {
    if (!videoEl) return
    if (mode === 'absolute') {
      videoEl.currentTime = seconds
    } else {
      videoEl.currentTime = Math.max(0, videoEl.currentTime + seconds)
    }
  },

  setVolume(vol: number): void {
    if (!videoEl) return
    videoEl.volume = Math.max(0, Math.min(1, vol / 100))
  },

  setMute(mute: boolean): void {
    if (!videoEl) return
    videoEl.muted = mute
  },

  setSpeed(speed: number): void {
    if (!videoEl) return
    videoEl.playbackRate = speed
  },

  stop(): void {
    if (!videoEl) return
    videoEl.pause()
    videoEl.removeAttribute('src')
    videoEl.load()
  },

  // ── Tracks ────────────────────────────────────────────────────────────

  getAudioTracks(): { id: number; label: string; language: string; enabled: boolean }[] {
    if (!videoEl || !videoEl.audioTracks) return []
    const tracks = []
    for (let i = 0; i < videoEl.audioTracks.length; i++) {
      const t = videoEl.audioTracks[i]
      tracks.push({ id: i, label: t.label || `Piste ${i + 1}`, language: t.language, enabled: t.enabled })
    }
    return tracks
  },

  setAudioTrack(id: number | 'no'): void {
    if (!videoEl || !videoEl.audioTracks) return
    for (let i = 0; i < videoEl.audioTracks.length; i++) {
      videoEl.audioTracks[i].enabled = (id === i)
    }
  },

  getTextTracks(): { id: number; label: string; language: string; mode: string }[] {
    if (!videoEl) return []
    const tracks = []
    for (let i = 0; i < videoEl.textTracks.length; i++) {
      const t = videoEl.textTracks[i]
      tracks.push({ id: i, label: t.label || `Sous-titre ${i + 1}`, language: t.language, mode: t.mode })
    }
    return tracks
  },

  setSubtitleTrack(id: number | 'no'): void {
    if (!videoEl) return
    for (let i = 0; i < videoEl.textTracks.length; i++) {
      videoEl.textTracks[i].mode = (id === i) ? 'showing' : 'hidden'
    }
  },

  /** Add an external subtitle file (SRT → VTT conversion happens in main process) */
  async addSubtitle(vttContent: string, label: string, lang: string): Promise<void> {
    if (!videoEl) return
    const blob = new Blob([vttContent], { type: 'text/vtt' })
    const url = URL.createObjectURL(blob)
    subtitleBlobUrls.push(url)
    const track = document.createElement('track')
    track.kind = 'subtitles'
    track.label = label
    track.srclang = lang
    track.src = url
    videoEl.appendChild(track)
    track.track.mode = 'showing'
  },

  /** Remove all external subtitle tracks and free blob URLs */
  clearSubtitles(): void {
    if (!videoEl) return
    const tracks = videoEl.querySelectorAll('track')
    tracks.forEach(t => t.remove())
    for (const url of subtitleBlobUrls) URL.revokeObjectURL(url)
    subtitleBlobUrls.length = 0
  },

  // ── Filters (CSS) ────────────────────────────────────────────────────

  setProperty(name: string, value: number): void {
    if (name in filters) {
      filters[name as keyof typeof filters] = value
      applyFilters()
    }
  },

  // ── Info ──────────────────────────────────────────────────────────────

  async getProperty(name: string): Promise<unknown> {
    if (!videoEl) return null
    switch (name) {
      case 'video-codec': return ''
      case 'audio-codec-name': return ''
      case 'width': return videoEl.videoWidth
      case 'height': return videoEl.videoHeight
      case 'estimated-vf-fps': return 0
      case 'video-bitrate': return 0
      case 'audio-bitrate': return 0
      case 'audio-params/channel-count': return 0
      case 'audio-params/samplerate': return 0
      case 'file-size': return 0
      case 'file-format': return videoEl.src.split('.').pop() ?? ''
      case 'hwdec-current': return 'auto'
      case 'video-params/pixelformat': return ''
      case 'video-params/colormatrix': return ''
      default: return null
    }
  },
}
