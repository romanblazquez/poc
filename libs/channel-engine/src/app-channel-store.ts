import type { ChannelDisplayMetadata, Fdc3Context } from '@fdc3-poc/fdc3-core';

/**
 * AppChannelStore — main-process authority for FDC3 App Channels.
 *
 * App Channels are separate from User Channels:
 *   - Anyone with the channel id can broadcast / listen — no "membership".
 *   - Each channel keeps a last-value cache PER context type (not just one bucket),
 *     so new subscribers receive every cached context type on first addListener.
 *   - Subscriptions are tracked per (channelId, contextType, webContentsId) so the
 *     router can fan out only to the windows that actually asked for that channel.
 */
export interface AppChannelMeta {
  id: string;
  type: 'app';
  displayMetadata?: ChannelDisplayMetadata;
}

const WILDCARD = '*';

export class AppChannelStore {
  private readonly meta = new Map<string, AppChannelMeta>();
  /** channelId → (contextType | '*') → Set<webContentsId> */
  private readonly subs = new Map<string, Map<string, Set<number>>>();
  /** channelId → contextType → most recent context */
  private readonly cache = new Map<string, Map<string, Fdc3Context>>();

  /** Lookup-or-create the metadata for `channelId`. Idempotent. */
  getOrCreate(channelId: string, displayMetadata?: ChannelDisplayMetadata): AppChannelMeta {
    let m = this.meta.get(channelId);
    if (!m) {
      m = { id: channelId, type: 'app', displayMetadata };
      this.meta.set(channelId, m);
    }
    return m;
  }

  /** Returns true when the channel id has been created. */
  exists(channelId: string): boolean {
    return this.meta.has(channelId);
  }

  /** Store the broadcast in the last-value cache, return the subscribers to deliver to. */
  broadcast(channelId: string, context: Fdc3Context): number[] {
    this.getOrCreate(channelId);
    const byType = this.cache.get(channelId) ?? new Map<string, Fdc3Context>();
    byType.set(context.type, context);
    this.cache.set(channelId, byType);

    const channelSubs = this.subs.get(channelId);
    if (!channelSubs) return [];
    const typed = channelSubs.get(context.type);
    const wild = channelSubs.get(WILDCARD);
    return [...new Set([...(typed ?? []), ...(wild ?? [])])];
  }

  /**
   * Register `webContentsId` as a subscriber on `channelId` for `contextType`
   * (or '*' for all). Returns the last-value cache entries that should be
   * delivered immediately to satisfy FDC3 last-value semantics.
   */
  addListener(channelId: string, contextType: string | null, webContentsId: number): Fdc3Context[] {
    this.getOrCreate(channelId);
    const key = contextType ?? WILDCARD;
    const channelSubs = this.subs.get(channelId) ?? new Map<string, Set<number>>();
    const set = channelSubs.get(key) ?? new Set<number>();
    set.add(webContentsId);
    channelSubs.set(key, set);
    this.subs.set(channelId, channelSubs);

    const cached = this.cache.get(channelId);
    if (!cached) return [];
    if (key === WILDCARD) return [...cached.values()];
    const single = cached.get(key);
    return single ? [single] : [];
  }

  removeListener(channelId: string, contextType: string | null, webContentsId: number): void {
    const key = contextType ?? WILDCARD;
    this.subs.get(channelId)?.get(key)?.delete(webContentsId);
  }

  /** Drop every subscription for the given window across every channel. */
  removeWindow(webContentsId: number): void {
    for (const channelSubs of this.subs.values()) {
      for (const set of channelSubs.values()) set.delete(webContentsId);
    }
  }

  /** Get the cached context for a channel (single type, or every type if not specified). */
  getCurrentContext(channelId: string, contextType?: string): Fdc3Context | null {
    const cached = this.cache.get(channelId);
    if (!cached) return null;
    if (contextType) return cached.get(contextType) ?? null;
    // FDC3: when contextType is omitted, return the most recently broadcast context.
    // Map preserves insertion order, so the last entry is the most recent.
    let last: Fdc3Context | null = null;
    for (const ctx of cached.values()) last = ctx;
    return last;
  }
}
