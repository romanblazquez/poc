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

import { contextBridge, ipcRenderer, webFrame } from 'electron';
import { IpcEvents } from '@fdc3-poc/interop-electron-adapter';
import type { AppIntent, AppLogEvent, AppLogLevel, BridgeSettings, BridgeStatus, Channel, ChannelDisplayMetadata, ChannelListener, ContextMetadata, Fdc3Context, Fdc3EventHandler, Fdc3EventType, FlowPolicy, ImplementationMetadata, IntentInvocationMetadata, IntentResolution, InteropActivityEvent, InteropSnapshot, NotificationRaiseInput, ShellNotification, PrivateChannel, PrivateChannelEventListener, PrivateChannelMarker, UserChannel, ThemeName } from '@fdc3-poc/fdc3-core';
import { isPrivateChannelMarker } from '@fdc3-poc/fdc3-core';

// ─── Handler registries (live in preload isolate, not renderer) ────────────

type ContextHandler = (context: Fdc3Context, metadata?: ContextMetadata) => void;
type IntentHandler = (context?: Fdc3Context, metadata?: IntentInvocationMetadata) => Promise<void> | void;
type ChannelHandler = (channel: UserChannel | null) => void;

interface DetachedWorkspacePayload {
  id: string;
  name: string;
  panelIds: string[];
  layout: unknown | null;
  channelId: string | null;
  theme: string;
  sourceWorkspaceId?: string;
  targetX?: number;
  targetY?: number;
}

interface DisplayInfo {
  id: number;
  isPrimary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

const contextHandlers = new Map<string, Set<ContextHandler>>();
const intentHandlers = new Map<string, Set<IntentHandler>>();
const channelChangeHandlers = new Set<ChannelHandler>();
const appListChangeHandlers = new Set<() => void>();
/** FDC3 2.1 agent-level event listeners: eventType ('*' = all) → Set<handler>. */
const fdc3EventHandlers = new Map<string, Set<Fdc3EventHandler>>();
/** channelId → (contextType | '*') → Set<handler> — for App Channel listeners. */
const appChannelHandlers = new Map<string, Map<string, Set<ContextHandler>>>();
/** channelId → (contextType | '*') → Set<handler> — for Private Channel context listeners. */
const privateChannelHandlers = new Map<string, Map<string, Set<ContextHandler>>>();

type PrivateChannelLifecycleHandler = (contextType: string | null) => void;
type PrivateChannelDisconnectHandler = () => void;

interface PrivateChannelLifecycleMaps {
  added: Set<PrivateChannelLifecycleHandler>;
  removed: Set<PrivateChannelLifecycleHandler>;
  disconnected: Set<PrivateChannelDisconnectHandler>;
}
const privateChannelLifecycle = new Map<string, PrivateChannelLifecycleMaps>();

function ensurePrivateChannelLifecycle(channelId: string): PrivateChannelLifecycleMaps {
  let map = privateChannelLifecycle.get(channelId);
  if (!map) {
    map = { added: new Set(), removed: new Set(), disconnected: new Set() };
    privateChannelLifecycle.set(channelId, map);
  }
  return map;
}
const workspaceWindowClosedHandlers = new Set<(payload: DetachedWorkspacePayload) => void>();
const themeChangeHandlers = new Set<(theme: ThemeName) => void>();
const interopActivityHandlers = new Set<(event: InteropActivityEvent) => void>();
const appLogHandlers = new Set<(event: AppLogEvent) => void>();
const notificationHandlers = new Set<(snapshot: ShellNotification[]) => void>();

interface IntentResolverCandidate {
  appId: string;
  title?: string;
  description?: string;
  icon?: string;
  isRunning: boolean;
  instanceId?: number;
}

interface IntentResolverRequest {
  requestId: string;
  intent: string;
  contextType?: string;
  contextName?: string;
  candidates: IntentResolverCandidate[];
}

const intentResolverRequestHandlers = new Set<(req: IntentResolverRequest) => void>();

// ─── Inbound IPC listeners (main → preload) ───────────────────────────────

ipcRenderer.on(IpcEvents.CONTEXT_UPDATE, (_event, context: Fdc3Context, metadata?: ContextMetadata) => {
  const typed = contextHandlers.get(context.type);
  const wildcard = contextHandlers.get('*');
  const combined = [...(typed ?? []), ...(wildcard ?? [])];
  for (const handler of combined) {
    try {
      handler(context, metadata);
    } catch (e) {
      console.error('[fdc3 preload] Context handler threw:', e);
    }
  }
});

ipcRenderer.on(
  IpcEvents.INTENT_FIRE,
  (_event, payload: { intent: string; context?: Fdc3Context; requestId?: string }) => {
    const handlers = intentHandlers.get(payload.intent);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        void handler(payload.context, { requestId: payload.requestId });
      } catch (e) {
        console.error('[fdc3 preload] Intent handler threw:', e);
      }
    }
  },
);

ipcRenderer.on(IpcEvents.CHANNEL_CHANGED, (_event, channel: UserChannel | null) => {
  // Bespoke callback (legacy renderer code).
  for (const handler of channelChangeHandlers) {
    handler(channel);
  }
  // FDC3 2.1 standard event — `userChannelChanged`.
  const event = { type: 'userChannelChanged' as const, details: { currentChannelId: channel?.id ?? null } };
  const targeted = fdc3EventHandlers.get('userChannelChanged');
  const wildcard = fdc3EventHandlers.get('*');
  for (const handler of [...(targeted ?? []), ...(wildcard ?? [])]) {
    try {
      handler(event);
    } catch (e) {
      console.error('[fdc3 preload] Event handler threw:', e);
    }
  }
});

ipcRenderer.on(IpcEvents.APP_LIST_CHANGED, () => {
  for (const handler of appListChangeHandlers) {
    try {
      handler();
    } catch (e) {
      console.error('[fdc3 preload] App-list handler threw:', e);
    }
  }
});

ipcRenderer.on(IpcEvents.WORKSPACE_WINDOW_CLOSED, (_event, payload: DetachedWorkspacePayload) => {
  for (const handler of workspaceWindowClosedHandlers) {
    handler(payload);
  }
});

ipcRenderer.on(IpcEvents.THEME_CHANGED, (_event, theme: ThemeName) => {
  for (const handler of themeChangeHandlers) {
    handler(theme);
  }
});

// ─── Shell-wide zoom ──────────────────────────────────────────────────────
// Applies the shell's current zoom factor to THIS webContents via webFrame.
// Every preload-injected window (shell, detached app, embedded webview) does
// the same, so the zoom feels global without main tracking webContents IDs.
const zoomChangeHandlers = new Set<(factor: number) => void>();
const fullscreenChangeHandlers = new Set<(fullscreen: boolean) => void>();
const managerStatusHandlers = new Set<(status: unknown) => void>();
const bridgeStatusHandlers = new Set<(status: BridgeStatus) => void>();

function applyZoomFactor(factor: number): void {
  try { webFrame.setZoomFactor(factor); } catch { /* SSR / context not ready */ }
  for (const handler of zoomChangeHandlers) {
    try { handler(factor); } catch (e) { console.error('[preload zoom] handler threw', e); }
  }
}

ipcRenderer.on(IpcEvents.ZOOM_CHANGED, (_event, factor: number) => {
  applyZoomFactor(factor);
});

ipcRenderer.on(IpcEvents.WINDOW_FULLSCREEN_CHANGED, (_event, fullscreen: boolean) => {
  for (const handler of fullscreenChangeHandlers) {
    try { handler(Boolean(fullscreen)); } catch (e) { console.error('[preload fullscreen] handler threw', e); }
  }
});

ipcRenderer.on(IpcEvents.MANAGER_STATUS_CHANGED, (_event, status: unknown) => {
  for (const handler of managerStatusHandlers) {
    try { handler(status); } catch (e) { console.error('[preload manager] handler threw', e); }
  }
});

ipcRenderer.on(IpcEvents.BRIDGE_STATUS_CHANGED, (_event, status: BridgeStatus) => {
  for (const handler of bridgeStatusHandlers) {
    try { handler(status); } catch (e) { console.error('[preload bridge] handler threw', e); }
  }
});

// Fetch the current zoom on boot so late-joining windows (newly detached
// workspaces, newly opened webviews) catch up to the shell-wide value.
void ipcRenderer.invoke(IpcEvents.GET_ZOOM).then((factor: number) => {
  if (typeof factor === 'number' && factor > 0) applyZoomFactor(factor);
}).catch(() => undefined);

ipcRenderer.on(IpcEvents.INTEROP_ACTIVITY, (_event, activity: InteropActivityEvent) => {
  for (const handler of interopActivityHandlers) {
    try {
      handler(activity);
    } catch (e) {
      console.error('[fdc3 preload] Interop activity handler threw:', e);
    }
  }
});

ipcRenderer.on(IpcEvents.APP_LOG, (_event, log: AppLogEvent) => {
  for (const handler of appLogHandlers) {
    try {
      handler(log);
    } catch (e) {
      console.error('[fdc3 preload] App log handler threw:', e);
    }
  }
});

ipcRenderer.on(IpcEvents.NOTIFICATIONS_CHANGED, (_event, snapshot: ShellNotification[]) => {
  for (const handler of notificationHandlers) {
    try {
      handler(snapshot);
    } catch (e) {
      console.error('[preload notifications] handler threw:', e);
    }
  }
});

ipcRenderer.on(IpcEvents.INTENT_RESOLVER_REQUEST, (_event, req: IntentResolverRequest) => {
  for (const handler of intentResolverRequestHandlers) {
    try {
      handler(req);
    } catch (e) {
      console.error('[preload intentResolver] handler threw:', e);
    }
  }
});

ipcRenderer.on(
  IpcEvents.APP_CHANNEL_CONTEXT,
  (_event, { channelId, context }: { channelId: string; context: Fdc3Context }) => {
    const channelMap = appChannelHandlers.get(channelId);
    if (!channelMap) return;
    const typed = channelMap.get(context.type);
    const wild = channelMap.get('*');
    for (const handler of [...(typed ?? []), ...(wild ?? [])]) {
      try {
        handler(context);
      } catch (e) {
        console.error('[fdc3 preload] App channel handler threw:', e);
      }
    }
  },
);

ipcRenderer.on(
  IpcEvents.PRIVATE_CHANNEL_CONTEXT,
  (_event, { channelId, context }: { channelId: string; context: Fdc3Context }) => {
    const channelMap = privateChannelHandlers.get(channelId);
    if (!channelMap) return;
    const typed = channelMap.get(context.type);
    const wild = channelMap.get('*');
    for (const handler of [...(typed ?? []), ...(wild ?? [])]) {
      try {
        handler(context);
      } catch (e) {
        console.error('[fdc3 preload] Private channel handler threw:', e);
      }
    }
  },
);

ipcRenderer.on(
  IpcEvents.PRIVATE_CHANNEL_LISTENER_ADDED,
  (_event, { channelId, contextType }: { channelId: string; contextType: string | null }) => {
    const ev = privateChannelLifecycle.get(channelId);
    if (!ev) return;
    for (const h of ev.added) {
      try { h(contextType); } catch (e) { console.error(e); }
    }
  },
);

ipcRenderer.on(
  IpcEvents.PRIVATE_CHANNEL_LISTENER_REMOVED,
  (_event, { channelId, contextType }: { channelId: string; contextType: string | null }) => {
    const ev = privateChannelLifecycle.get(channelId);
    if (!ev) return;
    for (const h of ev.removed) {
      try { h(contextType); } catch (e) { console.error(e); }
    }
  },
);

ipcRenderer.on(
  IpcEvents.PRIVATE_CHANNEL_DISCONNECTED,
  (_event, { channelId }: { channelId: string }) => {
    const ev = privateChannelLifecycle.get(channelId);
    if (!ev) return;
    for (const h of ev.disconnected) {
      try { h(); } catch (e) { console.error(e); }
    }
    // After disconnect both sides drop their handler maps for this channel.
    privateChannelHandlers.delete(channelId);
    privateChannelLifecycle.delete(channelId);
  },
);

interface Listener {
  unsubscribe(): void;
}

/**
 * Build a listener handle that satisfies the calling conventions in use:
 * - POC apps: const unsub = fdc3.addContextListener(...); unsub();
 * - FDC3 apps: const l = await fdc3.addContextListener(...); l.unsubscribe();
 * - Promise-style FDC3 apps: fdc3.addContextListener(...).then((l) => l.unsubscribe());
 */
type ListenerHandle = (() => void) & Listener & Promise<Listener>;
function makeListenerHandle(cleanup: () => void): ListenerHandle {
  let subscribed = true;
  const listener: Listener = {
    unsubscribe: () => {
      if (!subscribed) return;
      subscribed = false;
      cleanup();
    },
  };
  const promise = Promise.resolve(listener);
  const handle = (() => listener.unsubscribe()) as ListenerHandle;
  handle.unsubscribe = listener.unsubscribe;
  handle.then = promise.then.bind(promise);
  handle.catch = promise.catch.bind(promise);
  handle.finally = promise.finally.bind(promise);
  Object.defineProperty(handle, Symbol.toStringTag, { value: 'Promise' });
  return handle;
}

function parseContextListenerArgs(
  contextTypeOrHandler: string | null | ContextHandler,
  maybeHandler?: ContextHandler,
): { contextType: string | null; key: string; handler: ContextHandler } {
  if (typeof contextTypeOrHandler === 'function') {
    return { contextType: null, key: '*', handler: contextTypeOrHandler };
  }
  if (typeof maybeHandler !== 'function') {
    throw new TypeError('addContextListener requires a context handler');
  }
  const contextType = contextTypeOrHandler === '*' ? null : contextTypeOrHandler;
  return { contextType, key: contextType ?? '*', handler: maybeHandler };
}

/** Build a client-side PrivateChannel that proxies to the main-process store. */
function buildPrivateChannel(channelId: string): PrivateChannel {
  return {
    id: channelId,
    type: 'private',
    broadcast(context: Fdc3Context): Promise<void> {
      return ipcRenderer.invoke(IpcEvents.PRIVATE_CHANNEL_BROADCAST, { channelId, context }) as Promise<void>;
    },
    getCurrentContext(contextType?: string): Promise<Fdc3Context | null> {
      return ipcRenderer.invoke(IpcEvents.PRIVATE_CHANNEL_GET_CURRENT_CONTEXT, { channelId, contextType }) as Promise<Fdc3Context | null>;
    },
    async addContextListener<T extends Fdc3Context>(
      contextTypeOrHandler: string | null | ((context: T) => void),
      maybeHandler?: (context: T) => void,
    ): Promise<ChannelListener> {
      const {
        contextType,
        key,
        handler,
      } = parseContextListenerArgs(
        contextTypeOrHandler as string | null | ContextHandler,
        maybeHandler as ContextHandler | undefined,
      );
      const channelMap = privateChannelHandlers.get(channelId) ?? new Map<string, Set<ContextHandler>>();
      const set = channelMap.get(key) ?? new Set<ContextHandler>();
      const wrapped: ContextHandler = (ctx) => handler(ctx as T);
      set.add(wrapped);
      channelMap.set(key, set);
      privateChannelHandlers.set(channelId, channelMap);

      const cached = (await ipcRenderer.invoke(IpcEvents.PRIVATE_CHANNEL_ADD_LISTENER, {
        channelId,
        contextType,
      })) as Fdc3Context[];
      for (const ctx of cached) {
        try { handler(ctx as T); } catch (e) { console.error('[fdc3 preload] Private channel cached-context handler threw:', e); }
      }

      return {
        unsubscribe: (): void => {
          const localSet = privateChannelHandlers.get(channelId)?.get(key);
          localSet?.delete(wrapped);
          if (localSet?.size === 0) {
            privateChannelHandlers.get(channelId)?.delete(key);
            void ipcRenderer.invoke(IpcEvents.PRIVATE_CHANNEL_REMOVE_LISTENER, { channelId, contextType });
          }
        },
      };
    },
    onAddContextListener(handler: PrivateChannelLifecycleHandler): PrivateChannelEventListener {
      const ev = ensurePrivateChannelLifecycle(channelId);
      ev.added.add(handler);
      return { unsubscribe: () => ev.added.delete(handler) };
    },
    onUnsubscribe(handler: PrivateChannelLifecycleHandler): PrivateChannelEventListener {
      const ev = ensurePrivateChannelLifecycle(channelId);
      ev.removed.add(handler);
      return { unsubscribe: () => ev.removed.delete(handler) };
    },
    onDisconnect(handler: PrivateChannelDisconnectHandler): PrivateChannelEventListener {
      const ev = ensurePrivateChannelLifecycle(channelId);
      ev.disconnected.add(handler);
      return { unsubscribe: () => ev.disconnected.delete(handler) };
    },
    disconnect(): Promise<void> {
      return ipcRenderer.invoke(IpcEvents.PRIVATE_CHANNEL_DISCONNECT, channelId) as Promise<void>;
    },
  };
}

/** Replace a private-channel marker inside an intent result with a wrapped PrivateChannel. */
async function unwrapIntentResult(result: unknown): Promise<unknown> {
  if (!isPrivateChannelMarker(result)) return result;
  const channelId = (result as PrivateChannelMarker).__fdc3PrivateChannelId;
  await ipcRenderer.invoke(IpcEvents.PRIVATE_CHANNEL_CONNECT, channelId);
  return buildPrivateChannel(channelId);
}

type PlatformLogLevelInput = AppLogLevel | 'warn';

function normalizePlatformLogLevel(level: PlatformLogLevelInput): AppLogLevel {
  return level === 'warn' ? 'warning' : level;
}

function toSerializableLogData(data: unknown): unknown {
  if (data === undefined) return undefined;
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack };
  }
  try {
    return JSON.parse(JSON.stringify(data)) as unknown;
  } catch {
    return String(data);
  }
}

function writePlatformLog(level: PlatformLogLevelInput, message: unknown, data?: unknown, category?: string): Promise<boolean> {
  return ipcRenderer.invoke(IpcEvents.APP_LOG_WRITE, {
    level: normalizePlatformLogLevel(level),
    message: String(message),
    category,
    data: toSerializableLogData(data),
  }) as Promise<boolean>;
}

// ─── window.platformLogs surface ─────────────────────────────────────────────
// Deliberately separate from window.fdc3: this is platform observability, not
// interoperability semantics. Every hosted app gets it automatically.

contextBridge.exposeInMainWorld('platformLogs', {
  log(level: PlatformLogLevelInput, message: unknown, data?: unknown, category?: string): Promise<boolean> {
    return writePlatformLog(level, message, data, category);
  },
  debug(message: unknown, data?: unknown, category?: string): Promise<boolean> {
    return writePlatformLog('debug', message, data, category);
  },
  info(message: unknown, data?: unknown, category?: string): Promise<boolean> {
    return writePlatformLog('info', message, data, category);
  },
  warn(message: unknown, data?: unknown, category?: string): Promise<boolean> {
    return writePlatformLog('warning', message, data, category);
  },
  error(message: unknown, data?: unknown, category?: string): Promise<boolean> {
    return writePlatformLog('error', message, data, category);
  },
  getLogs(): Promise<AppLogEvent[]> {
    return ipcRenderer.invoke(IpcEvents.GET_APP_LOGS) as Promise<AppLogEvent[]>;
  },
  clear(): Promise<boolean> {
    return ipcRenderer.invoke(IpcEvents.CLEAR_APP_LOGS) as Promise<boolean>;
  },
  onLog(handler: (event: AppLogEvent) => void): () => void {
    appLogHandlers.add(handler);
    return () => appLogHandlers.delete(handler);
  },
  getInfo(): { provider: string; apiVersion: string; capabilities: string[] } {
    return {
      provider: 'fdc3-desktop-poc',
      apiVersion: '0.1',
      capabilities: ['automatic-console-capture', 'structured-app-logs', 'live-subscriptions', 'scoped-log-access'],
    };
  },
});

// ─── window.notifications surface ───────────────────────────────────────────

contextBridge.exposeInMainWorld('notifications', {
  raise(input: NotificationRaiseInput): Promise<string> {
    return ipcRenderer.invoke(IpcEvents.NOTIFICATIONS_RAISE, input) as Promise<string>;
  },
  list(limit?: number): Promise<ShellNotification[]> {
    return ipcRenderer.invoke(IpcEvents.NOTIFICATIONS_LIST, limit) as Promise<ShellNotification[]>;
  },
  markRead(id: string): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.NOTIFICATIONS_MARK_READ, id) as Promise<void>;
  },
  markAllRead(): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.NOTIFICATIONS_MARK_ALL_READ) as Promise<void>;
  },
  dismiss(id: string): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.NOTIFICATIONS_DISMISS, id) as Promise<void>;
  },
  clearAll(): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.NOTIFICATIONS_CLEAR_ALL) as Promise<void>;
  },
  unreadCount(): Promise<number> {
    return ipcRenderer.invoke(IpcEvents.NOTIFICATIONS_UNREAD_COUNT) as Promise<number>;
  },
  onChanged(handler: (snapshot: ShellNotification[]) => void): () => void {
    notificationHandlers.add(handler);
    return () => notificationHandlers.delete(handler);
  },
});

// ─── window.shellChrome surface ──────────────────────────────────────────────
// Shell-level UX controls that are NOT FDC3 (zoom, future hotkeys, etc).
// Exposed separately so the shell renderer can drive them without crowding
// window.fdc3 with non-interop methods.

contextBridge.exposeInMainWorld('shellChrome', {
  getZoom(): Promise<number> {
    return ipcRenderer.invoke(IpcEvents.GET_ZOOM) as Promise<number>;
  },
  setZoom(factor: number): Promise<number> {
    return ipcRenderer.invoke(IpcEvents.SET_ZOOM, factor) as Promise<number>;
  },
  onZoomChanged(handler: (factor: number) => void): () => void {
    zoomChangeHandlers.add(handler);
    return () => zoomChangeHandlers.delete(handler);
  },
  getFullscreenState(): Promise<boolean> {
    return ipcRenderer.invoke(IpcEvents.GET_WINDOW_FULLSCREEN) as Promise<boolean>;
  },
  onFullscreenChanged(handler: (fullscreen: boolean) => void): () => void {
    fullscreenChangeHandlers.add(handler);
    return () => fullscreenChangeHandlers.delete(handler);
  },
  getManifest(): Promise<{
    appId: string;
    name: string;
    title: string;
    subtitle: string;
    provider: string;
    providerVersion: string;
    description?: string;
    branding?: { productMark?: string; accentColor?: string };
  }> {
    return ipcRenderer.invoke(IpcEvents.GET_SHELL_MANIFEST) as Promise<{
      appId: string;
      name: string;
      title: string;
      subtitle: string;
      provider: string;
      providerVersion: string;
      description?: string;
      branding?: { productMark?: string; accentColor?: string };
    }>;
  },
  /**
   * Manager Console namespace — io.Manager-class central distribution.
   * Renderer reads status, drives the manual "Check for updates", applies or
   * dismisses pending updates, and saves admin settings (directory URL,
   * refresh interval, current role, telemetry endpoint). Status pushes arrive
   * via `onStatusChanged` so a Manager UI never needs to poll.
   */
  manager: {
    getStatus(): Promise<unknown | null> {
      return ipcRenderer.invoke(IpcEvents.MANAGER_GET_STATUS) as Promise<unknown | null>;
    },
    checkUpdates(): Promise<{ ok: boolean; etag?: string | null; fetchedAt: number; appCount?: number; error?: string }> {
      return ipcRenderer.invoke(IpcEvents.MANAGER_CHECK_UPDATES) as Promise<{
        ok: boolean; etag?: string | null; fetchedAt: number; appCount?: number; error?: string;
      }>;
    },
    applyUpdate(): Promise<{ applied: boolean; reason?: string }> {
      return ipcRenderer.invoke(IpcEvents.MANAGER_APPLY_UPDATE) as Promise<{ applied: boolean; reason?: string }>;
    },
    dismissUpdate(): Promise<boolean> {
      return ipcRenderer.invoke(IpcEvents.MANAGER_DISMISS_UPDATE) as Promise<boolean>;
    },
    updateSettings(patch: Record<string, unknown>): Promise<unknown | null> {
      return ipcRenderer.invoke(IpcEvents.MANAGER_UPDATE_SETTINGS, patch ?? {}) as Promise<unknown | null>;
    },
    onStatusChanged(handler: (status: unknown) => void): () => void {
      managerStatusHandlers.add(handler);
      return () => managerStatusHandlers.delete(handler);
    },
  },
  bridge: {
    getStatus(): Promise<BridgeStatus | null> {
      return ipcRenderer.invoke(IpcEvents.BRIDGE_GET_STATUS) as Promise<BridgeStatus | null>;
    },
    scan(): Promise<BridgeStatus | null> {
      return ipcRenderer.invoke(IpcEvents.BRIDGE_SCAN) as Promise<BridgeStatus | null>;
    },
    updateSettings(patch: Partial<BridgeSettings>): Promise<BridgeStatus | null> {
      return ipcRenderer.invoke(IpcEvents.BRIDGE_UPDATE_SETTINGS, patch ?? {}) as Promise<BridgeStatus | null>;
    },
    onStatusChanged(handler: (status: BridgeStatus) => void): () => void {
      bridgeStatusHandlers.add(handler);
      return () => bridgeStatusHandlers.delete(handler);
    },
  },
  apps: {
    getLifecycle(): Promise<Array<{ appId: string; running: boolean; isMinimized: boolean; webContentsId: number | null }>> {
      return ipcRenderer.invoke(IpcEvents.GET_APP_LIFECYCLE) as Promise<Array<{
        appId: string;
        running: boolean;
        isMinimized: boolean;
        webContentsId: number | null;
      }>>;
    },
    restart(appId: string): Promise<boolean> {
      return ipcRenderer.invoke(IpcEvents.RESTART_APP, appId) as Promise<boolean>;
    },
  },
  intentResolver: {
    onRequest(handler: (req: IntentResolverRequest) => void): () => void {
      intentResolverRequestHandlers.add(handler);
      return () => intentResolverRequestHandlers.delete(handler);
    },
    respond(requestId: string, appId: string | null, instanceId?: number): Promise<void> {
      return ipcRenderer.invoke(IpcEvents.INTENT_RESOLVER_RESPOND, { requestId, appId, instanceId }) as Promise<void>;
    },
  },
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
    typeOrHandler: string | null | ContextHandler,
    maybeHandler?: ContextHandler,
  ): ListenerHandle {
    const { key, handler } = parseContextListenerArgs(typeOrHandler, maybeHandler);
    if (!contextHandlers.has(key)) {
      contextHandlers.set(key, new Set());
      void ipcRenderer.invoke(IpcEvents.ADD_CONTEXT_LISTENER, key);
    }
    contextHandlers.get(key)!.add(handler);

    if (key === 'com.demo.theme') {
      void ipcRenderer.invoke(IpcEvents.GET_THEME).then((theme) => {
        try {
          handler({
            type: 'com.demo.theme',
            name: `Theme: ${String(theme)}`,
            theme,
          } as Fdc3Context);
        } catch (e) {
          console.error('[fdc3 preload] Theme bootstrap handler threw:', e);
        }
      });
    }

    return makeListenerHandle(() => {
      const set = contextHandlers.get(key);
      set?.delete(handler);
      if (set?.size === 0) {
        contextHandlers.delete(key);
        void ipcRenderer.invoke(IpcEvents.REMOVE_CONTEXT_LISTENER, key);
      }
    });
  },

  /**
   * Raise a named intent, routing to the appropriate handler app.
   * If the handler returns a PrivateChannel via `completeIntent`, the result
   * field is automatically wrapped into a usable PrivateChannel client.
   */
  async raiseIntent(intent: string, context?: Fdc3Context): Promise<IntentResolution> {
    const resolution = (await ipcRenderer.invoke(IpcEvents.RAISE_INTENT, { intent, context })) as IntentResolution;
    if (resolution && resolution.result !== undefined) {
      const unwrapped = await unwrapIntentResult(resolution.result);
      return { ...resolution, result: unwrapped as IntentResolution['result'] };
    }
    return resolution;
  },

  /**
   * FDC3 2.0 — `raiseIntentForContext(context, app?)`. Raises an intent chosen
   * for the given context, letting the agent pick across every intent that
   * accepts that context type. Composed from the already-wired
   * `findIntentsByContext` + `raiseIntent`, so it shares the same resolver and
   * PrivateChannel unwrapping. Rejects with the standard `NoAppsFound` error
   * code when no intent accepts the context.
   */
  async raiseIntentForContext(context: Fdc3Context): Promise<IntentResolution> {
    const appIntents = (await ipcRenderer.invoke(IpcEvents.FIND_INTENTS_BY_CONTEXT, {
      context,
    })) as AppIntent[];
    if (!appIntents || appIntents.length === 0) {
      throw new Error('NoAppsFound');
    }
    const resolution = (await ipcRenderer.invoke(IpcEvents.RAISE_INTENT, {
      intent: appIntents[0].intent.name,
      context,
    })) as IntentResolution;
    if (resolution && resolution.result !== undefined) {
      const unwrapped = await unwrapIntentResult(resolution.result);
      return { ...resolution, result: unwrapped as IntentResolution['result'] };
    }
    return resolution;
  },

  /**
   * Complete a pending intent invocation with an optional result. Pass either
   * a context object or a PrivateChannel returned by `createPrivateChannel()`.
   * PrivateChannels are serialised over IPC as a marker and re-wrapped on the
   * raiser side.
   */
  completeIntent(requestId: string, result?: Fdc3Context | PrivateChannel | PrivateChannelMarker): Promise<void> {
    let payload: Fdc3Context | PrivateChannelMarker | undefined;
    if (result === undefined) {
      payload = undefined;
    } else if ((result as PrivateChannel).type === 'private' && typeof (result as { id?: string }).id === 'string') {
      payload = { __fdc3PrivateChannelId: (result as PrivateChannel).id };
    } else if (isPrivateChannelMarker(result)) {
      payload = result;
    } else {
      payload = result as Fdc3Context;
    }
    return ipcRenderer.invoke(IpcEvents.COMPLETE_INTENT, { requestId, result: payload }) as Promise<void>;
  },

  /**
   * Register this window as a handler for a specific intent.
   */
  addIntentListener(intent: string, handler: IntentHandler): ListenerHandle {
    if (!intentHandlers.has(intent)) {
      intentHandlers.set(intent, new Set());
      void ipcRenderer.invoke(IpcEvents.ADD_INTENT_LISTENER, intent);
    }
    intentHandlers.get(intent)!.add(handler);

    return makeListenerHandle(() => {
      const set = intentHandlers.get(intent);
      set?.delete(handler);
      if (set?.size === 0) {
        intentHandlers.delete(intent);
        void ipcRenderer.invoke(IpcEvents.REMOVE_INTENT_LISTENER, intent);
      }
    });
  },

  /**
   * FDC3 2.1 — `addEventListener(type, handler)`. Listen for agent-level events
   * (currently `userChannelChanged`). Pass `null` to receive every event type.
   * Returns the same hybrid handle as the context/intent listeners, so it works
   * as a bare unsubscribe, an awaited Listener, or a Promise.
   */
  addEventListener(type: Fdc3EventType | null, handler: Fdc3EventHandler): ListenerHandle {
    const key = type ?? '*';
    if (!fdc3EventHandlers.has(key)) {
      fdc3EventHandlers.set(key, new Set());
    }
    fdc3EventHandlers.get(key)!.add(handler);

    return makeListenerHandle(() => {
      const set = fdc3EventHandlers.get(key);
      set?.delete(handler);
      if (set?.size === 0) {
        fdc3EventHandlers.delete(key);
      }
    });
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

  /**
   * FDC3 2.0 — implementation metadata about this desktop agent and the calling app.
   * Use this to feature-detect optional capabilities or display the agent version.
   */
  getInfo(): Promise<ImplementationMetadata> {
    return ipcRenderer.invoke(IpcEvents.GET_INFO) as Promise<ImplementationMetadata>;
  },

  /**
   * FDC3 2.0 — `findIntent(intent, context?, resultType?)`.
   * Resolves to one `AppIntent` listing every app in the directory that handles
   * the intent (filtered by context type when context is passed). Rejects with
   * the FDC3 standard `NoAppsFound` error code when nothing matches.
   */
  findIntent(intent: string, context?: Fdc3Context, resultType?: string): Promise<AppIntent> {
    return ipcRenderer.invoke(IpcEvents.FIND_INTENT, { intent, context, resultType }) as Promise<AppIntent>;
  },

  /**
   * FDC3 2.0 — `findIntentsByContext(context, resultType?)`.
   * Resolves to the list of intents that accept the given context type, each
   * paired with its handler apps. Returns `[]` if nothing matches.
   */
  findIntentsByContext(context: Fdc3Context, resultType?: string): Promise<AppIntent[]> {
    return ipcRenderer.invoke(IpcEvents.FIND_INTENTS_BY_CONTEXT, { context, resultType }) as Promise<AppIntent[]>;
  },

  /**
   * FDC3 2.0 — `createPrivateChannel()`. Returns a brand-new PrivateChannel
   * the caller can pass to `completeIntent` so the intent raiser receives a
   * channel reference and can stream follow-up updates.
   */
  async createPrivateChannel(): Promise<PrivateChannel> {
    const marker = (await ipcRenderer.invoke(IpcEvents.CREATE_PRIVATE_CHANNEL)) as PrivateChannelMarker;
    return buildPrivateChannel(marker.__fdc3PrivateChannelId);
  },

  /**
   * FDC3 2.0 — `getOrCreateChannel(channelId)`. Returns a Channel object whose
   * `broadcast` / `getCurrentContext` / `addContextListener` operate on a private
   * App Channel namespace (distinct from user channels). Listeners receive the
   * last-value cache on first subscribe.
   */
  async getOrCreateChannel(channelId: string): Promise<Channel> {
    const meta = (await ipcRenderer.invoke(IpcEvents.GET_OR_CREATE_APP_CHANNEL, channelId)) as {
      id: string;
      type: 'app';
      displayMetadata?: ChannelDisplayMetadata;
    };
    return {
      id: meta.id,
      type: meta.type,
      displayMetadata: meta.displayMetadata,
      broadcast(context: Fdc3Context): Promise<void> {
        return ipcRenderer.invoke(IpcEvents.APP_CHANNEL_BROADCAST, { channelId: meta.id, context }) as Promise<void>;
      },
      getCurrentContext(contextType?: string): Promise<Fdc3Context | null> {
        return ipcRenderer.invoke(IpcEvents.APP_CHANNEL_GET_CURRENT_CONTEXT, { channelId: meta.id, contextType }) as Promise<Fdc3Context | null>;
      },
      async addContextListener<T extends Fdc3Context>(
        contextTypeOrHandler: string | null | ((context: T) => void),
        maybeHandler?: (context: T) => void,
      ): Promise<ChannelListener> {
        const {
          contextType,
          key,
          handler,
        } = parseContextListenerArgs(
          contextTypeOrHandler as string | null | ContextHandler,
          maybeHandler as ContextHandler | undefined,
        );
        const channelMap = appChannelHandlers.get(meta.id) ?? new Map<string, Set<ContextHandler>>();
        const set = channelMap.get(key) ?? new Set<ContextHandler>();
        const wrapped: ContextHandler = (ctx) => handler(ctx as T);
        set.add(wrapped);
        channelMap.set(key, set);
        appChannelHandlers.set(meta.id, channelMap);

        const cached = (await ipcRenderer.invoke(IpcEvents.APP_CHANNEL_ADD_LISTENER, {
          channelId: meta.id,
          contextType,
        })) as Fdc3Context[];
        for (const ctx of cached) {
          try {
            handler(ctx as T);
          } catch (e) {
            console.error('[fdc3 preload] App channel cached-context handler threw:', e);
          }
        }

        return {
          unsubscribe: (): void => {
            const localSet = appChannelHandlers.get(meta.id)?.get(key);
            localSet?.delete(wrapped);
            if (localSet?.size === 0) {
              appChannelHandlers.get(meta.id)?.delete(key);
              void ipcRenderer.invoke(IpcEvents.APP_CHANNEL_REMOVE_LISTENER, {
                channelId: meta.id,
                contextType,
              });
            }
          },
        };
      },
    };
  },

  /** Close the current Electron app window or embedded app surface. */
  closeWindow(): Promise<boolean> {
    return ipcRenderer.invoke(IpcEvents.CLOSE_CURRENT_WINDOW) as Promise<boolean>;
  },

  /** Get current global desktop theme. */
  getTheme(): Promise<ThemeName> {
    return ipcRenderer.invoke(IpcEvents.GET_THEME) as Promise<ThemeName>;
  },

  /** Set global desktop theme and propagate to all windows. */
  setTheme(theme: ThemeName): Promise<ThemeName> {
    return ipcRenderer.invoke(IpcEvents.SET_THEME, theme) as Promise<ThemeName>;
  },

  /** Subscribe to global theme changes pushed by main process. */
  onThemeChanged(handler: (theme: ThemeName) => void): () => void {
    themeChangeHandlers.add(handler);
    return () => themeChangeHandlers.delete(handler);
  },

  // ─── Shell-specific extras (used by the launcher renderer) ───────────────

  /** Get the list of registered applications from the app directory. */
  getAppList(): Promise<Array<{ appId: string; title: string; description?: string; icon?: string; category?: string; url: string; devPort: number; capabilities?: { broadcasts?: string[]; listensTo?: string[]; raisesIntents?: string[]; handlesIntents?: string[] }; listensForContexts?: string[]; intents?: Array<{ intent: string; contextTypes: string[] | null; appId: string; displayName?: string }> }>> {
    return ipcRenderer.invoke(IpcEvents.GET_APP_LIST) as Promise<Array<{ appId: string; title: string; description?: string; icon?: string; category?: string; url: string; devPort: number; capabilities?: { broadcasts?: string[]; listensTo?: string[]; raisesIntents?: string[]; handlesIntents?: string[] }; listensForContexts?: string[]; intents?: Array<{ intent: string; contextTypes: string[] | null; appId: string; displayName?: string }> }>>;
  },

  /** Subscribe to app-directory updates applied by the Manager Console. */
  onAppListChanged(handler: () => void): () => void {
    appListChangeHandlers.add(handler);
    return () => appListChangeHandlers.delete(handler);
  },

  /** Get the preload path used by embedded app webviews. */
  getPreloadPath(): Promise<string> {
    return ipcRenderer.invoke(IpcEvents.GET_PRELOAD_PATH) as Promise<string>;
  },

  /** Save the current workspace layout. */
  saveWorkspace(name?: string): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.SAVE_WORKSPACE, name) as Promise<void>;
  },

  /** Open a complete Dockview workspace in its own Electron window. */
  openWorkspaceWindow(payload: DetachedWorkspacePayload): Promise<{ opened: boolean; id: string }> {
    return ipcRenderer.invoke(IpcEvents.OPEN_WORKSPACE_WINDOW, payload) as Promise<{ opened: boolean; id: string }>;
  },

  /** Read the payload for a detached workspace window. */
  getWorkspaceWindowPayload(workspaceWindowId: string): Promise<DetachedWorkspacePayload | null> {
    return ipcRenderer.invoke(IpcEvents.GET_WORKSPACE_WINDOW_PAYLOAD, workspaceWindowId) as Promise<DetachedWorkspacePayload | null>;
  },

  /** Update the latest payload for a detached workspace window. */
  updateWorkspaceWindowPayload(payload: DetachedWorkspacePayload): Promise<boolean> {
    return ipcRenderer.invoke(IpcEvents.UPDATE_WORKSPACE_WINDOW_PAYLOAD, payload) as Promise<boolean>;
  },

  /** Close a detached workspace window so it returns to its source slot. */
  recallWorkspaceWindow(workspaceWindowId: string): Promise<boolean> {
    return ipcRenderer.invoke(IpcEvents.RECALL_WORKSPACE_WINDOW, workspaceWindowId) as Promise<boolean>;
  },

  /** Subscribe when a detached workspace window closes and should return to the shell. */
  onWorkspaceWindowClosed(handler: (payload: DetachedWorkspacePayload) => void): () => void {
    workspaceWindowClosedHandlers.add(handler);
    return () => workspaceWindowClosedHandlers.delete(handler);
  },

  /**
   * Subscribe to channel membership changes for this window.
   * Returns unsubscribe function.
   */
  onChannelChanged(handler: ChannelHandler): () => void {
    channelChangeHandlers.add(handler);
    return () => channelChangeHandlers.delete(handler);
  },

  /**
   * Push the current interop flow routing policy to the main process.
   * Main uses this to enforce which app pairs may exchange a given context/intent.
   */
  setFlowPolicy(policy: FlowPolicy): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.SET_FLOW_POLICY, policy) as Promise<void>;
  },

  /** Get the local interop observability snapshot for the Command Center. */
  getInteropSnapshot(): Promise<InteropSnapshot> {
    return ipcRenderer.invoke(IpcEvents.GET_INTEROP_SNAPSHOT) as Promise<InteropSnapshot>;
  },

  /** Subscribe to interop telemetry events emitted by the main-process router. */
  onInteropActivity(handler: (event: InteropActivityEvent) => void): () => void {
    interopActivityHandlers.add(handler);
    return () => interopActivityHandlers.delete(handler);
  },

  /** Get all connected displays with bounds and primary flag. */
  getDisplays(): Promise<DisplayInfo[]> {
    return ipcRenderer.invoke(IpcEvents.GET_DISPLAYS) as Promise<DisplayInfo[]>;
  },

  // ─── Intent resolver modal — internal, used only by intent-resolver.html ───

  __intentResolverGetPayload(): Promise<unknown> {
    return ipcRenderer.invoke(IpcEvents.INTENT_RESOLVER_GET_PAYLOAD);
  },
  __intentResolverPick(appId: string, instanceId?: number): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.INTENT_RESOLVER_PICK, { appId, instanceId }) as Promise<void>;
  },
  __intentResolverCancel(): Promise<void> {
    return ipcRenderer.invoke(IpcEvents.INTENT_RESOLVER_CANCEL) as Promise<void>;
  },
});

// ─── FDC3 2.0 fdc3Ready ────────────────────────────────────────────────────
// Apps following the spec do:
//   if (window.fdc3) { use it } else { window.addEventListener('fdc3Ready', …) }
// Our contextBridge exposes window.fdc3 synchronously before any renderer script
// runs, so window.fdc3 is always present — but we still fire the event once the
// DOM is ready, so spec-compliant apps and the @finos/fdc3 helper work without
// modification.
if (typeof window !== 'undefined') {
  const fire = (): void => {
    window.dispatchEvent(new Event('fdc3Ready'));
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', fire, { once: true });
  } else {
    queueMicrotask(fire);
  }
}
