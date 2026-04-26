/**
 * ElectronInteropAdapter — renderer-side implementation of InteropAdapter.
 *
 * This class is used by apps running in Electron renderer windows.
 * All operations are forwarded to the main process over IPC via the
 * contextBridge-exposed ipcBridge (set up in preload.ts).
 *
 * Apps never import this class directly — they use window.fdc3 which is
 * already backed by this adapter via the preload bridge.
 * This module is kept for documentation and for tests that mock the IPC layer.
 */

import type { Fdc3Context } from '@fdc3-poc/fdc3-core';
import type { IntentResolution } from '@fdc3-poc/fdc3-core';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import type { InteropAdapter, Unsubscribe } from '@fdc3-poc/fdc3-core';
import { IpcEvents } from './ipc-events.js';

/**
 * Minimal IPC bridge interface — matches what the preload exposes
 * on window.__ipcBridge for internal use.
 */
interface IpcBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (...args: unknown[]) => void): () => void;
}

export class ElectronInteropAdapter implements InteropAdapter {
  private readonly contextHandlers = new Map<string, Set<(ctx: Fdc3Context) => void>>();
  private readonly intentHandlers = new Map<
    string,
    Set<(ctx?: Fdc3Context) => Promise<void> | void>
  >();
  private unsubscribeContext: (() => void) | null = null;
  private unsubscribeIntent: (() => void) | null = null;

  constructor(private readonly ipc: IpcBridge) {
    this.wireIncomingEvents();
  }

  private wireIncomingEvents(): void {
    this.unsubscribeContext = this.ipc.on(IpcEvents.CONTEXT_UPDATE, (...args: unknown[]) => {
      const context = args[0] as Fdc3Context;
      this.dispatchContext(context);
    });

    this.unsubscribeIntent = this.ipc.on(
      IpcEvents.INTENT_FIRE,
      (...args: unknown[]) => {
        const payload = args[0] as { intent: string; context?: Fdc3Context };
        this.dispatchIntent(payload.intent, payload.context);
      },
    );
  }

  private dispatchContext(context: Fdc3Context): void {
    const typeHandlers = this.contextHandlers.get(context.type) ?? new Set();
    const wildcardHandlers = this.contextHandlers.get('*') ?? new Set();
    [...typeHandlers, ...wildcardHandlers].forEach((h) => {
      try {
        h(context);
      } catch (e) {
        console.error('[fdc3] Context handler error:', e);
      }
    });
  }

  private dispatchIntent(intent: string, context?: Fdc3Context): void {
    const handlers = this.intentHandlers.get(intent) ?? new Set();
    handlers.forEach((h) => {
      try {
        void h(context);
      } catch (e) {
        console.error('[fdc3] Intent handler error:', e);
      }
    });
  }

  async broadcastContext(context: Fdc3Context): Promise<void> {
    await this.ipc.invoke(IpcEvents.BROADCAST, context);
  }

  addContextListener<T extends Fdc3Context>(
    type: string | null,
    handler: (context: T) => void,
  ): Unsubscribe {
    const key = type ?? '*';
    if (!this.contextHandlers.has(key)) {
      this.contextHandlers.set(key, new Set());
      void this.ipc.invoke(IpcEvents.ADD_CONTEXT_LISTENER, key);
    }
    this.contextHandlers.get(key)!.add(handler as (ctx: Fdc3Context) => void);

    return () => {
      const set = this.contextHandlers.get(key);
      if (set) {
        set.delete(handler as (ctx: Fdc3Context) => void);
        if (set.size === 0) {
          this.contextHandlers.delete(key);
          void this.ipc.invoke(IpcEvents.REMOVE_CONTEXT_LISTENER, key);
        }
      }
    };
  }

  async raiseIntent(intent: string, context?: Fdc3Context): Promise<IntentResolution> {
    return this.ipc.invoke(IpcEvents.RAISE_INTENT, { intent, context }) as Promise<IntentResolution>;
  }

  addIntentListener(
    intent: string,
    handler: (context?: Fdc3Context) => Promise<void> | void,
  ): Unsubscribe {
    if (!this.intentHandlers.has(intent)) {
      this.intentHandlers.set(intent, new Set());
      void this.ipc.invoke(IpcEvents.ADD_INTENT_LISTENER, intent);
    }
    this.intentHandlers.get(intent)!.add(handler);

    return () => {
      const set = this.intentHandlers.get(intent);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.intentHandlers.delete(intent);
          void this.ipc.invoke(IpcEvents.REMOVE_INTENT_LISTENER, intent);
        }
      }
    };
  }

  async joinChannel(channelId: string): Promise<void> {
    await this.ipc.invoke(IpcEvents.JOIN_CHANNEL, channelId);
  }

  async leaveCurrentChannel(): Promise<void> {
    await this.ipc.invoke(IpcEvents.LEAVE_CHANNEL);
  }

  async getCurrentChannel(): Promise<UserChannel | null> {
    return this.ipc.invoke(IpcEvents.GET_CURRENT_CHANNEL) as Promise<UserChannel | null>;
  }

  async getUserChannels(): Promise<UserChannel[]> {
    return this.ipc.invoke(IpcEvents.GET_USER_CHANNELS) as Promise<UserChannel[]>;
  }

  async openApp(appId: string, context?: Fdc3Context): Promise<void> {
    await this.ipc.invoke(IpcEvents.OPEN_APP, { appId, context });
  }

  destroy(): void {
    this.unsubscribeContext?.();
    this.unsubscribeIntent?.();
  }
}
