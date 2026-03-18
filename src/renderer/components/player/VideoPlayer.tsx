import React, { useRef, useEffect } from 'react'
import { videoEngine } from '../../video/videoEngine'
import { usePlayerStore } from '../../store/playerStore'

// Transcoder port (set by main process when ffmpeg server starts)
let transcoderPort: number | null = null

export function VideoPlayer(): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileName = usePlayerStore(s => s.fileName)
  const triedTranscoder = useRef(false)

  // Attach/detach the video element to the engine
  useEffect(() => {
    if (videoRef.current) {
      videoEngine.attach(videoRef.current)
    }
    return () => videoEngine.detach()
  }, [])

  // Listen for transcoder port from main process
  useEffect(() => {
    const cleanup = window.mpvBridge.onTranscoderPort((port) => {
      transcoderPort = port
      console.log(`[VideoPlayer] transcoder available on port ${port}`)
    })
    return cleanup
  }, [])

  // Connect DOM events → store
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const store = usePlayerStore

    const onTimeUpdate = () => {
      store.setState({ timePos: video.currentTime })
    }
    const onDurationChange = () => {
      store.setState({ duration: video.duration || 0 })
    }
    const onPlay = () => {
      store.setState({ isPlaying: true })
    }
    const onPause = () => {
      store.setState({ isPlaying: false })
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
      store.setState({ isLoading: true, eofReached: false })
      triedTranscoder.current = false
    }
    const tryTranscoderFallback = () => {
      const filePath = store.getState().filePath
      if (filePath && transcoderPort && !triedTranscoder.current) {
        triedTranscoder.current = true
        console.log('[VideoPlayer] no video frames, trying ffmpeg transcoder...')
        store.setState({ isLoading: true, mpvError: null })
        const parts = filePath.split('/')
        store.setState({ fileName: parts[parts.length - 1] || null })
        video.src = `http://127.0.0.1:${transcoderPort}/stream?path=${encodeURIComponent(filePath)}`
        video.load()
        video.play().catch(() => {})
      }
    }

    const onLoadedData = () => {
      store.setState({ isLoading: false, mpvError: null })
      video.play().catch(() => {})

      // Extract file name from src
      try {
        const src = video.src
        const decoded = decodeURIComponent(src)
        const parts = decoded.split('/')
        const name = parts[parts.length - 1]
        if (!name.startsWith('stream')) {
          store.setState({ fileName: name || null })
        }
      } catch { /* ignore */ }

      // Check if video frames are actually rendering
      // Chromium sometimes plays audio but can't decode video (unsupported pixel format)
      setTimeout(() => {
        if (!triedTranscoder.current && video.videoWidth === 0 && video.currentTime > 0) {
          tryTranscoderFallback()
        }
      }, 1000)

      // Check for resume position
      const filePath = store.getState().filePath
      if (filePath) {
        window.mpvBridge.getResumePosition(filePath).then((pos) => {
          if (pos && pos > 0) {
            video.currentTime = pos
            console.log(`[VideoPlayer] resumed at ${pos}s`)
          }
        }).catch(() => {})
      }
    }
    const onError = () => {
      const err = video.error
      if (!err) return

      // Try ffmpeg transcoder fallback for unsupported codecs
      if (!triedTranscoder.current) {
        tryTranscoderFallback()
        return
      }

      console.error('[VideoPlayer] error:', err.message)
      store.setState({ mpvError: `Erreur de lecture : ${err.message}` })
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('volumechange', onVolumeChange)
    video.addEventListener('ratechange', onRateChange)
    video.addEventListener('ended', onEnded)
    video.addEventListener('loadstart', onLoadStart)
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
      if (filePath && video.duration > 0) {
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
