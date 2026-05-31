/**
 * FDC3 User Channel definitions.
 * User channels are the coloured "trading channel" strips familiar in Bloomberg / OpenFin.
 */

export type ChannelType = 'user' | 'app' | 'private';

export interface UserChannel {
  id: string;
  type: ChannelType;
  displayMetadata: ChannelDisplayMetadata;
}

export interface ChannelDisplayMetadata {
  name: string;
  color: string;
  /** CSS color for the glyph/icon */
  glyph?: string;
}

/**
 * FDC3 2.0 `Channel` — generic channel surface returned by `getOrCreateChannel`
 * and (later) by `createPrivateChannel`. User channels are not Channel objects in
 * this POC — they're addressed via `joinUserChannel`/`leaveCurrentChannel`.
 */
export interface Channel {
  readonly id: string;
  readonly type: ChannelType;
  readonly displayMetadata?: ChannelDisplayMetadata;
  broadcast(context: import('./context.js').Fdc3Context): Promise<void>;
  getCurrentContext(contextType?: string): Promise<import('./context.js').Fdc3Context | null>;
  addContextListener<T extends import('./context.js').Fdc3Context>(
    handler: (context: T) => void,
  ): Promise<ChannelListener>;
  addContextListener<T extends import('./context.js').Fdc3Context>(
    contextType: string | null,
    handler: (context: T) => void,
  ): Promise<ChannelListener>;
}

/** Subscription handle returned by `Channel.addContextListener` (FDC3 2.0). */
export interface ChannelListener {
  unsubscribe(): void;
}

/** Handle returned by PrivateChannel lifecycle subscriptions (`onAddContextListener`, etc.). */
export interface PrivateChannelEventListener {
  unsubscribe(): void;
}

/**
 * FDC3 2.0 `PrivateChannel` — a 1:1 channel typically returned by an intent
 * handler as the intent result so the raiser receives streaming updates.
 *
 * In addition to the standard Channel API it exposes lifecycle hooks
 * (`onAddContextListener`, `onUnsubscribe`, `onDisconnect`) so the handler can
 * react when the raiser subscribes, unsubscribes, or disconnects.
 */
export interface PrivateChannel extends Channel {
  readonly type: 'private';
  /** Notified when the *remote* side adds a context listener. */
  onAddContextListener(handler: (contextType: string | null) => void): PrivateChannelEventListener;
  /** Notified when the *remote* side removes a context listener. */
  onUnsubscribe(handler: (contextType: string | null) => void): PrivateChannelEventListener;
  /** Notified when the *remote* side disconnects (window closed or explicit disconnect). */
  onDisconnect(handler: () => void): PrivateChannelEventListener;
  /** Terminate this private channel for both sides. */
  disconnect(): Promise<void>;
}

/**
 * Marker used over IPC to carry a PrivateChannel reference inside an intent
 * result without serialising the methods. The preload re-wraps it on the raiser
 * side into a real PrivateChannel client.
 */
export interface PrivateChannelMarker {
  __fdc3PrivateChannelId: string;
}

export function isPrivateChannelMarker(value: unknown): value is PrivateChannelMarker {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as PrivateChannelMarker).__fdc3PrivateChannelId === 'string'
  );
}

/** Well-known default user channels */
export const DEFAULT_USER_CHANNELS: UserChannel[] = [
  { id: 'channel-1', type: 'user', displayMetadata: { name: 'Red', color: '#e84040' } },
  { id: 'channel-2', type: 'user', displayMetadata: { name: 'Orange', color: '#e87040' } },
  { id: 'channel-3', type: 'user', displayMetadata: { name: 'Yellow', color: '#e8d840' } },
  { id: 'channel-4', type: 'user', displayMetadata: { name: 'Green', color: '#40c080' } },
  { id: 'channel-5', type: 'user', displayMetadata: { name: 'Blue', color: '#4080e8' } },
  { id: 'channel-6', type: 'user', displayMetadata: { name: 'Purple', color: '#9040e8' } },
];
