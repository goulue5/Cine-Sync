import { create } from 'zustand'
import { videoEngine } from '../video/videoEngine'

export interface MpvTrack {
  id: number
  type: 'audio' | 'video' | 'sub'
  title?: string
  lang?: string
  codec?: string
  selected?: boolean
  default?: boolean
  external?: boolean
}

export interface MpvChapter {
  title: string
  time: number
}

export interface PlayerState {
  // Playback
  isPlaying: boolean
  timePos: number
  duration: number
  volume: number
  mute: boolean
  filePath: string | null
  fileName: string | null
  eofReached: boolean
  speed: number
  isLoading: boolean

  // Playlist
  playlist: string[]
  playlistIndex: number

  // Tracks
  trackList: MpvTrack[]
  currentAid: number | 'auto' | 'no' | null
  currentSid: number | 'auto' | 'no' | null
  subDelay: number
  audioDelay: number

  // Chapters
  chapters: MpvChapter[]
  currentChapter: number

  // UI
  controlsVisible: boolean
  settingsOpen: boolean
  mpvError: string | null

  // Actions
  setIsPlaying: (v: boolean) => void
  setTimePos: (v: number) => void
  setDuration: (v: number) => void
  setVolume: (v: number) => void
  setMute: (v: boolean) => void
  setFilePath: (v: string | null) => void
  setFileName: (v: string | null) => void
  setEofReached: (v: boolean) => void
  setSpeed: (v: number) => void
  setIsLoading: (v: boolean) => void
  setTrackList: (v: MpvTrack[]) => void
  setCurrentAid: (v: number | 'auto' | 'no' | null) => void
  setCurrentSid: (v: number | 'auto' | 'no' | null) => void
  setSubDelay: (v: number) => void
  setAudioDelay: (v: number) => void
  setChapters: (v: MpvChapter[]) => void
  setCurrentChapter: (v: number) => void
  setControlsVisible: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setMpvError: (v: string | null) => void

  // Playlist actions
  loadPlaylist: (files: string[], startIndex?: number) => void
  playNext: () => void
  playPrev: () => void
  playIndex: (index: number) => void
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  isPlaying: false,
  timePos: 0,
  duration: 0,
  volume: 100,
  mute: false,
  filePath: null,
  fileName: null,
  eofReached: false,
  speed: 1,
  isLoading: false,
  playlist: [],
  playlistIndex: 0,
  trackList: [],
  currentAid: null,
  currentSid: null,
  subDelay: 0,
  audioDelay: 0,
  chapters: [],
  currentChapter: 0,
  controlsVisible: true,
  settingsOpen: false,
  mpvError: null,

  setIsPlaying: (v) => set({ isPlaying: v }),
  setTimePos: (v) => set({ timePos: v ?? 0 }),
  setDuration: (v) => set({ duration: v ?? 0 }),
  setVolume: (v) => set({ volume: v ?? 100 }),
  setMute: (v) => set({ mute: v }),
  setFilePath: (v) => set({ filePath: v }),
  setFileName: (v) => set({ fileName: v }),
  setEofReached: (v) => set({ eofReached: v }),
  setSpeed: (v) => set({ speed: v ?? 1 }),
  setIsLoading: (v) => set({ isLoading: v }),
  setTrackList: (v) => set({ trackList: v ?? [] }),
  setCurrentAid: (v) => set({ currentAid: v }),
  setCurrentSid: (v) => set({ currentSid: v }),
  setSubDelay: (v) => set({ subDelay: v ?? 0 }),
  setAudioDelay: (v) => set({ audioDelay: v ?? 0 }),
  setChapters: (v) => set({ chapters: v ?? [] }),
  setCurrentChapter: (v) => set({ currentChapter: v ?? 0 }),
  setControlsVisible: (v) => set({ controlsVisible: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setMpvError: (v) => set({ mpvError: v }),

  // ── Playlist actions — use videoEngine directly ───────────────────────
  loadPlaylist: (files, startIndex = 0) => {
    if (files.length === 0) return
    const filePath = files[startIndex]
    set({ playlist: files, playlistIndex: startIndex, isLoading: true, filePath, fileName: null, mpvError: null })
    videoEngine.loadFile(filePath)
  },

  playNext: () => {
    const { playlist, playlistIndex } = get()
    if (playlistIndex < playlist.length - 1) {
      const next = playlistIndex + 1
      const filePath = playlist[next]
      set({ playlistIndex: next, isLoading: true, filePath })
      videoEngine.loadFile(filePath)
    }
  },

  playPrev: () => {
    const { playlist, playlistIndex } = get()
    if (playlistIndex > 0) {
      const prev = playlistIndex - 1
      const filePath = playlist[prev]
      set({ playlistIndex: prev, isLoading: true, filePath })
      videoEngine.loadFile(filePath)
    }
  },

  playIndex: (index) => {
    const { playlist } = get()
    if (index >= 0 && index < playlist.length) {
      const filePath = playlist[index]
      set({ playlistIndex: index, isLoading: true, filePath })
      videoEngine.loadFile(filePath)
    }
  },
}))
