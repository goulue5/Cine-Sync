import React, { useRef, useEffect } from 'react'
import { videoEngine } from '../../video/videoEngine'
import { usePlayerStore } from '../../store/playerStore'

export function VideoPlayer(): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileName = usePlayerStore(s => s.fileName)

  // Attach/detach the video element to the engine
  useEffect(() => {
    if (videoRef.current) {
      videoEngine.attach(videoRef.current)
    }
    return () => videoEngine.detach()
  }, [])

  // Connect DOM events → store
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const store = usePlayerStore

    const onTimeUpdate = () => {
      const t = video.currentTime
      if (isFinite(t)) store.setState({ timePos: t })
    }
    const onDurationChange = () => {
      const d = video.duration
      if (d && isFinite(d) && d > 0) {
        store.setState({ duration: d })
      }
    }
    const onPlay = () => {
      store.setState({ isPlaying: true })
      window.mpvBridge.notifyPlaying()
    }
    const onPause = () => {
      store.setState({ isPlaying: false })
      window.mpvBridge.notifyPaused()
    }
    const onVolumeChange = () => {
      store.setState({
        volume: Math.round(video.volume * 100),
        mute: video.muted,
      })
    }
    const onRateChange = () => {
      store.setState({ speed: video.playbackRate })
    }
    const onEnded = () => {
      store.setState({ eofReached: true })
      const { playlist, playlistIndex } = store.getState()
      if (playlistIndex < playlist.length - 1) {
        store.getState().playNext()
      }
    }
    const onLoadStart = () => {
      store.setState({ isLoading: true, eofReached: false, mpvError: null })
    }
    const onLoadedMetadata = () => {
      // Extract file name from src
      try {
        const decoded = decodeURIComponent(video.src)
        const parts = decoded.split('/')
        const name = parts[parts.length - 1]
        if (name) store.setState({ fileName: name })
      } catch { /* ignore */ }
    }
    const onLoadedData = () => {
      store.setState({ isLoading: false, mpvError: null })
      video.play().catch(() => {})

      // Extract subtitle tracks
      setTimeout(() => {
        const tracks: import('../../store/playerStore').MpvTrack[] = []
        for (let i = 0; i < video.textTracks.length; i++) {
          const t = video.textTracks[i]
          tracks.push({ id: i + 1, type: 'sub', title: t.label || undefined, lang: t.language || undefined })
        }
        if (tracks.length > 0) store.setState({ trackList: tracks })
      }, 500)

      // Check for resume position
      const filePath = store.getState().filePath
      if (filePath) {
        window.mpvBridge.getResumePosition(filePath).then((pos) => {
          if (pos && pos > 0) {
            video.currentTime = pos
          }
        }).catch(() => {})
      }

      // After 1.5s: check if audio is actually playing (DTS/AC3 won't decode)
      setTimeout(async () => {
        const v = video as HTMLVideoElement & { webkitAudioDecodedByteCount?: number }
        if (v.webkitAudioDecodedByteCount !== undefined && v.webkitAudioDecodedByteCount === 0 && video.currentTime > 0.5) {
          const fp = store.getState().filePath
          if (!fp) return
          console.log('[VideoPlayer] no audio decoded, remuxing audio to AAC...')
          store.setState({ isLoading: true })
          const result = await window.mpvBridge.remuxAudio(fp)
          if (result.ok && result.path) {
            const currentTime = video.currentTime
            video.src = `file://${result.path}`
            video.load()
            video.currentTime = currentTime
            video.play().catch(() => {})
            store.setState({ isLoading: false })
            console.log('[VideoPlayer] switched to remuxed file with AAC audio')
          } else {
            store.setState({ isLoading: false })
          }
        }
      }, 1500)
    }
    const onError = () => {
      const err = video.error
      if (!err) return
      console.error('[VideoPlayer] error:', err.message)
      store.setState({
        isLoading: false,
        mpvError: `Format non supporté.\nEssayez un fichier MP4 ou MKV (H.264 + AAC).`,
      })
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('volumechange', onVolumeChange)
    video.addEventListener('ratechange', onRateChange)
    video.addEventListener('ended', onEnded)
    video.addEventListener('loadstart', onLoadStart)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('loadeddata', onLoadedData)
    video.addEventListener('error', onError)

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('volumechange', onVolumeChange)
      video.removeEventListener('ratechange', onRateChange)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('loadstart', onLoadStart)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('error', onError)
    }
  }, [])

  // Save position periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current
      if (!video || !video.src || video.paused) return
      const { filePath } = usePlayerStore.getState()
      if (filePath && video.duration > 0 && isFinite(video.duration)) {
        window.mpvBridge.savePosition(filePath, video.currentTime, video.duration)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 w-full h-full"
      style={{
        objectFit: 'contain',
        background: '#000',
        zIndex: 1,
        display: fileName ? 'block' : 'none',
      }}
    />
  )
}
