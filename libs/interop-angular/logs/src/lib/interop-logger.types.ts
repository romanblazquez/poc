/**
 * Log levels accepted by the logger. The underlying `window.platformLogs`
 * surface normalises `'warn'` → `'warning'` so we accept both here too.
 */
export type InteropLogLevel = 'debug' | 'info' | 'warn' | 'warning' | 'error';

/**
 * Shape of a log entry observed via `getLogs()` / `onLog()`. Mirrors the
 * preload `AppLogEvent` shape without depending on the shell's internal type.
 */
export interface InteropLogEntry {
  ts: number;
  level: 'debug' | 'info' | 'warning' | 'error';
  category?: string;
  message: string;
  data?: unknown;
  source?: string;
}

export interface InteropLogsOptions {
  /**
   * Default category attached to every entry the logger emits when the caller
   * doesn't pass one explicitly. Falls back to `'app'`.
   */
  category?: string;
}
