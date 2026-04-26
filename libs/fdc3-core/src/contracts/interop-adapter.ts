import type { Fdc3Context } from '../types/context.js';
import type { IntentResolution } from '../types/intent.js';
import type { UserChannel } from '../types/channel.js';
import type { ThemeName } from '../types/context.js';

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
    handler: (context: T) => void,
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
export interface Fdc3DesktopAgent {
  broadcast(context: Fdc3Context): Promise<void>;
  addContextListener<T extends Fdc3Context>(
    type: string | null,
    handler: (context: T) => void,
  ): Unsubscribe;
  raiseIntent(intent: string, context?: Fdc3Context): Promise<IntentResolution>;
  addIntentListener(
    intent: string,
    handler: (context?: Fdc3Context, metadata?: IntentInvocationMetadata) => Promise<void> | void,
  ): Unsubscribe;
  completeIntent(requestId: string, result?: Fdc3Context): Promise<void>;
  closeWindow(): Promise<boolean>;
  getTheme(): Promise<ThemeName>;
  setTheme(theme: ThemeName): Promise<ThemeName>;
  onThemeChanged(handler: (theme: ThemeName) => void): Unsubscribe;
  joinUserChannel(channelId: string): Promise<void>;
  leaveCurrentChannel(): Promise<void>;
  getCurrentChannel(): Promise<UserChannel | null>;
  getUserChannels(): Promise<UserChannel[]>;
  open(app: { appId: string }, context?: Fdc3Context): Promise<void>;
}
