// mpv IPC protocol types

export interface MpvCommand {
  command: (string | number | boolean)[]
  request_id?: number
}

export interface MpvResponse {
  error: 'success' | string
  data?: unknown
  request_id?: number
}

export interface MpvEvent {
  event: string
  name?: string
  data?: unknown
  id?: number
}

export type MpvMessage = MpvResponse | MpvEvent

export function isMpvEvent(msg: MpvMessage): msg is MpvEvent {
  return 'event' in msg
}

export function isMpvResponse(msg: MpvMessage): msg is MpvResponse {
  return 'error' in msg
}

export interface MpvPlayerState {
  isPlaying: boolean
  timePos: number
  duration: number
  volume: number
  mute: boolean
  filePath: string | null
}
