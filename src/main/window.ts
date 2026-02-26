import { BrowserWindow } from 'electron'

/**
 * Extract the Win32 HWND from the Electron BrowserWindow.
 * Must be called AFTER win.show() — the native handle isn't stable before then.
 */
export function getHwnd(win: BrowserWindow): string {
  const buffer = win.getNativeWindowHandle()

  // On Windows x64: HWND is a 64-bit pointer stored as little-endian in the buffer
  const hwnd = buffer.readBigUInt64LE(0).toString(10)
  console.log(`[window] HWND = ${hwnd}`)
  return hwnd
}
