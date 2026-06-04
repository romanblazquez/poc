import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { INTEROP_LOG_CATEGORY } from './interop-logger.tokens';
import type { InteropLogEntry, InteropLogLevel } from './interop-logger.types';

interface PlatformLogsBridge {
  log(level: string, message: unknown, data?: unknown, category?: string): Promise<boolean>;
  debug(message: unknown, data?: unknown, category?: string): Promise<boolean>;
  info(message: unknown, data?: unknown, category?: string): Promise<boolean>;
  warn(message: unknown, data?: unknown, category?: string): Promise<boolean>;
  error(message: unknown, data?: unknown, category?: string): Promise<boolean>;
  getLogs(): Promise<InteropLogEntry[]>;
  clear(): Promise<boolean>;
  onLog(handler: (event: InteropLogEntry) => void): () => void;
  getInfo(): { provider: string; apiVersion: string; capabilities: string[] };
}

function detectPlatformLogs(): PlatformLogsBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate = (window as { platformLogs?: unknown }).platformLogs;
  if (candidate && typeof (candidate as PlatformLogsBridge).log === 'function') {
    return candidate as PlatformLogsBridge;
  }
  return undefined;
}

/**
 * Structured logger. Inside the FDC3 Desktop shell, every entry is forwarded
 * to `window.platformLogs` (which writes to the shell's central log buffer
 * and pushes it to any subscriber, including the Command Center). Outside
 * the shell (cloud / standalone tab), entries fall back to `console.*` with
 * the same shape so devtools and local log scrapers see identical output.
 *
 * All methods return a Promise<boolean> matching the platform contract; the
 * boolean is `true` when the entry was accepted by the underlying transport.
 */
@Injectable({ providedIn: 'root' })
export class InteropLogger {
  private readonly defaultCategory = inject(INTEROP_LOG_CATEGORY, { optional: true }) ?? 'app';
  private readonly zone = inject(NgZone);
  private readonly bridge = detectPlatformLogs();

  /** True when the shell-provided bridge is available (vs console fallback). */
  get hasBridge(): boolean { return !!this.bridge; }

  log(level: InteropLogLevel, message: unknown, data?: unknown, category?: string): Promise<boolean> {
    return this.write(level, message, data, category);
  }
  debug(message: unknown, data?: unknown, category?: string): Promise<boolean> {
    return this.write('debug', message, data, category);
  }
  info(message: unknown, data?: unknown, category?: string): Promise<boolean> {
    return this.write('info', message, data, category);
  }
  warn(message: unknown, data?: unknown, category?: string): Promise<boolean> {
    return this.write('warning', message, data, category);
  }
  error(message: unknown, data?: unknown, category?: string): Promise<boolean> {
    return this.write('error', message, data, category);
  }

  /** Snapshot of the log buffer when running inside the shell; `[]` otherwise. */
  async getLogs(): Promise<InteropLogEntry[]> {
    if (!this.bridge) return [];
    try { return await this.bridge.getLogs(); } catch { return []; }
  }

  /** Wipe the global buffer — only effective when the shell bridge is present. */
  async clear(): Promise<boolean> {
    if (!this.bridge) return false;
    try { return await this.bridge.clear(); } catch { return false; }
  }

  /**
   * Stream of new log entries pushed by the shell. Auto-tears-down via the
   * calling injector's DestroyRef — components can `inject(InteropLogger).logs$.subscribe(...)`
   * without managing the unsub. In console-fallback mode this Observable never emits.
   */
  readonly logs$: Observable<InteropLogEntry> = (() => {
    const destroyRef = inject(DestroyRef, { optional: true });
    const obs = new Observable<InteropLogEntry>((subscriber) => {
      if (!this.bridge) return () => undefined;
      const unsub = this.bridge.onLog((entry) =>
        this.zone.run(() => subscriber.next(entry)),
      );
      return () => unsub();
    });
    return destroyRef ? obs.pipe(takeUntilDestroyed(destroyRef)) : obs;
  })();

  /** Bridge capability metadata, or `null` when running off-bridge. */
  getInfo(): { provider: string; apiVersion: string; capabilities: string[] } | null {
    return this.bridge?.getInfo() ?? null;
  }

  private async write(level: InteropLogLevel, message: unknown, data?: unknown, category?: string): Promise<boolean> {
    const cat = category ?? this.defaultCategory;
    if (this.bridge) {
      try {
        return await this.bridge.log(level, message, data, cat);
      } catch {
        return this.fallback(level, message, data, cat);
      }
    }
    return this.fallback(level, message, data, cat);
  }

  private fallback(level: InteropLogLevel, message: unknown, data?: unknown, category?: string): boolean {
    // eslint-disable-next-line no-console
    const fn = level === 'debug' ? console.debug
      : level === 'info' ? console.info
      : level === 'warn' || level === 'warning' ? console.warn
      : level === 'error' ? console.error
      : console.log;
    if (data !== undefined) fn(`[${category}]`, message, data);
    else fn(`[${category}]`, message);
    return true;
  }
}
