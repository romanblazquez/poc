import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  AppIntent,
  Channel,
  Fdc3Context,
  Fdc3DesktopAgent,
  ImplementationMetadata,
  IntentInvocationMetadata,
  IntentResolution,
  PrivateChannel,
  ThemeName,
  UserChannel,
} from './fdc3-types';
import { INTEROP_CONFIG } from './tokens';
import type { InteropMode } from './discovery/agent-discovery';
import { discoverAgent } from './discovery/agent-discovery';

/**
 * Strongly-typed wrapper for an FDC3 intent invocation received via the
 * service's `intents$()` Observable. Bundles the inbound context with the
 * `requestId` that handlers need to call `completeIntent`.
 */
export interface IntentInvocation<T extends Fdc3Context = Fdc3Context> {
  context: T | undefined;
  meta: IntentInvocationMetadata | undefined;
}

/**
 * The Angular-idiomatic FDC3 facade.
 *
 * Discovery runs lazily in the constructor; consumers may call any method
 * immediately and the call queues until the agent resolves. Signals (`mode`,
 * `ready`, `currentChannel`, etc.) are populated as soon as the agent reports.
 *
 * Listener teardown is automatic — every Observable returned from this
 * service is piped through `takeUntilDestroyed()` keyed off the *consumer's*
 * `DestroyRef`. So a component-scoped `inject(InteropService).contexts$(...)`
 * needs no `ngOnDestroy` plumbing.
 */
@Injectable({ providedIn: 'root' })
export class InteropService {
  private readonly config = inject(INTEROP_CONFIG);
  private readonly zone = inject(NgZone);

  /** Resolves with the discovered agent. All public methods await this. */
  private readonly agentPromise: Promise<Fdc3DesktopAgent>;

  // ─── Signals (live state) ────────────────────────────────────────────────

  readonly ready = signal<boolean>(false);
  readonly mode = signal<InteropMode>('shell');
  readonly info = signal<ImplementationMetadata | null>(null);
  readonly currentChannel = signal<UserChannel | null>(null);
  readonly availableChannels = signal<UserChannel[]>([]);

  /** Most recently received context across all listeners — handy for the
   *  Command Center / activity log without subscribing per-type. */
  readonly lastContext = signal<Fdc3Context | null>(null);

  constructor() {
    this.agentPromise = this.bootstrap();
  }

  private async bootstrap(): Promise<Fdc3DesktopAgent> {
    const { agent, mode } = await discoverAgent(this.config);
    this.zone.run(() => this.mode.set(mode));

    try {
      const info = await agent.getInfo();
      this.zone.run(() => this.info.set(info));
    } catch (_) { /* tolerable */ }

    try {
      const [chs, current] = await Promise.all([agent.getUserChannels(), agent.getCurrentChannel()]);
      this.zone.run(() => {
        this.availableChannels.set(chs);
        this.currentChannel.set(current);
      });
    } catch (_) { /* tolerable */ }

    // Hook the global channel-changed event when the host exposes one
    // (the FDC3 POC preload does — others may not).
    const w = window as { fdc3?: { onChannelChanged?(h: (c: UserChannel | null) => void): () => void } };
    if (mode === 'shell' && typeof w.fdc3?.onChannelChanged === 'function') {
      w.fdc3.onChannelChanged((ch) => this.zone.run(() => this.currentChannel.set(ch)));
    }

    this.zone.run(() => this.ready.set(true));
    return agent;
  }

  /** Returns the resolved agent. Mostly internal; exposed for escape-hatch use cases. */
  async getAgent(): Promise<Fdc3DesktopAgent> {
    return this.agentPromise;
  }

  // ─── Broadcasting ────────────────────────────────────────────────────────

  async broadcast(ctx: Fdc3Context): Promise<void> {
    const agent = await this.agentPromise;
    await agent.broadcast(ctx);
  }

  // ─── Contexts as Observables ─────────────────────────────────────────────

  /**
   * Stream of contexts of the given type ('*' or null = all). Auto-unsubscribes
   * when the **calling injector's** DestroyRef fires — so components that
   * `inject(InteropService).contexts$(...)` never need to manually unsub.
   */
  contexts$<T extends Fdc3Context = Fdc3Context>(type: string | null): Observable<T> {
    const destroyRef = inject(DestroyRef, { optional: true });
    const obs = new Observable<T>((subscriber) => {
      let unsub: (() => void) | undefined;
      let disposed = false;
      this.agentPromise.then((agent) => {
        if (disposed) return;
        unsub = agent.addContextListener<T>(type, (ctx) =>
          this.zone.run(() => {
            this.lastContext.set(ctx);
            subscriber.next(ctx);
          }),
        );
      });
      return (): void => {
        disposed = true;
        unsub?.();
      };
    });
    return destroyRef ? obs.pipe(takeUntilDestroyed(destroyRef)) : obs;
  }

  // ─── Intents ─────────────────────────────────────────────────────────────

  intents$<T extends Fdc3Context = Fdc3Context>(intent: string): Observable<IntentInvocation<T>> {
    const destroyRef = inject(DestroyRef, { optional: true });
    const obs = new Observable<IntentInvocation<T>>((subscriber) => {
      let unsub: (() => void) | undefined;
      let disposed = false;
      this.agentPromise.then((agent) => {
        if (disposed) return;
        unsub = agent.addIntentListener(intent, (context, meta) =>
          this.zone.run(() => subscriber.next({ context: context as T | undefined, meta })),
        );
      });
      return (): void => {
        disposed = true;
        unsub?.();
      };
    });
    return destroyRef ? obs.pipe(takeUntilDestroyed(destroyRef)) : obs;
  }

  async raiseIntent(intent: string, ctx?: Fdc3Context): Promise<IntentResolution> {
    const agent = await this.agentPromise;
    return agent.raiseIntent(intent, ctx);
  }

  async completeIntent(requestId: string, result?: Fdc3Context | PrivateChannel): Promise<void> {
    const agent = await this.agentPromise;
    return agent.completeIntent(requestId, result);
  }

  // ─── Discovery ───────────────────────────────────────────────────────────

  async findIntent(intent: string, ctx?: Fdc3Context, resultType?: string): Promise<AppIntent> {
    const agent = await this.agentPromise;
    return agent.findIntent(intent, ctx, resultType);
  }

  async findIntentsByContext(ctx: Fdc3Context, resultType?: string): Promise<AppIntent[]> {
    const agent = await this.agentPromise;
    return agent.findIntentsByContext(ctx, resultType);
  }

  // ─── Channels ────────────────────────────────────────────────────────────

  async joinUserChannel(channelId: string): Promise<void> {
    const agent = await this.agentPromise;
    await agent.joinUserChannel(channelId);
    const next = await agent.getCurrentChannel();
    this.zone.run(() => this.currentChannel.set(next));
  }

  async leaveCurrentChannel(): Promise<void> {
    const agent = await this.agentPromise;
    await agent.leaveCurrentChannel();
    this.zone.run(() => this.currentChannel.set(null));
  }

  async getOrCreateChannel(channelId: string): Promise<Channel> {
    const agent = await this.agentPromise;
    return agent.getOrCreateChannel(channelId);
  }

  async createPrivateChannel(): Promise<PrivateChannel> {
    const agent = await this.agentPromise;
    return agent.createPrivateChannel();
  }

  // ─── Theme ───────────────────────────────────────────────────────────────

  async getTheme(): Promise<ThemeName> {
    const agent = await this.agentPromise;
    return agent.getTheme();
  }

  async setTheme(theme: ThemeName): Promise<ThemeName> {
    const agent = await this.agentPromise;
    return agent.setTheme(theme);
  }

  /** Subscribe to theme changes. Returns an unsubscribe function. */
  async onThemeChanged(handler: (theme: ThemeName) => void): Promise<() => void> {
    const agent = await this.agentPromise;
    return agent.onThemeChanged((t) => this.zone.run(() => handler(t)));
  }

  // ─── App lifecycle ───────────────────────────────────────────────────────

  async open(appId: string, ctx?: Fdc3Context): Promise<void> {
    const agent = await this.agentPromise;
    await agent.open({ appId }, ctx);
  }

  async closeWindow(): Promise<boolean> {
    const agent = await this.agentPromise;
    return agent.closeWindow();
  }
}
