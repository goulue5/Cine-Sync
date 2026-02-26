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
        }
      } else if (event.event === 'start-file') {
        store.setEofReached(false)
        store.setTimePos(0)
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

    return () => {
      cleanup()
      cleanupError()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
