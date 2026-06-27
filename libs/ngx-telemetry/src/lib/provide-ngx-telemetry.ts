import {
  APP_INITIALIZER,
  EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { NGX_TELEMETRY_CONFIG, type NgxTelemetryConfig } from './telemetry.config';
import { telemetryInitializer } from './telemetry.initializer';

/**
 * Primary standalone setup — add once to your application providers.
 *
 * HTTP auto-instrumentation: add telemetryHttpInterceptor to your own
 * provideHttpClient(withInterceptors([telemetryHttpInterceptor])) call.
 *
 * @example
 * // main.ts
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideHttpClient(withInterceptors([telemetryHttpInterceptor])),
 *     provideNgxTelemetry({
 *       serviceName: 'market-watch',
 *       collectorUrl: 'http://localhost:4318',
 *       environment: 'dev',
 *     }),
 *   ],
 * });
 */
export function provideNgxTelemetry(config: NgxTelemetryConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: NGX_TELEMETRY_CONFIG, useValue: config },
    {
      provide: APP_INITIALIZER,
      useFactory: telemetryInitializer,
      multi: true,
    },
  ]);
}
