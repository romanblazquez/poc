import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { provideInterop } from '@fdc3-poc/interop-angular';
import { provideInteropTheme } from '@fdc3-poc/interop-angular/theme';
import { provideNgxTelemetry, telemetryHttpInterceptor } from '@fdc3-poc/ngx-telemetry';

ModuleRegistry.registerModules([AllCommunityModule]);

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideInterop({ appId: 'market-watch' }),
    provideInteropTheme(),
    provideHttpClient(withInterceptors([telemetryHttpInterceptor])),
    provideNgxTelemetry({
      serviceName: 'market-watch',
      serviceVersion: '0.1.0',
      environment: (window as { __ENV__?: string }).__ENV__ ?? 'dev',
      collectorUrl: 'http://localhost:4318',
      traceHttp: true,
      traceRoutes: false, // no router in this app
    }),
  ],
}).catch(console.error);
