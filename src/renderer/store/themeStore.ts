import { create } from 'zustand'

export interface AccentTheme {
  name: string
  color: string      // primary accent (buttons, active states)
  colorMuted: string  // softer variant (seekbar fill, subtle accents)
}

export const ACCENT_THEMES: Record<string, AccentTheme> = {
  blue:   { name: 'Bleu',    color: 'rgb(59,130,246)',  colorMuted: 'rgba(59,130,246,0.7)' },
  red:    { name: 'Rouge',   color: 'rgb(239,68,68)',   colorMuted: 'rgba(239,68,68,0.7)' },
  green:  { name: 'Vert',    color: 'rgb(34,197,94)',   colorMuted: 'rgba(34,197,94,0.7)' },
  purple: { name: 'Violet',  color: 'rgb(168,85,247)',  colorMuted: 'rgba(168,85,247,0.7)' },
  orange: { name: 'Orange',  color: 'rgb(249,115,22)',  colorMuted: 'rgba(249,115,22,0.7)' },
  pink:   { name: 'Rose',    color: 'rgb(236,72,153)',  colorMuted: 'rgba(236,72,153,0.7)' },
  cyan:   { name: 'Cyan',    color: 'rgb(6,182,212)',   colorMuted: 'rgba(6,182,212,0.7)' },
  white:  { name: 'Blanc',   color: 'rgb(255,255,255)', colorMuted: 'rgba(255,255,255,0.75)' },
}

interface ThemeState {
  accent: string
  setAccent: (color: string) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  accent: 'blue',
  setAccent: (color) => {
    set({ accent: color })
    applyTheme(color)
    window.mpvBridge.setTheme(color)
  },
}))

function applyTheme(accent: string): void {
  const theme = ACCENT_THEMES[accent] ?? ACCENT_THEMES.blue
  document.documentElement.style.setProperty('--accent', theme.color)
  document.documentElement.style.setProperty('--accent-muted', theme.colorMuted)
}

/** Load saved theme on app start */
export async function initTheme(): Promise<void> {
  const saved = await window.mpvBridge.getTheme()
  const accent = typeof saved === 'string' && saved in ACCENT_THEMES ? saved : 'blue'
  useThemeStore.setState({ accent })
  applyTheme(accent)
}
