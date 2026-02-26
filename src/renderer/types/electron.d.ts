import type { MpvBridge } from '../../preload/index'

declare global {
  interface Window {
    mpvBridge: MpvBridge
  }
}
