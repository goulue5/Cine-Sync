import { create } from 'zustand'

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

  // Tracks
  trackList: MpvTrack[]
  currentAid: number | 'auto' | 'no' | null
  currentSid: number | 'auto' | 'no' | null
  subDelay: number
  audioDelay: number

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
  setTrackList: (v: MpvTrack[]) => void
  setCurrentAid: (v: number | 'auto' | 'no' | null) => void
  setCurrentSid: (v: number | 'auto' | 'no' | null) => void
  setSubDelay: (v: number) => void
  setAudioDelay: (v: number) => void
  setControlsVisible: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setMpvError: (v: string | null) => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  isPlaying: false,
  timePos: 0,
  duration: 0,
  volume: 100,
  mute: false,
  filePath: null,
  fileName: null,
  eofReached: false,
  speed: 1,
  trackList: [],
  currentAid: null,
  currentSid: null,
  subDelay: 0,
  audioDelay: 0,
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
  setTrackList: (v) => set({ trackList: v ?? [] }),
  setCurrentAid: (v) => set({ currentAid: v }),
  setCurrentSid: (v) => set({ currentSid: v }),
  setSubDelay: (v) => set({ subDelay: v ?? 0 }),
  setAudioDelay: (v) => set({ audioDelay: v ?? 0 }),
  setControlsVisible: (v) => set({ controlsVisible: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setMpvError: (v) => set({ mpvError: v }),
}))
