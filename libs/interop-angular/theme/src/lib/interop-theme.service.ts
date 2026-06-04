import { Injectable, NgZone, inject, signal } from '@angular/core';
import { InteropService } from '@fdc3-poc/interop-angular';
import type { ThemeName } from '@fdc3-poc/interop-angular';

const DEFAULT_THEME: ThemeName = 'dark-financial';

/**
 * Single source of truth for the app's currently-applied workstation theme.
 *
 * - Reads the initial theme from the discovered FDC3 agent.
 * - Subscribes to `onThemeChanged` so any shell-wide theme broadcast updates
 *   the signal AND `document.documentElement.dataset.theme` in one go.
 * - In browser-fallback mode (cloud-served / standalone tab) the underlying
 *   agent persists the theme in localStorage and replays it across tabs.
 */
@Injectable({ providedIn: 'root' })
export class InteropThemeService {
  private readonly interop = inject(InteropService);
  private readonly zone = inject(NgZone);
  private unsub?: () => void;
  private started = false;

  readonly theme = signal<ThemeName>(DEFAULT_THEME);

  /** Idempotent bootstrap — usually called by `provideInteropTheme()`'s init hook. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      const t = await this.interop.getTheme();
      this.applyAndSet(t);
    } catch {
      // Agent unavailable / errored — keep default. Listener will pick up later.
    }
    try {
      this.unsub = await this.interop.onThemeChanged((t) => this.applyAndSet(t));
    } catch {
      // Theme listener not supported on this agent — non-fatal.
    }
  }

  /** Push a theme change through the agent and update the local signal. */
  async setTheme(theme: ThemeName): Promise<void> {
    await this.interop.setTheme(theme);
    this.applyAndSet(theme);
  }

  /** Used by tests / hot-reload. Not normally needed. */
  stop(): void {
    this.unsub?.();
    this.unsub = undefined;
    this.started = false;
  }

  private applyAndSet(t: ThemeName): void {
    this.zone.run(() => {
      this.theme.set(t);
      if (typeof document !== 'undefined') {
        document.documentElement.dataset['theme'] = t;
      }
    });
  }
}
