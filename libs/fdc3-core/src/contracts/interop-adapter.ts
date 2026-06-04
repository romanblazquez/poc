import type { Fdc3Context } from '../types/context.js';
import type { AppIntent, IntentResolution } from '../types/intent.js';
import type { Channel, PrivateChannel, UserChannel } from '../types/channel.js';
import type { ThemeName } from '../types/context.js';
import type { ImplementationMetadata } from '../types/app.js';
import type { Fdc3EventType, Fdc3EventHandler } from '../types/event.js';
import type { ContextMetadata } from '../types/context-metadata.js';

/**
 * Unsubscribe function returned by listener registration.
 */
export type Unsubscribe = () => void;

export interface IntentInvocationMetadata {
  requestId?: string;
}

/**
 * The core interoperability contract.
 *
 * Every runtime adapter (Electron IPC, browser BroadcastChannel, io.Connect, OpenFin) MUST
 * implement this interface. Apps only ever import and use this contract — never the concrete
 * adapter. This enables zero-code-change migration between desktop providers.
 *
 * Mirrors the FDC3 2.0 DesktopAgent interface, narrowed to what the POC implements.
 */
export interface InteropAdapter {
  // ─── Context broadcasting ─────────────────────────────────────────────────

  /**
   * Broadcast a context on the current user channel.
   * If not on any channel, broadcasts are sent to all windows (global).
   */
  broadcastContext(context: Fdc3Context): Promise<void>;

  /**
   * Subscribe to context updates on the current channel.
   * @param type - context type filter, or null / '*' for all types
   * @returns unsubscribe function
   */
  addContextListener<T extends Fdc3Context>(
    type: string | null,
    handler: (context: T, metadata?: ContextMetadata) => void,
  ): Unsubscribe;

  // ─── Intent routing ───────────────────────────────────────────────────────

  /**
   * Raise a named intent, optionally with context data.
   * The adapter resolves the target app and delivers the intent.
   */
  raiseIntent(intent: string, context?: Fdc3Context): Promise<IntentResolution>;

  /**
   * Register this window as a handler for a named intent.
   * @returns unsubscribe function
   */
  addIntentListener(
    intent: string,
    handler: (context?: Fdc3Context, metadata?: IntentInvocationMetadata) => Promise<void> | void,
  ): Unsubscribe;

  // ─── User channels ────────────────────────────────────────────────────────

  /** Join a named user channel (e.g. "channel-1"). */
  joinChannel(channelId: string): Promise<void>;

  /** Leave the current user channel. */
  leaveCurrentChannel(): Promise<void>;

  /** Get the channel this window is currently on, or null. */
  getCurrentChannel(): Promise<UserChannel | null>;

  /** Get all available user channels defined in configuration. */
  getUserChannels(): Promise<UserChannel[]>;

  // ─── App lifecycle ────────────────────────────────────────────────────────

  /**
   * Open (or focus) an app by its identifier.
   * Optionally pass a context to be delivered once the app is ready.
   */
  openApp(appId: string, context?: Fdc3Context): Promise<void>;
}

/**
 * The shape exposed on window.fdc3.
 * Matches the FDC3 2.0 DesktopAgent surface used in the POC.
 * Apps import this type — never the concrete adapter directly.
 */
/** FDC3 listener object resolved by listener registration methods. */
export interface Listener {
  unsubscribe(): void;
}

/**
 * Compatibility handle for listener registration.
 * It is callable for the existing POC apps and promise-like for standard FDC3 apps.
 */
export type ListenerHandle = Unsubscribe & Listener & PromiseLike<Listener>;

export interface Fdc3DesktopAgent {
  broadcast(context: Fdc3Context): Promise<void>;
  addContextListener<T extends Fdc3Context>(
    handler: (context: T) => void,
  ): ListenerHandle;
  addContextListener<T extends Fdc3Context>(
    type: string | null,
    handler: (context: T, metadata?: ContextMetadata) => void,
  ): ListenerHandle;
  raiseIntent(intent: string, context?: Fdc3Context): Promise<IntentResolution>;
  /** FDC3 2.0 — raise an intent chosen for the given context across all handlers. */
  raiseIntentForContext(context: Fdc3Context): Promise<IntentResolution>;
  addIntentListener(
    intent: string,
    handler: (context?: Fdc3Context, metadata?: IntentInvocationMetadata) => Promise<void> | void,
  ): ListenerHandle;
  /**
   * FDC3 2.1 — listen for agent-level events. Pass `null` for the type to
   * receive every event. The first supported event is `userChannelChanged`.
   */
  addEventListener(type: Fdc3EventType | null, handler: Fdc3EventHandler): ListenerHandle;
  completeIntent(requestId: string, result?: Fdc3Context | PrivateChannel): Promise<void>;
  closeWindow(): Promise<boolean>;
  getTheme(): Promise<ThemeName>;
  setTheme(theme: ThemeName): Promise<ThemeName>;
  onThemeChanged(handler: (theme: ThemeName) => void): Unsubscribe;
  joinUserChannel(channelId: string): Promise<void>;
  leaveCurrentChannel(): Promise<void>;
  getCurrentChannel(): Promise<UserChannel | null>;
  getUserChannels(): Promise<UserChannel[]>;
  open(app: { appId: string }, context?: Fdc3Context): Promise<void>;
  /**
   * Returns the desktop agent's implementation metadata (FDC3 2.0).
   * Apps use this to verify the FDC3 version, provider, and their own identity.
   */
  getInfo(): Promise<ImplementationMetadata>;
  /**
   * FDC3 2.0 — find apps that handle a named intent (optionally for a given context type).
   * Rejects with `NoAppsFound` if no app matches.
   */
  findIntent(intent: string, context?: Fdc3Context, resultType?: string): Promise<AppIntent>;
  /**
   * FDC3 2.0 — find all intents that accept a given context (optionally filtered by resultType).
   * Returns an empty array when nothing matches.
   */
  findIntentsByContext(context: Fdc3Context, resultType?: string): Promise<AppIntent[]>;
  /**
   * FDC3 2.0 — get or create an App Channel by id. App channels are separate from
   * user channels and have no "membership"; anyone with the id can broadcast/listen.
   */
  getOrCreateChannel(channelId: string): Promise<Channel>;
  /**
   * FDC3 2.0 — create a new PrivateChannel for streaming intent results.
   * Typically called by an intent handler before `completeIntent(requestId, channel)`.
   */
  createPrivateChannel(): Promise<PrivateChannel>;
}
