import { EnvironmentProviders, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { InteropThemeService } from './interop-theme.service';

export interface InteropThemeOptions {
  /**
   * If `true` (default), `provideInteropTheme()` registers an environment
   * initializer that auto-starts the theme bridge as soon as the app boots.
   * Set to `false` to start manually via `inject(InteropThemeService).start()`.
   */
  autoStart?: boolean;
}

/**
 * Drop-in replacement for the 45-line theme-sync block every app currently
 * duplicates in its AppComponent. Register once in `ApplicationConfig`:
 *
 * @example
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideInterop({ appId: 'my-app' }),
 *     provideInteropTheme(),
 *   ],
 * };
 *
 * After this, `document.documentElement.dataset.theme` is always in sync with
 * the active FDC3 theme — no per-app code required.
 */
export function provideInteropTheme(opts: InteropThemeOptions = {}): EnvironmentProviders {
  const autoStart = opts.autoStart ?? true;
  if (!autoStart) {
    return makeEnvironmentProviders([]);
  }
  return makeEnvironmentProviders([
    provideEnvironmentInitializer(() => {
      void inject(InteropThemeService).start();
    }),
  ]);
}
