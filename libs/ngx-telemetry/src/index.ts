/**
 * @fdc3-poc/ngx-telemetry — OTEL-based observability library for Angular micro-frontends.
 *
 * Quick start (standalone):
 *   provideNgxTelemetry({ serviceName: 'my-app', collectorUrl: 'http://localhost:4318' })
 *
 * Quick start (NgModule):
 *   NgxTelemetryModule.forRoot({ serviceName: 'my-app' })
 *
 * Directive (drop on any element, like a GTM click trigger):
 *   <button [track]="'place-order'" [trackData]="{ isin: 'US0378331005' }">
 *
 * FDC3 auto-tracing:
 *   constructor(private fdc3: Fdc3TracerService) { fdc3.attach(); }
 */

// Public API
export { provideNgxTelemetry } from './lib/provide-ngx-telemetry';
export { NgxTelemetryModule } from './lib/ngx-telemetry.module';
export { TelemetryService } from './lib/telemetry.service';
export { RouterTracerService } from './lib/router-tracer.service';
export { Fdc3TracerService } from './lib/fdc3/fdc3-tracer.service';
export { TrackDirective } from './lib/directives/track.directive';
export { telemetryHttpInterceptor } from './lib/interceptors/telemetry-http.interceptor';
export type { NgxTelemetryConfig } from './lib/telemetry.config';
export { NGX_TELEMETRY_CONFIG } from './lib/telemetry.config';
