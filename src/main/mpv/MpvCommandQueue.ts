import { MpvIpcClient } from './MpvIpcClient'

/**
 * High-level mpv command API wrapping raw IPC commands.
 */
export class MpvCommandQueue {
  constructor(private client: MpvIpcClient) {}

  async loadFile(filePath: string): Promise<void> {
    await this.client.sendCommand(['loadfile', filePath, 'replace'])
  }

  async play(): Promise<void> {
    await this.client.sendCommand(['set_property', 'pause', false])
  }

  async pause(): Promise<void> {
    await this.client.sendCommand(['set_property', 'pause', true])
  }

  async togglePause(): Promise<void> {
    await this.client.sendCommand(['cycle', 'pause'])
  }

  async seek(seconds: number, mode: 'absolute' | 'relative' = 'absolute'): Promise<void> {
    await this.client.sendCommand(['seek', seconds, mode])
  }

  async setVolume(volume: number): Promise<void> {
    // mpv volume 0-130 (100 = 100%)
    const clamped = Math.max(0, Math.min(130, volume))
    await this.client.sendCommand(['set_property', 'volume', clamped])
  }

  async setMute(mute: boolean): Promise<void> {
    await this.client.sendCommand(['set_property', 'mute', mute])
  }

  async stop(): Promise<void> {
    await this.client.sendCommand(['stop'])
  }

  async getProperty(name: string): Promise<unknown> {
    return this.client.sendCommand(['get_property', name])
  }

  async setProperty(name: string, value: string | number | boolean): Promise<void> {
    await this.client.sendCommand(['set_property', name, value])
  }

  async observeProperty(id: number, name: string): Promise<void> {
    await this.client.sendCommand(['observe_property', id, name])
  }

  // ── Track management ────────────────────────────────────────────────────

  async getTrackList(): Promise<unknown> {
    return this.client.sendCommand(['get_property', 'track-list'])
  }

  async setAudioTrack(id: number | 'auto' | 'no'): Promise<void> {
    await this.client.sendCommand(['set_property', 'aid', id])
  }

  async setSubtitleTrack(id: number | 'auto' | 'no'): Promise<void> {
    await this.client.sendCommand(['set_property', 'sid', id])
  }

  async cycleAudioTrack(): Promise<void> {
    await this.client.sendCommand(['cycle', 'aid'])
  }

  async cycleSubtitleTrack(): Promise<void> {
    await this.client.sendCommand(['cycle', 'sid'])
  }

  // ── Playback options ────────────────────────────────────────────────────

  async setSpeed(speed: number): Promise<void> {
    const clamped = Math.max(0.25, Math.min(4, speed))
    await this.client.sendCommand(['set_property', 'speed', clamped])
  }

  async setSubDelay(seconds: number): Promise<void> {
    await this.client.sendCommand(['set_property', 'sub-delay', seconds])
  }

  async setAudioDelay(seconds: number): Promise<void> {
    await this.client.sendCommand(['set_property', 'audio-delay', seconds])
  }

  // ── Subtitles ─────────────────────────────────────────────────────────────

  async addSubtitle(filePath: string): Promise<void> {
    await this.client.sendCommand(['sub-add', filePath, 'auto'])
  }
}
