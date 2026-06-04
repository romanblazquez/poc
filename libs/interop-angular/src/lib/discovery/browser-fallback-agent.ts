import type {
  AppIntent,
  Channel,
  ContextMetadata,
  Fdc3Context,
  Fdc3DesktopAgent,
  Fdc3EventHandler,
  Fdc3EventType,
  ImplementationMetadata,
  IntentInvocationMetadata,
  IntentResolution,
  ListenerHandle,
  PrivateChannel,
  ThemeName,
  Unsubscribe,
  UserChannel,
} from '../fdc3-types';
import { NoAppsFoundError } from '../fdc3-types';
import { toListenerHandle } from '../listener-handle';

/**
 * BroadcastChannel-backed agent for cloud / open-web Angular apps that aren't
 * running inside an FDC3 host. It is intentionally small: same-origin tabs can
 * join the same user channel and exchange contexts over BroadcastChannel.
 *
 * Two tabs of the same origin become a tiny FDC3 mesh: pick the same user
 * channel, broadcast `fdc3.instrument`, the other tab sees it.
 */
const THEME_STORAGE_KEY = 'interop-angular:theme';
const BUS_NAME = 'interop-angular:browser-fallback';
const DEFAULT_THEME: ThemeName = 'dark-financial';
const VALID_THEMES: ThemeName[] = ['dark-financial', 'light-financial', 'high-contrast', 'luxury-neutral'];
const THEME_EVENT = 'interop-angular:theme-change';
const FALLBACK_CHANNELS: UserChannel[] = [
  { id: 'channel-1', type: 'user', displayMetadata: { name: 'Red', color: '#e84040' } },
  { id: 'channel-2', type: 'user', displayMetadata: { name: 'Orange', color: '#e87040' } },
  { id: 'channel-3', type: 'user', displayMetadata: { name: 'Yellow', color: '#e8d840' } },
  { id: 'channel-4', type: 'user', displayMetadata: { name: 'Green', color: '#40c080' } },
  { id: 'channel-5', type: 'user', displayMetadata: { name: 'Blue', color: '#4080e8' } },
  { id: 'channel-6', type: 'user', displayMetadata: { name: 'Purple', color: '#9040e8' } },
];

type BrowserBusMessage =
  | { type: 'context'; channelId: string | null; context: Fdc3Context; sourceAppId: string }
  | { type: 'intent'; intent: string; context?: Fdc3Context; sourceAppId: string };

function readTheme(): ThemeName {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY) as ThemeName | null;
    return t && VALID_THEMES.includes(t) ? t : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function writeTheme(t: ThemeName): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, t); } catch { /* storage disabled */ }
  try {
    window.dispatchEvent(new CustomEvent<ThemeName>(THEME_EVENT, { detail: t }));
  } catch { /* SSR */ }
}

export function makeBrowserFallbackAgent(appId: string): Fdc3DesktopAgent {
  const bc = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(BUS_NAME);
  let currentChannelId: string | null = null;
  const contextHandlers = new Map<string, Set<(ctx: Fdc3Context, meta?: ContextMetadata) => void>>();
  const intentHandlers = new Map<
    string,
    Set<(ctx?: Fdc3Context, meta?: IntentInvocationMetadata) => Promise<void> | void>
  >();
  const eventHandlers = new Set<Fdc3EventHandler>();
  const meta: ImplementationMetadata = {
    fdc3Version: '2.0',
    provider: 'interop-angular/browser-fallback',
    providerVersion: '0.1.0',
    appMetadata: { appId, instanceId: `tab:${Math.random().toString(36).slice(2, 10)}` },
    optionalFeatures: {
      OriginatingAppMetadata: false,
      UserChannelMembershipAPIs: true,
      DesktopAgentBridging: false,
    },
  };

  const notifyChannelChanged = (): void => {
    const event = {
      type: 'userChannelChanged' as const,
      details: { currentChannelId },
    };
    for (const handler of eventHandlers) handler(event);
  };

  const dispatchContext = (context: Fdc3Context, sourceAppId = appId): void => {
    const typed = contextHandlers.get(context.type) ?? new Set();
    const wildcard = contextHandlers.get('*') ?? new Set();
    const metadata: ContextMetadata = { source: { appId: sourceAppId } };
    for (const handler of [...typed, ...wildcard]) handler(context, metadata);
  };

  bc?.addEventListener('message', (event: MessageEvent<BrowserBusMessage>) => {
    const msg = event.data;
    if (!msg || msg.sourceAppId === appId) return;
    if (msg.type === 'context') {
      if (msg.channelId !== currentChannelId) return;
      dispatchContext(msg.context, msg.sourceAppId);
      return;
    }
    if (msg.type === 'intent') {
      const handlers = intentHandlers.get(msg.intent);
      if (!handlers || handlers.size === 0) return;
      const invocation: IntentInvocationMetadata = { requestId: `browser:${Date.now()}` };
      for (const handler of handlers) void handler(msg.context, invocation);
    }
  });

  function addContextListener<T extends Fdc3Context>(handler: (context: T) => void): ListenerHandle;
  function addContextListener<T extends Fdc3Context>(
    type: string | null,
    handler: (context: T, metadata?: ContextMetadata) => void,
  ): ListenerHandle;
  function addContextListener<T extends Fdc3Context>(
    typeOrHandler: string | null | ((context: T, metadata?: ContextMetadata) => void),
    maybeHandler?: (context: T, metadata?: ContextMetadata) => void,
  ): ListenerHandle {
    const type = typeof typeOrHandler === 'function' ? null : typeOrHandler;
    const handler = typeof typeOrHandler === 'function' ? typeOrHandler : maybeHandler!;
    const key = type ?? '*';
    const set = contextHandlers.get(key) ?? new Set();
    contextHandlers.set(key, set);
    const wrapped = handler as (ctx: Fdc3Context, meta?: ContextMetadata) => void;
    set.add(wrapped);
    const unsub: Unsubscribe = () => set.delete(wrapped);
    return toListenerHandle(unsub);
  }

  return {
    broadcast: async (ctx: Fdc3Context) => {
      bc?.postMessage({ type: 'context', channelId: currentChannelId, context: ctx, sourceAppId: appId } satisfies BrowserBusMessage);
      dispatchContext(ctx);
    },
    addContextListener,
    raiseIntent: async (intent: string, ctx?: Fdc3Context): Promise<IntentResolution> => {
      const handlers = intentHandlers.get(intent);
      if (!handlers || handlers.size === 0) {
        bc?.postMessage({ type: 'intent', intent, context: ctx, sourceAppId: appId } satisfies BrowserBusMessage);
        throw new NoAppsFoundError();
      }
      const invocation: IntentInvocationMetadata = { requestId: `browser:${Date.now()}` };
      for (const handler of handlers) await handler(ctx, invocation);
      return { source: { appId }, intent };
    },
    raiseIntentForContext: async (_ctx: Fdc3Context): Promise<IntentResolution> => {
      // No directory in browser-fallback mode → spec-correct NoAppsFound.
      throw new NoAppsFoundError();
    },
    addIntentListener: (
      intent: string,
      handler: (ctx?: Fdc3Context, meta?: IntentInvocationMetadata) => Promise<void> | void,
    ) => {
      const set = intentHandlers.get(intent) ?? new Set();
      intentHandlers.set(intent, set);
      set.add(handler);
      return toListenerHandle(() => set.delete(handler));
    },
    addEventListener: (type: Fdc3EventType | null, handler: Fdc3EventHandler) => {
      if (type !== null && type !== 'userChannelChanged') return toListenerHandle(() => undefined);
      eventHandlers.add(handler);
      return toListenerHandle(() => eventHandlers.delete(handler));
    },
    completeIntent: async (_requestId: string, _result?: Fdc3Context | PrivateChannel) => undefined,
    closeWindow: async () => {
      try { window.close(); return true; } catch { return false; }
    },
    getTheme: async () => readTheme(),
    setTheme: async (theme: ThemeName) => { writeTheme(theme); return theme; },
    onThemeChanged: (handler: (theme: ThemeName) => void): Unsubscribe => {
      const onCustom = (e: Event): void => handler((e as CustomEvent<ThemeName>).detail);
      const onStorage = (e: StorageEvent): void => {
        if (e.key === THEME_STORAGE_KEY && e.newValue && VALID_THEMES.includes(e.newValue as ThemeName)) {
          handler(e.newValue as ThemeName);
        }
      };
      window.addEventListener(THEME_EVENT, onCustom as EventListener);
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener(THEME_EVENT, onCustom as EventListener);
        window.removeEventListener('storage', onStorage);
      };
    },
    joinUserChannel: async (channelId: string) => {
      currentChannelId = channelId;
      notifyChannelChanged();
    },
    leaveCurrentChannel: async () => {
      currentChannelId = null;
      notifyChannelChanged();
    },
    getCurrentChannel: async () =>
      currentChannelId ? FALLBACK_CHANNELS.find((c) => c.id === currentChannelId) ?? null : null,
    getUserChannels: async () => FALLBACK_CHANNELS,
    open: async (_app: { appId: string }, _ctx?: Fdc3Context) => undefined,
    getInfo: async () => meta,
    findIntent: async (): Promise<AppIntent> => { throw new NoAppsFoundError(); },
    findIntentsByContext: async (): Promise<AppIntent[]> => [],
    getOrCreateChannel: async (): Promise<Channel> => {
      throw new Error('Browser-fallback agent: App Channels not yet implemented');
    },
    createPrivateChannel: async (): Promise<PrivateChannel> => {
      throw new Error('Browser-fallback agent: Private Channels not yet implemented');
    },
  };
}
