import { ApplicationConfig } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideInterop } from '@fdc3-poc/interop-angular';
import { provideInteropTheme } from '@fdc3-poc/interop-angular/theme';
import { provideInteropLogs } from '@fdc3-poc/interop-angular/logs';

/**
 * Single source of truth for this app's interop wiring.
 *
 * Notice what's NOT here: there is no manual `window.fdc3` reference, no
 * theme-sync block, no listener bookkeeping. Three provider calls bring the
 * full FDC3 facade, document.data-theme sync, and structured logging.
 *
 * The same `appConfig` works whether the app is loaded:
 *   1. inside the FDC3 Desktop shell    → mode = 'shell'
 *   2. inside an FDC3 web host          → mode = 'web-agent'
 *   3. standalone in a browser tab      → mode = 'browser-fallback'
 *                                         (BroadcastChannel: two tabs talk)
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    provideInterop({ appId: 'cloud-trader' }),
    provideInteropTheme(),
    provideInteropLogs({ category: 'cloud-trader' }),
  ],
};
