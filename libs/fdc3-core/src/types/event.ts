/**
 * FDC3 2.1 typed Desktop Agent events.
 *
 * FDC3 2.1 introduced `fdc3.addEventListener(type, handler)` for agent-level
 * events that are not contexts or intents — the first being `userChannelChanged`,
 * which fires whenever the calling app's current user channel changes (including
 * when it leaves a channel, where `currentChannelId` is null).
 *
 * Modern apps built against `@finos/fdc3` ^2.1 use this instead of any bespoke
 * channel-change callback, so supporting it is part of "any FDC3 app just works".
 */

/** Names of the agent-level events an app can listen for. */
export type Fdc3EventType = 'userChannelChanged';

/** Payload delivered for the `userChannelChanged` event. */
export interface Fdc3ChannelChangedEventDetails {
  /** Id of the channel the app is now on, or null if it left all channels. */
  currentChannelId: string | null;
}

/** The event object passed to an `addEventListener` handler (FDC3 2.1 `ApiEvent`). */
export interface Fdc3Event {
  type: Fdc3EventType;
  details: Fdc3ChannelChangedEventDetails;
}

/** Handler registered via `fdc3.addEventListener`. */
export type Fdc3EventHandler = (event: Fdc3Event) => void;
