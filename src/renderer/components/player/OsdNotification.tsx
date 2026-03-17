import React, { useEffect, useState, useRef } from 'react'
import { create } from 'zustand'

interface OsdState {
  message: string | null
  show: (msg: string) => void
}

export const useOsd = create<OsdState>((set) => ({
  message: null,
  show: (msg) => set({ message: msg }),
}))

const OSD_DURATION = 1500
const FADE_DURATION = 300

export function OsdNotification(): React.ReactElement | null {
  const message = useOsd((s) => s.message)
  const [visible, setVisible] = useState(false)
  const [display, setDisplay] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!message) return

    // Show immediately
    setDisplay(true)
    setVisible(true)

    // Clear previous timers
    if (timerRef.current) clearTimeout(timerRef.current)
    if (fadeRef.current) clearTimeout(fadeRef.current)

    // Start fade after duration
    timerRef.current = setTimeout(() => {
      setVisible(false)
      fadeRef.current = setTimeout(() => {
        setDisplay(false)
      }, FADE_DURATION)
    }, OSD_DURATION)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (fadeRef.current) clearTimeout(fadeRef.current)
    }
  }, [message])

  if (!display) return null

  return (
    <div
      className="absolute top-12 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_DURATION}ms ease`,
      }}
    >
      <div
        className="px-5 py-2.5 rounded-lg text-white text-sm font-medium"
        style={{
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        }}
      >
        {message}
      </div>
    </div>
  )
}
