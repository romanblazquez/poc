import type { UserChannel, Fdc3Context } from '@fdc3-poc/fdc3-core';
import { DEFAULT_USER_CHANNELS } from '@fdc3-poc/fdc3-core';
import { UserChannelState } from './user-channel.js';

/**
 * ChannelManager — Main-process authority for all user channel state.
 *
 * Responsibilities:
 * - Maintain the registry of available channels (loaded from config/channels.json)
 * - Track which webContents window is on which channel
 * - Provide last-value-cache so a newly joined window catches up immediately
 */
export class ChannelManager {
  private readonly channels = new Map<string, UserChannelState>();
  /** webContentsId → channelId */
  private readonly windowChannels = new Map<number, string>();

  constructor(channelDefs: UserChannel[] = DEFAULT_USER_CHANNELS) {
    for (const ch of channelDefs) {
      this.channels.set(ch.id, new UserChannelState(ch));
    }
  }

  getChannels(): UserChannel[] {
    return [...this.channels.values()].map((s) => s.channel);
  }

  getChannel(channelId: string): UserChannelState | undefined {
    return this.channels.get(channelId);
  }

  joinChannel(webContentsId: number, channelId: string): void {
    if (!this.channels.has(channelId)) {
      throw new Error(`Unknown channel: ${channelId}`);
    }
    this.windowChannels.set(webContentsId, channelId);
  }

  leaveChannel(webContentsId: number): void {
    this.windowChannels.delete(webContentsId);
  }

  getCurrentChannelId(webContentsId: number): string | null {
    return this.windowChannels.get(webContentsId) ?? null;
  }

  getCurrentChannel(webContentsId: number): UserChannel | null {
    const channelId = this.getCurrentChannelId(webContentsId);
    if (!channelId) return null;
    return this.channels.get(channelId)?.channel ?? null;
  }

  /** Returns all webContentsIds currently on the given channel */
  getWindowsInChannel(channelId: string): number[] {
    return [...this.windowChannels.entries()]
      .filter(([, ch]) => ch === channelId)
      .map(([id]) => id);
  }

  recordBroadcast(channelId: string, context: Fdc3Context): void {
    this.channels.get(channelId)?.setLastContext(context);
  }

  getLastContext(channelId: string): Fdc3Context | null {
    return this.channels.get(channelId)?.getLastContext() ?? null;
  }

  removeWindow(webContentsId: number): void {
    this.windowChannels.delete(webContentsId);
  }
}
