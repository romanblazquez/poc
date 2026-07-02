import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { NGX_TELEMETRY_CONFIG, type NgxTelemetryConfig } from './telemetry.config';
import { initTelemetry } from './telemetry.initializer';

/**
 * Primary standalone setup — add once to your application providers.
 *
 * OTEL is initialized synchronously here, before Angular's DI machinery runs,
 * to avoid CJS class-constructor issues with esbuild bundling.
 *
 * HTTP auto-instrumentation: add telemetryHttpInterceptor to your own
 * provideHttpClient(withInterceptors([telemetryHttpInterceptor])) call.
 */
export function provideNgxTelemetry(config: NgxTelemetryConfig): EnvironmentProviders {
  initTelemetry(config); // runs before Angular DI — avoids esbuild CJS runInitializers issue
  return makeEnvironmentProviders([
    { provide: NGX_TELEMETRY_CONFIG, useValue: config },
  ]);
}
