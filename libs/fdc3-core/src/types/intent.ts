import type { Fdc3Context } from './context.js';

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
 * Result returned after an intent is raised and resolved.
 */
export interface IntentResolution {
  /** The app instance that handled the intent */
  source: { appId: string };
  /** The raised intent name */
  intent: string;
  /** Optional return context from the handler */
  result?: Fdc3Context;
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

/** Standard intent names used in this POC */
export const StandardIntents = {
  VIEW_CONTACT: 'ViewContact',
  VIEW_INSTRUMENT: 'ViewInstrument',
  VIEW_PORTFOLIO: 'ViewPortfolio',
  START_PAYMENT: 'StartPayment',
  VIEW_ACCOUNT: 'ViewAccount',
} as const;

export type StandardIntent = (typeof StandardIntents)[keyof typeof StandardIntents];
