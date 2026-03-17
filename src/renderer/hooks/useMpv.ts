import { useEffect } from 'react'
import { usePlayerStore, MpvTrack } from '../store/playerStore'

interface MpvPropertyChangeEvent {
  event: 'property-change'
  name: string
  data: unknown
}

interface MpvGenericEvent {
  event: string
  [key: string]: unknown
}

type MpvEvent = MpvPropertyChangeEvent | MpvGenericEvent

export function useMpv(): void {
  const store = usePlayerStore()

  useEffect(() => {
    const cleanup = window.mpvBridge.onMpvEvent((raw) => {
      const event = raw as MpvEvent

      if (event.event === 'property-change') {
        const e = event as MpvPropertyChangeEvent
        switch (e.name) {
          case 'time-pos':
            store.setTimePos(typeof e.data === 'number' ? e.data : 0)
            break
          case 'pause':
            store.setIsPlaying(e.data === false)
            break
          case 'duration':
            store.setDuration(typeof e.data === 'number' ? e.data : 0)
            break
          case 'volume':
            store.setVolume(typeof e.data === 'number' ? e.data : 100)
            break
          case 'mute':
            store.setMute(e.data === true)
            break
          case 'filename':
            store.setFileName(typeof e.data === 'string' ? e.data : null)
            break
          case 'eof-reached':
            store.setEofReached(e.data === true)
            // Auto-play next in playlist when EOF is reached
            if (e.data === true) {
              const { playlist, playlistIndex } = usePlayerStore.getState()
              if (playlistIndex < playlist.length - 1) {
                store.playNext()
              }
            }
            break
          case 'track-list':
            if (Array.isArray(e.data)) {
              store.setTrackList(e.data as MpvTrack[])
            }
            break
          case 'aid':
            store.setCurrentAid(e.data as number | 'auto' | 'no' | null)
            break
          case 'sid':
            store.setCurrentSid(e.data as number | 'auto' | 'no' | null)
            break
          case 'speed':
            store.setSpeed(typeof e.data === 'number' ? e.data : 1)
            break
          case 'sub-delay':
            store.setSubDelay(typeof e.data === 'number' ? e.data : 0)
            break
          case 'audio-delay':
            store.setAudioDelay(typeof e.data === 'number' ? e.data : 0)
            break
          case 'path':
            store.setFilePath(typeof e.data === 'string' ? e.data : null)
            break
        }
      } else if (event.event === 'external-file') {
        // File opened via double-click / "Open With"
        const filePath = event.data as string
        if (filePath) {
          store.loadPlaylist([filePath], 0)
        }
      } else if (event.event === 'start-file') {
        store.setEofReached(false)
        store.setTimePos(0)
        store.setIsLoading(true)
      } else if (event.event === 'file-loaded') {
        store.setIsLoading(false)
      }
    })

    const cleanupError = window.mpvBridge.onMpvError((raw) => {
      const err = raw as { type: string; message?: string; path?: string }
      if (err.type === 'mpv-not-found') {
        store.setMpvError(`mpv.exe introuvable.\nChemin attendu: ${err.path}`)
      } else {
        store.setMpvError(err.message ?? 'Erreur mpv inconnue')
      }
    })

    const cleanupResumed = window.mpvBridge.onMpvResumed((data) => {
      console.log(`[useMpv] resumed at ${data.position}s`)
    })

    return () => {
      cleanup()
      cleanupError()
      cleanupResumed()
    }
  }, [])
}
