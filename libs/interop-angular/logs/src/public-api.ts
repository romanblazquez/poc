/**
 * @fdc3-poc/interop-angular/logs — opt-in structured logging bridge.
 *
 * Forwards to the shell-provided `window.platformLogs` global when present
 * (every hosted app gets it automatically inside the FDC3 Desktop shell) and
 * falls back to `console.*` with the same payload shape otherwise — so cloud
 * apps see identical local output during development.
 */

export { provideInteropLogs } from './lib/provide-interop-logs';
export { InteropLogger } from './lib/interop-logger.service';
export type {
  InteropLogsOptions,
  InteropLogLevel,
  InteropLogEntry,
} from './lib/interop-logger.types';
export { INTEROP_LOG_CATEGORY } from './lib/interop-logger.tokens';
