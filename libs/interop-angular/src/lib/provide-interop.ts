import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import type { InteropConfig } from './tokens';
import { INTEROP_CONFIG } from './tokens';

/**
 * Root provider for `@fdc3-poc/interop-angular`. Register once in your
 * `ApplicationConfig.providers`.
 *
 * @example
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideInterop({ appId: 'my-cloud-app' }),
 *     provideAnimations(),
 *   ],
 * };
 * ```
 */
export function provideInterop(config: InteropConfig): EnvironmentProviders {
  const resolved: Required<InteropConfig> = {
    appId: config.appId,
    offline: config.offline ?? 'broadcast-channel',
    getAgentTimeoutMs: config.getAgentTimeoutMs ?? 750,
    identityUrl: config.identityUrl ?? (typeof window !== 'undefined' ? window.location.href : 'about:blank'),
  };
  return makeEnvironmentProviders([
    { provide: INTEROP_CONFIG, useValue: resolved },
  ]);
}
