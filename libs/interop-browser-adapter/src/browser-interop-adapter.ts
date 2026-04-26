/**
 * BrowserInteropAdapter — browser-only implementation of InteropAdapter.
 *
 * Uses BroadcastChannel for cross-tab context propagation and in-memory
 * storage for channel state. Suitable for:
 *   - Local development without Electron
 *   - Storybook / unit test environments
 *   - Future SaaS browser-only deployment
 *
 * Limitation: intent resolution in browser mode is local-only (same tab).
 * For cross-tab intent routing a coordination layer (e.g. SharedWorker) would
 * be needed in production; that is out of scope for this POC.
 */

import type {
  Fdc3Context,
  IntentResolution,
  UserChannel,
  InteropAdapter,
  Unsubscribe,
} from '@fdc3-poc/fdc3-core';
import { DEFAULT_USER_CHANNELS, IntentResolutionError } from '@fdc3-poc/fdc3-core';
import { BroadcastChannelBus } from './broadcast-channel-bus.js';

export class BrowserInteropAdapter implements InteropAdapter {
  private readonly bus: BroadcastChannelBus;
  private readonly contextHandlers = new Map<string, Set<(ctx: Fdc3Context) => void>>();
  private readonly intentHandlers = new Map<
    string,
    Set<(ctx?: Fdc3Context) => Promise<void> | void>
  >();
  private currentChannelId: string | null = null;
  private busUnsub: (() => void) | null = null;

  constructor() {
    this.bus = new BroadcastChannelBus();
    this.busUnsub = this.bus.subscribe((msg) => {
      if (msg.type === 'context') {
        if (msg.channelId !== this.currentChannelId) return;
        this.dispatchContext(msg.context);
      }
    });
  }

  private dispatchContext(context: Fdc3Context): void {
    const type = context.type;
    const typed = this.contextHandlers.get(type) ?? new Set();
    const wildcard = this.contextHandlers.get('*') ?? new Set();
    [...typed, ...wildcard].forEach((h) => h(context));
  }

  async broadcastContext(context: Fdc3Context): Promise<void> {
    if (!this.currentChannelId) return;
    this.bus.publish({ type: 'context', channelId: this.currentChannelId, context });
    this.dispatchContext(context);
  }

  addContextListener<T extends Fdc3Context>(
    type: string | null,
    handler: (context: T) => void,
  ): Unsubscribe {
    const key = type ?? '*';
    if (!this.contextHandlers.has(key)) this.contextHandlers.set(key, new Set());
    this.contextHandlers.get(key)!.add(handler as (ctx: Fdc3Context) => void);
    return () => this.contextHandlers.get(key)?.delete(handler as (ctx: Fdc3Context) => void);
  }

  async raiseIntent(intent: string, context?: Fdc3Context): Promise<IntentResolution> {
    const handlers = this.intentHandlers.get(intent);
    if (!handlers || handlers.size === 0) throw new IntentResolutionError(intent, context);
    for (const h of handlers) await h(context);
    return { source: { appId: 'self' }, intent };
  }

  addIntentListener(
    intent: string,
    handler: (context?: Fdc3Context) => Promise<void> | void,
  ): Unsubscribe {
    if (!this.intentHandlers.has(intent)) this.intentHandlers.set(intent, new Set());
    this.intentHandlers.get(intent)!.add(handler);
    return () => this.intentHandlers.get(intent)?.delete(handler);
  }

  async joinChannel(channelId: string): Promise<void> {
    this.currentChannelId = channelId;
  }

  async leaveCurrentChannel(): Promise<void> {
    this.currentChannelId = null;
  }

  async getCurrentChannel(): Promise<UserChannel | null> {
    if (!this.currentChannelId) return null;
    return DEFAULT_USER_CHANNELS.find((c) => c.id === this.currentChannelId) ?? null;
  }

  async getUserChannels(): Promise<UserChannel[]> {
    return DEFAULT_USER_CHANNELS;
  }

  async openApp(_appId: string, _context?: Fdc3Context): Promise<void> {
    console.warn('[BrowserInteropAdapter] openApp is a no-op in browser mode');
  }

  destroy(): void {
    this.busUnsub?.();
    this.bus.destroy();
  }
}
