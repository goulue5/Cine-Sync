import { BaseWindow } from 'electron'

export function getHwnd(win: BaseWindow): string {
  const buffer = win.getNativeWindowHandle()
  console.log(`[window] HWND buffer length=${buffer.length} hex=${buffer.toString('hex')}`)
  const hwnd = buffer.readBigUInt64LE(0).toString(10)
  console.log(`[window] HWND = ${hwnd}`)
  return hwnd
}
