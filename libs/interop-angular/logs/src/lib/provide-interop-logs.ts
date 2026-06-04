import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { INTEROP_LOG_CATEGORY } from './interop-logger.tokens';
import type { InteropLogsOptions } from './interop-logger.types';

/**
 * Opt-in provider for the structured logger.
 *
 * @example
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideInterop({ appId: 'order-ticket' }),
 *     provideInteropLogs({ category: 'order-ticket' }),
 *   ],
 * };
 *
 * Then inject the logger in any component / service:
 *
 * @example
 * private readonly log = inject(InteropLogger);
 * this.log.info('order submitted', { orderId, ticker });
 */
export function provideInteropLogs(opts: InteropLogsOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: INTEROP_LOG_CATEGORY, useValue: opts.category ?? 'app' },
  ]);
}
