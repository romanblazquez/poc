import type { UserChannel, Fdc3Context } from '@fdc3-poc/fdc3-core';

/**
 * Runtime state for a single user channel.
 * Tracks the last broadcast context so new joiners can receive it immediately (last-value cache).
 */
export class UserChannelState {
  private lastContext: Fdc3Context | null = null;

  constructor(public readonly channel: UserChannel) {}

  setLastContext(context: Fdc3Context): void {
    this.lastContext = context;
  }

  getLastContext(): Fdc3Context | null {
    return this.lastContext;
  }
}
