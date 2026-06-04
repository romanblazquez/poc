/**
 * @fdc3-poc/interop-angular/theme — opt-in theme bridge.
 *
 * Eliminates the 14× duplicated theme-sync block in every app's
 * AppComponent. Register `provideInteropTheme()` in your ApplicationConfig
 * and the document `data-theme` attribute auto-mirrors the FDC3 theme
 * broadcast by the shell (or persists in localStorage in browser-fallback
 * mode).
 */

export { provideInteropTheme } from './lib/provide-interop-theme';
export { InteropThemeService } from './lib/interop-theme.service';
export type { InteropThemeOptions } from './lib/provide-interop-theme';
