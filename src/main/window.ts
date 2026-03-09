import { BaseWindow } from 'electron'

/**
 * Returns the native window handle as a decimal string for mpv's --wid flag.
 * Only works on Windows (HWND). On macOS, --wid is silently ignored by mpv.
 */
export function getNativeViewHandle(win: BaseWindow): string {
  const buffer = win.getNativeWindowHandle()
  console.log(`[window] native handle buffer length=${buffer.length} hex=${buffer.toString('hex')}`)

  let handle: string
  if (buffer.length >= 8) {
    handle = buffer.readBigUInt64LE(0).toString(10)
  } else if (buffer.length >= 4) {
    handle = buffer.readUInt32LE(0).toString(10)
  } else {
    throw new Error(`Unexpected native handle buffer length: ${buffer.length}`)
  }

  console.log(`[window] native handle = ${handle}`)
  return handle
}
