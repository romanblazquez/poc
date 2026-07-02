import { NgModule, ModuleWithProviders } from '@angular/core';
import { NGX_TELEMETRY_CONFIG, type NgxTelemetryConfig } from './telemetry.config';
import { initTelemetry } from './telemetry.initializer';
import { TrackDirective } from './directives/track.directive';

/**
 * NgModule-based entry point for apps that haven't migrated to standalone yet.
 *
 * @example
 * // app.module.ts
 * @NgModule({
 *   imports: [NgxTelemetryModule.forRoot({ serviceName: 'order-blotter' })],
 * })
 * export class AppModule {}
 */
@NgModule({
  imports: [TrackDirective],
  exports: [TrackDirective],
})
export class NgxTelemetryModule {
  static forRoot(config: NgxTelemetryConfig): ModuleWithProviders<NgxTelemetryModule> {
    initTelemetry(config);
    return {
      ngModule: NgxTelemetryModule,
      providers: [
        { provide: NGX_TELEMETRY_CONFIG, useValue: config },
      ],
    };
  }
}
