/**
 * FDC3 Desktop Shell — Preload Script
 *
 * Injected into EVERY BrowserWindow (shell + all app windows).
 * Runs in a privileged context with access to Node APIs but isolated from the
 * renderer's window via Electron's contextBridge.
 *
 * Security model:
 * - contextIsolation: true  — renderer cannot access Node globals
 * - nodeIntegration: false  — renderer cannot require() Node modules
 * - sandbox: false          — preload CAN use ipcRenderer (required for bridge)
 *
 * What this file does:
 * 1. Manages local handler maps for context and intent listeners
 * 2. Forwards all window.fdc3 calls to main process via IPC invoke
 * 3. Receives context / intent events from main and dispatches to registered handlers
 * 4. Exposes the window.fdc3 DesktopAgent surface via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IpcEvents } from '@fdc3-poc/interop-electron-adapter';
import type { Fdc3Context, IntentResolution, UserChannel } from '@fdc3-poc/fdc3-core';

// ─── Handler registries (live in preload isolate, not renderer) ────────────

type ContextHandler = (context: Fdc3Context) => void;
type IntentHandler = (context?: Fdc3Context) => Promise<void> | void;
type ChannelHandler = (channel: UserChannel | null) => void;

const contextHandlers = new Map<string, Set<ContextHandler>>();
const intentHandlers = new Map<string, Set<IntentHandler>>();
const channelChangeHandlers = new Set<ChannelHandler>();

// ─── Inbound IPC listeners (main → preload) ───────────────────────────────

ipcRenderer.on(IpcEvents.CONTEXT_UPDATE, (_event, context: Fdc3Context) => {
  const typed = contextHandlers.get(context.type);
  const wildcard = contextHandlers.get('*');
  const combined = [...(typed ?? []), ...(wildcard ?? [])];
  for (const handler of combined) {
    try {
      handler(context);
    } catch (e) {
      console.error('[fdc3 preload] Context handler threw:', e);
    }
  }
});

ipcRenderer.on(
  IpcEvents.INTENT_FIRE,
  (_event, payload: { intent: string; context?: Fdc3Context }) => {
    const handlers = intentHandlers.get(payload.intent);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        void handler(payload.context);
      } catch (e) {
        console.error('[fdc3 preload] Intent handler threw:', e);
      }
    }
  },
);

ipcRenderer.on(IpcEvents.CHANNEL_CHANGED, (_event, channel: UserChannel | null) => {
  for (const handler of channelChangeHandlers) {
    handler(channel);
  }
});

// ─── window.fdc3 surface ──────────────────────────────────────────────────

contextBridge.exposeInMainWorld('fdc3', {
  /**
   * Broadcast a context on the current user channel.
   * If not on a channel, broadcasts globally to all windows.
   */
  broadcast(context: Fdc3Context): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.BROADCAST, context) as Promise<void>;
  },

  /**
   * Add a context listener. Returns an unsubscribe function.
   * type = null or '*' means listen to all context types.
   */
  addContextListener(
    type: string | null,
    handler: ContextHandler,
  ): () => void {
    const key = type ?? '*';
    if (!contextHandlers.has(key)) {
      contextHandlers.set(key, new Set());
      void ipcRenderer.invoke(IpcEvents.ADD_CONTEXT_LISTENER, key);
    }
    contextHandlers.get(key)!.add(handler);

    return () => {
      const set = contextHandlers.get(key);
      set?.delete(handler);
      if (set?.size === 0) {
        contextHandlers.delete(key);
        void ipcRenderer.invoke(IpcEvents.REMOVE_CONTEXT_LISTENER, key);
      }
    };
  },

  /**
   * Raise a named intent, routing to the appropriate handler app.
   */
  raiseIntent(intent: string, context?: Fdc3Context): Promise<IntentResolution> {
    return ipcRenderer.invoke(IpcEvents.RAISE_INTENT, { intent, context }) as Promise<IntentResolution>;
  },

  /**
   * Register this window as a handler for a specific intent.
   */
  addIntentListener(intent: string, handler: IntentHandler): () => void {
    if (!intentHandlers.has(intent)) {
      intentHandlers.set(intent, new Set());
      void ipcRenderer.invoke(IpcEvents.ADD_INTENT_LISTENER, intent);
    }
    intentHandlers.get(intent)!.add(handler);

    return () => {
      const set = intentHandlers.get(intent);
      set?.delete(handler);
      if (set?.size === 0) {
        intentHandlers.delete(intent);
        void ipcRenderer.invoke(IpcEvents.REMOVE_INTENT_LISTENER, intent);
      }
    };
  },

  /** Join a named user channel (e.g. "channel-1"). */
  joinUserChannel(channelId: string): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.JOIN_CHANNEL, channelId) as Promise<void>;
  },

  /** Leave the current user channel. */
  leaveCurrentChannel(): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.LEAVE_CHANNEL) as Promise<void>;
  },

  /** Get the current user channel, or null if not joined. */
  getCurrentChannel(): Promise<UserChannel | null> {
    return ipcRenderer.invoke(IpcEvents.GET_CURRENT_CHANNEL) as Promise<UserChannel | null>;
  },

  /** Get all available user channels. */
  getUserChannels(): Promise<UserChannel[]> {
    return ipcRenderer.invoke(IpcEvents.GET_USER_CHANNELS) as Promise<UserChannel[]>;
  },

  /** Open (or focus) an app by its appId. */
  open(app: { appId: string }, context?: Fdc3Context): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.OPEN_APP, { appId: app.appId, context }) as Promise<void>;
  },

  // ─── Shell-specific extras (used by the launcher renderer) ───────────────

  /** Get the list of registered applications from the app directory. */
  getAppList(): Promise<Array<{ appId: string; title: string; description?: string; icon?: string; category?: string; url: string; devPort: number }>> {
    return ipcRenderer.invoke(IpcEvents.GET_APP_LIST) as Promise<Array<{ appId: string; title: string; description?: string; icon?: string; category?: string; url: string; devPort: number }>>;
  },

  /** Get the preload path used by embedded app webviews. */
  getPreloadPath(): Promise<string> {
    return ipcRenderer.invoke(IpcEvents.GET_PRELOAD_PATH) as Promise<string>;
  },

  /** Save the current workspace layout. */
  saveWorkspace(name?: string): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.SAVE_WORKSPACE, name) as Promise<void>;
  },

  /**
   * Subscribe to channel membership changes for this window.
   * Returns unsubscribe function.
   */
  onChannelChanged(handler: ChannelHandler): () => void {
    channelChangeHandlers.add(handler);
    return () => channelChangeHandlers.delete(handler);
  },
});
