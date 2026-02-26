import { create } from 'zustand'

export interface PlayerState {
  // Playback state
  isPlaying: boolean
  timePos: number        // seconds
  duration: number       // seconds
  volume: number         // 0–130
  mute: boolean
  filePath: string | null
  fileName: string | null
  eofReached: boolean

  // UI state
  controlsVisible: boolean
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
  setControlsVisible: (v: boolean) => void
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
  controlsVisible: true,
  mpvError: null,

  setIsPlaying: (v) => set({ isPlaying: v }),
  setTimePos: (v) => set({ timePos: v ?? 0 }),
  setDuration: (v) => set({ duration: v ?? 0 }),
  setVolume: (v) => set({ volume: v ?? 100 }),
  setMute: (v) => set({ mute: v }),
  setFilePath: (v) => set({ filePath: v }),
  setFileName: (v) => set({ fileName: v }),
  setEofReached: (v) => set({ eofReached: v }),
  setControlsVisible: (v) => set({ controlsVisible: v }),
  setMpvError: (v) => set({ mpvError: v }),
}))
