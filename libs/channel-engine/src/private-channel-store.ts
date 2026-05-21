import type { Fdc3Context } from '@fdc3-poc/fdc3-core';

/**
 * PrivateChannelStore — main-process authority for FDC3 PrivateChannels.
 *
 * A PrivateChannel is a 1:1 conversation, typically created by an intent
 * handler and returned as the intent result so the raiser receives streaming
 * follow-ups (e.g. order acks, fills, cancellation).
 *
 * Subscriber set is bounded — usually exactly two webContents (creator +
 * raiser), but we don't hard-cap it; FDC3 allows the creator to invite more
 * peers via additional intent flows.
 *
 * Lifecycle observation: when one side adds/removes a context listener or
 * disconnects, the OTHER side gets a notification. The router fans these out.
 */
const WILDCARD = '*';

export interface PrivateChannelLifecycleEvent {
  channelId: string;
  /** The remote side that *triggered* the event (the side the OTHER will be notified about). */
  triggeredBy: number;
  /** For listener add/remove events: which context type. null = wildcard. */
  contextType?: string | null;
  /** webContentsIds to notify. */
  notify: number[];
}

interface PrivateChannelState {
  id: string;
  creator: number;
  /** All webContents currently participating in this channel. */
  participants: Set<number>;
  /** (contextType | '*') → Set<webContentsId> */
  subs: Map<string, Set<number>>;
  /** contextType → last broadcast context. */
  cache: Map<string, Fdc3Context>;
  disconnected: boolean;
}

export class PrivateChannelStore {
  private readonly channels = new Map<string, PrivateChannelState>();

  /** Create a brand-new private channel owned by `creatorWebContentsId`. */
  create(channelId: string, creatorWebContentsId: number): void {
    if (this.channels.has(channelId)) {
      throw new Error(`PrivateChannel ${channelId} already exists`);
    }
    this.channels.set(channelId, {
      id: channelId,
      creator: creatorWebContentsId,
      participants: new Set([creatorWebContentsId]),
      subs: new Map(),
      cache: new Map(),
      disconnected: false,
    });
  }

  exists(channelId: string): boolean {
    return this.channels.has(channelId);
  }

  /**
   * Mark a webContents as participating in this channel. Returns true if this
   * was the first time `webContentsId` joined (so the router can fire onConnect
   * style notifications if needed).
   */
  ensureParticipant(channelId: string, webContentsId: number): boolean {
    const state = this.requireOpen(channelId);
    const wasNew = !state.participants.has(webContentsId);
    state.participants.add(webContentsId);
    return wasNew;
  }

  /** Broadcast — returns the participant webContents ids to deliver to (excluding sender). */
  broadcast(channelId: string, context: Fdc3Context, senderWebContentsId: number): number[] {
    const state = this.requireOpen(channelId);
    state.cache.set(context.type, context);
    this.ensureParticipant(channelId, senderWebContentsId);
    const typed = state.subs.get(context.type);
    const wild = state.subs.get(WILDCARD);
    return [...new Set([...(typed ?? []), ...(wild ?? [])])].filter((id) => id !== senderWebContentsId);
  }

  /**
   * Add a subscriber. Returns:
   *  - cached contexts to deliver immediately (FDC3 last-value semantics)
   *  - lifecycle notification (the *other* participants are told about the
   *    addContextListener event).
   */
  addListener(
    channelId: string,
    contextType: string | null,
    webContentsId: number,
  ): { cached: Fdc3Context[]; lifecycle: PrivateChannelLifecycleEvent } {
    const state = this.requireOpen(channelId);
    this.ensureParticipant(channelId, webContentsId);
    const key = contextType ?? WILDCARD;
    const set = state.subs.get(key) ?? new Set<number>();
    set.add(webContentsId);
    state.subs.set(key, set);

    const cached = key === WILDCARD ? [...state.cache.values()] : state.cache.has(key) ? [state.cache.get(key)!] : [];
    return {
      cached,
      lifecycle: {
        channelId,
        triggeredBy: webContentsId,
        contextType,
        notify: [...state.participants].filter((id) => id !== webContentsId),
      },
    };
  }

  removeListener(channelId: string, contextType: string | null, webContentsId: number): PrivateChannelLifecycleEvent | null {
    const state = this.channels.get(channelId);
    if (!state || state.disconnected) return null;
    const key = contextType ?? WILDCARD;
    state.subs.get(key)?.delete(webContentsId);
    return {
      channelId,
      triggeredBy: webContentsId,
      contextType,
      notify: [...state.participants].filter((id) => id !== webContentsId),
    };
  }

  getCurrentContext(channelId: string, contextType?: string): Fdc3Context | null {
    const state = this.channels.get(channelId);
    if (!state) return null;
    if (contextType) return state.cache.get(contextType) ?? null;
    let last: Fdc3Context | null = null;
    for (const ctx of state.cache.values()) last = ctx;
    return last;
  }

  /**
   * Mark the channel as disconnected and return the OTHER participants so the
   * router can push a `disconnected` event to them. Idempotent.
   */
  disconnect(channelId: string, triggeredBy: number): PrivateChannelLifecycleEvent | null {
    const state = this.channels.get(channelId);
    if (!state || state.disconnected) return null;
    state.disconnected = true;
    const others = [...state.participants].filter((id) => id !== triggeredBy);
    state.participants.clear();
    state.subs.clear();
    return { channelId, triggeredBy, notify: others };
  }

  /**
   * Clean up everything a webContents was participating in (called when its window
   * is destroyed). Returns a disconnect lifecycle event for every channel where
   * this window was the LAST participant on the other side.
   */
  removeWindow(webContentsId: number): PrivateChannelLifecycleEvent[] {
    const events: PrivateChannelLifecycleEvent[] = [];
    for (const [id, state] of this.channels) {
      if (!state.participants.has(webContentsId)) continue;
      state.participants.delete(webContentsId);
      for (const set of state.subs.values()) set.delete(webContentsId);
      const others = [...state.participants];
      if (others.length > 0) {
        events.push({ channelId: id, triggeredBy: webContentsId, notify: others });
      } else {
        state.disconnected = true;
      }
    }
    return events;
  }

  private requireOpen(channelId: string): PrivateChannelState {
    const state = this.channels.get(channelId);
    if (!state) throw new Error(`Unknown PrivateChannel: ${channelId}`);
    if (state.disconnected) throw new Error(`PrivateChannel ${channelId} is disconnected`);
    return state;
  }
}
