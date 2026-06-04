import { InjectionToken } from '@angular/core';

/**
 * What to do when no FDC3 agent can be discovered (no `window.fdc3`, no
 * `getAgent()` response).
 *
 * - `broadcast-channel` (default): spin up an in-page adapter backed by
 *   `BroadcastChannel`. Multiple tabs of the same origin still talk to each
 *   other. The app sees a normal `Fdc3DesktopAgent`.
 * - `noop`: every call resolves silently with safe defaults. The app renders
 *   normally but FDC3 wiring is inert.
 * - `fail`: every call rejects. Use when you need loud failures in CI.
 */
export type InteropOfflineMode = 'broadcast-channel' | 'noop' | 'fail';

/**
 * Runtime configuration for `provideInterop()`. Kept as a value-type token so
 * consumers can override it in tests via Angular DI without touching globals.
 */
export interface InteropConfig {
  /**
   * Stable app identifier. Used as the broadcast-channel namespace, the source
   * `appId` in FDC3 events, and the log category default.
   */
  appId: string;
  /**
   * How to behave when no agent is discoverable. Default: `'broadcast-channel'`.
   */
  offline?: InteropOfflineMode;
  /**
   * Max milliseconds the FDC3 2.1 `getAgent()` discovery may take before we
   * fall back. Default: 750.
   */
  getAgentTimeoutMs?: number;
  /**
   * Identity URL passed to FDC3 2.1 `getAgent({ identityUrl })`. Defaults to
   * the current `window.location.href`.
   */
  identityUrl?: string;
}

export const INTEROP_CONFIG = new InjectionToken<Required<InteropConfig>>('INTEROP_CONFIG');
