import type { Fdc3Context } from './context.js';
import type { AppMetadata } from './app.js';
import type { Channel } from './channel.js';

/**
 * An intent declaration — what the intent is named and what context types it accepts.
 */
export interface IntentDefinition {
  /** Intent name, e.g. "StartPayment", "ViewInstrument" */
  intent: string;
  /** List of context types this intent handler accepts (null = any) */
  contextTypes: string[] | null;
  /** AppId that handles this intent */
  appId: string;
  /** Display name for the resolver UI */
  displayName?: string;
}

/**
 * FDC3 2.0 `IntentMetadata` — describes one intent for discovery / resolver UI.
 */
export interface IntentMetadata {
  name: string;
  displayName?: string;
}

/**
 * FDC3 2.0 `AppIntent` — one intent and the list of apps that handle it.
 * Returned by `findIntent` / `findIntentsByContext`.
 */
export interface AppIntent {
  intent: IntentMetadata;
  apps: AppMetadata[];
}

/**
 * Result returned after an intent is raised and resolved.
 */
export interface IntentResolution {
  /** The app instance that handled the intent */
  source: { appId: string };
  /** The raised intent name */
  intent: string;
  /**
   * Optional return value from the handler. The preload unwraps any
   * PrivateChannel marker it sees into a real Channel client before resolving
   * the raiseIntent promise — so callers may receive a context or a channel.
   */
  result?: Fdc3Context | Channel;
}

/**
 * Raised when no handler can be found for an intent.
 */
export class IntentResolutionError extends Error {
  constructor(
    public readonly intent: string,
    public readonly context?: Fdc3Context,
  ) {
    super(`No handler found for intent "${intent}"`);
    this.name = 'IntentResolutionError';
  }
}

/**
 * FDC3 2.0 standard error codes returned by `findIntent` / `raiseIntent`.
 * See https://fdc3.finos.org/docs/api/ref/Errors
 */
export const ResolveError = {
  NoAppsFound: 'NoAppsFound',
  ResolverUnavailable: 'ResolverUnavailable',
  UserCancelled: 'UserCancelledResolution',
  ResolverTimeout: 'ResolverTimeout',
  IntentDeliveryFailed: 'IntentDeliveryFailed',
  TargetAppUnavailable: 'TargetAppUnavailable',
  TargetInstanceUnavailable: 'TargetInstanceUnavailable',
} as const;
export type ResolveErrorCode = (typeof ResolveError)[keyof typeof ResolveError];

/**
 * Raised when `findIntent` / `findIntentsByContext` matches no apps.
 * Uses the FDC3 standard `NoAppsFound` error code as its message so
 * spec-aware callers can `catch (e) { if (e.message === ResolveError.NoAppsFound) … }`.
 */
export class NoAppsFoundError extends Error {
  constructor() {
    super(ResolveError.NoAppsFound);
    this.name = 'NoAppsFoundError';
  }
}

/**
 * Raised when the user cancels the resolver dialog instead of picking a handler.
 * Uses the FDC3 standard `UserCancelledResolution` error code.
 */
export class UserCancelledResolutionError extends Error {
  constructor() {
    super(ResolveError.UserCancelled);
    this.name = 'UserCancelledResolutionError';
  }
}

/** Standard intent names used in this POC */
export const StandardIntents = {
  VIEW_CONTACT: 'ViewContact',
  VIEW_INSTRUMENT: 'ViewInstrument',
  VIEW_PORTFOLIO: 'ViewPortfolio',
  START_PAYMENT: 'StartPayment',
  VIEW_ACCOUNT: 'ViewAccount',
  VIEW_CHART: 'ViewChart',
  VIEW_QUOTE: 'ViewQuote',
  VIEW_NEWS: 'ViewNews',
  VIEW_ORDERS: 'ViewOrders',
  VIEW_ANALYSIS: 'ViewAnalysis',
  VIEW_HOLDINGS: 'ViewHoldings',
  VIEW_RESEARCH: 'ViewResearch',
  START_CHAT: 'StartChat',
  SEND_CHAT_MESSAGE: 'SendChatMessage',
  CREATE_INTERACTION: 'CreateInteraction',
} as const;

export type StandardIntent = (typeof StandardIntents)[keyof typeof StandardIntents];
