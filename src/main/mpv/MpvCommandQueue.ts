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

  async observeProperty(id: number, name: string): Promise<void> {
    await this.client.sendCommand(['observe_property', id, name])
  }
}
