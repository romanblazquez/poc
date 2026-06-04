import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  InteropService,
  NoAppsFoundError,
  ResolveError,
} from '@fdc3-poc/interop-angular';
import type {
  AppIntent,
  Fdc3Context,
  InstrumentContext,
  PrivateChannel,
} from '@fdc3-poc/interop-angular';
import {
  InteropChannelPickerComponent,
  InteropEmptyStateComponent,
  InteropInstrumentTagComponent,
  InteropStatusBadgeComponent,
  InteropWorkstationHeaderComponent,
} from '@fdc3-poc/interop-angular/ui';
import {
  InteropInstrumentAutocompleteComponent,
  InteropOrderTicketComponent,
} from '@fdc3-poc/interop-angular/trader';
import type {
  InstrumentRecord,
  OrderTicketFormValue,
  OrderTicketSubmit,
} from '@fdc3-poc/interop-angular/trader';
import { InteropLogger } from '@fdc3-poc/interop-angular/logs';

interface TraderOrderContext extends Fdc3Context {
  type: 'com.demo.traderOrder';
  orderId: string;
  instrument: { ticker: string; ISIN?: string; name?: string };
  side: 'Buy' | 'Sell';
  orderType: 'Market' | 'Limit';
  quantity: number;
  limitPrice?: number;
  tif: string;
  venue: string;
  account: string;
  currency: string;
  notional?: number;
  status: 'New';
  createdAt: string;
}

interface ActivityEntry {
  ts: number;
  text: string;
  kind: 'info' | 'success' | 'warn' | 'danger';
}

/**
 * Cloud Trader — the proof-of-life app for `@fdc3-poc/interop-angular`.
 *
 * The component uses zero `window.fdc3` references and zero raw DOM listener
 * bookkeeping. Every interop touch goes through `InteropService`:
 *
 *  - Signals (`mode`, `info`, `currentChannel`) drive the header chrome.
 *  - `contexts$('fdc3.instrument')` pre-fills the order ticket.
 *  - `findIntentsByContext()` populates a dynamic action menu.
 *  - `raiseIntent('CreateOrder', …)` lets the user route a trade.
 *  - `broadcast(traderOrder)` emits the resulting order to the channel.
 *
 * Open this app inside the shell → mode = 'shell'. Open it in two plain
 * browser tabs → mode = 'browser-fallback' and the tabs talk via
 * BroadcastChannel. Identical source either way.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    InteropWorkstationHeaderComponent,
    InteropChannelPickerComponent,
    InteropStatusBadgeComponent,
    InteropInstrumentTagComponent,
    InteropEmptyStateComponent,
    InteropInstrumentAutocompleteComponent,
    InteropOrderTicketComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="workstation-app">
      <interop-workstation-header mark="CT" title="Cloud Trader">
        <span slot="title-after" class="muted">
          via &#64;fdc3-poc/interop-angular
        </span>
        <interop-status-badge [label]="modeLabel()" [severity]="modeSeverity()" />
        <interop-channel-picker />
      </interop-workstation-header>

      <div class="ws-content">
        <!-- Discovery + capability card -->
        <section class="card">
          <h3 class="card-title">Interop runtime</h3>
          <dl class="kv">
            <dt>Mode</dt> <dd>{{ modeLabel() }}</dd>
            <dt>Provider</dt> <dd>{{ info()?.provider ?? '—' }} / {{ info()?.providerVersion ?? '—' }}</dd>
            <dt>FDC3 version</dt> <dd>{{ info()?.fdc3Version ?? '—' }}</dd>
            <dt>App ID</dt> <dd>{{ info()?.appMetadata?.appId ?? '—' }}</dd>
            <dt>Instance</dt> <dd>{{ info()?.appMetadata?.instanceId ?? '—' }}</dd>
            <dt>Bridge ready</dt> <dd>{{ ready() ? 'yes' : 'pending…' }}</dd>
            <dt>platformLogs</dt> <dd>{{ logger.hasBridge ? 'shell bridge' : 'console fallback' }}</dd>
          </dl>
          <p class="hint">
            Inside the FDC3 Desktop shell the mode is <code>shell</code> and broadcasts
            reach every app on the same user channel. Open this URL in a plain browser
            tab and the mode becomes <code>browser-fallback</code> — open it in two tabs
            and they talk via <code>BroadcastChannel</code>. Same source, three runtimes.
          </p>
        </section>

        <!-- Instrument lookup + current instrument -->
        <section class="card">
          <h3 class="card-title">Instrument</h3>
          <interop-instrument-autocomplete (selected)="onInstrumentPicked($event)" />
          @if (currentInstrument(); as cur) {
            <div class="current">
              <interop-instrument-tag
                [ticker]="cur.ticker"
                [price]="cur.lastPrice ?? null" />
              <span class="muted">{{ cur.name }}</span>
              @if (availableActions().length > 0) {
                <span class="actions">
                  @for (ai of availableActions(); track ai.intent.name) {
                    <button class="chip" type="button" (click)="raiseAction(ai)">
                      {{ ai.intent.displayName ?? ai.intent.name }}
                    </button>
                  }
                </span>
              }
            </div>
          } @else {
            <p class="muted hint">Pick a ticker to populate the order ticket.</p>
          }
        </section>

        <!-- Order ticket -->
        <section class="card">
          <h3 class="card-title">Order ticket</h3>
          <interop-order-ticket
            #ticket
            [referencePrice]="currentInstrument()?.lastPrice ?? null"
            (submit)="onOrderSubmit($event)"
            (formChange)="onFormChange($event)" />
        </section>

        <!-- Live activity (proves the wiring) -->
        <section class="card activity">
          <h3 class="card-title">Activity</h3>
          @if (activity().length === 0) {
            <interop-empty-state mark="A" title="No activity yet"
              message="Pick a ticker and submit a buy or sell — every interop call lands here." />
          } @else {
            <ul class="log">
              @for (a of activity(); track a.ts) {
                <li class="entry">
                  <interop-status-badge [label]="a.kind" [severity]="badgeSeverity(a.kind)" />
                  <span class="entry-text">{{ a.text }}</span>
                  <span class="entry-ts">{{ a.ts | date:'HH:mm:ss' }}</span>
                </li>
              }
            </ul>
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; }
    .workstation-app { display: flex; flex-direction: column; height: 100%; }
    .ws-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      padding: 14px;
      overflow-y: auto;
      align-content: start;
    }
    @media (max-width: 980px) { .ws-content { grid-template-columns: 1fr; } }
    .activity { grid-column: 1 / -1; }
    .card {
      background: var(--ws-panel, rgba(255,255,255,0.02));
      border: 1px solid var(--ws-border, rgba(255,255,255,0.08));
      border-radius: 10px;
      padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .card-title {
      margin: 0;
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--ws-muted, #8d93b8); font-weight: 700;
    }
    .kv {
      display: grid;
      grid-template-columns: 140px 1fr;
      column-gap: 10px;
      row-gap: 4px;
      font-size: 12px;
      margin: 0;
    }
    .kv dt { color: var(--ws-muted, #8d93b8); }
    .kv dd { margin: 0; font-weight: 700; color: var(--ws-text, #e6e9ff); font-variant-numeric: tabular-nums; }
    .hint { font-size: 12px; color: var(--ws-muted, #8d93b8); line-height: 1.5; }
    .current { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
    .chip {
      padding: 3px 10px; font-size: 11px; border-radius: 999px;
      background: transparent; cursor: pointer;
      border: 1px solid var(--ws-border, rgba(255,255,255,0.12));
      color: var(--ws-text, #e6e9ff);
    }
    .chip:hover { background: rgba(255,255,255,0.06); }
    .muted { color: var(--ws-muted, #8d93b8); font-size: 12px; }
    .log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .entry {
      display: grid;
      grid-template-columns: 70px 1fr 80px;
      gap: 10px;
      align-items: center;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      background: rgba(255,255,255,0.02);
    }
    .entry-ts { color: var(--ws-muted, #8d93b8); text-align: right; font-variant-numeric: tabular-nums; }
  `],
})
export class AppComponent {
  private readonly interop = inject(InteropService);
  private readonly destroyRef = inject(DestroyRef);
  readonly logger = inject(InteropLogger);

  // Signals straight from the service — no manual state plumbing.
  readonly mode = this.interop.mode;
  readonly ready = this.interop.ready;
  readonly info = this.interop.info;

  readonly modeLabel = computed(() => {
    switch (this.mode()) {
      case 'shell': return 'Shell agent';
      case 'web-agent': return 'Web agent (getAgent)';
      case 'browser-fallback': return 'BroadcastChannel fallback';
      case 'noop': return 'No-op';
      case 'fail': return 'Failing';
      default: return this.mode();
    }
  });
  readonly modeSeverity = computed<'success' | 'warn' | 'danger' | 'muted'>(() => {
    switch (this.mode()) {
      case 'shell':
      case 'web-agent': return 'success';
      case 'browser-fallback': return 'warn';
      case 'fail': return 'danger';
      case 'noop':
      default: return 'muted';
    }
  });

  readonly currentInstrument = signal<InstrumentRecord | null>(null);
  readonly availableActions = signal<AppIntent[]>([]);
  readonly activity = signal<ActivityEntry[]>([]);

  constructor() {
    // Pre-fill the ticket whenever the shell broadcasts an instrument.
    this.interop
      .contexts$<InstrumentContext>('fdc3.instrument')
      .subscribe((ctx) => this.adoptInstrumentContext(ctx));

    // Log every order any other app broadcasts so the demo shows two-way wiring.
    this.interop
      .contexts$<TraderOrderContext>('com.demo.traderOrder')
      .subscribe((order) => this.pushActivity('info', `Saw order ${order.orderId}: ${order.side} ${order.quantity} ${order.instrument.ticker}`));
  }

  // ─── Instrument lookup → broadcast ─────────────────────────────────────

  async onInstrumentPicked(record: InstrumentRecord): Promise<void> {
    this.currentInstrument.set(record);
    await this.refreshActionsFor(record);
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: record.name,
      id: { ticker: record.ticker, ISIN: record.isin },
    };
    try {
      await this.interop.broadcast(ctx);
      this.pushActivity('success', `Broadcast fdc3.instrument → ${record.ticker}`);
      void this.logger.info('instrument-broadcast', { ticker: record.ticker });
    } catch (err) {
      this.pushActivity('danger', `Broadcast failed: ${(err as Error).message}`);
    }
  }

  private adoptInstrumentContext(ctx: InstrumentContext): void {
    const ticker = ctx.id?.['ticker'];
    if (!ticker) return;
    const r: InstrumentRecord = {
      ticker,
      name: ctx.name ?? ticker,
      isin: ctx.id?.['ISIN'],
    };
    this.currentInstrument.set(r);
    void this.refreshActionsFor(r);
    this.pushActivity('info', `Received fdc3.instrument ← ${ticker}`);
  }

  private async refreshActionsFor(record: InstrumentRecord): Promise<void> {
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: record.name,
      id: { ticker: record.ticker, ISIN: record.isin },
    };
    try {
      const intents = await this.interop.findIntentsByContext(ctx);
      this.availableActions.set(intents);
    } catch {
      // Browser-fallback mode has no directory → no actions. That's fine.
      this.availableActions.set([]);
    }
  }

  async raiseAction(ai: AppIntent): Promise<void> {
    const r = this.currentInstrument();
    if (!r) return;
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: r.name,
      id: { ticker: r.ticker, ISIN: r.isin },
    };
    this.pushActivity('info', `Raising ${ai.intent.name}…`);
    try {
      const res = await this.interop.raiseIntent(ai.intent.name, ctx);
      this.pushActivity('success', `${ai.intent.name} → ${res.source.appId}`);
      const channel = res.result as PrivateChannel | undefined;
      if (channel && (channel as PrivateChannel).type === 'private') {
        const listener = await channel.addContextListener('com.demo.orderStatus', (s) => {
          const status = (s as { status?: string }).status ?? 'update';
          this.pushActivity('info', `${ai.intent.name} stream → ${status}`);
        });
        // Auto-teardown when the component is destroyed.
        this.destroyRef.onDestroy(() => listener.unsubscribe());
      }
    } catch (err) {
      const code = (err as Error)?.message ?? String(err);
      const text =
        err instanceof NoAppsFoundError || code === ResolveError.NoAppsFound
          ? `No app handles ${ai.intent.name}`
          : code === ResolveError.UserCancelled
          ? `Resolver cancelled`
          : `${ai.intent.name} failed: ${code}`;
      this.pushActivity('warn', text);
    }
  }

  // ─── Ticket → broadcast ─────────────────────────────────────────────────

  async onOrderSubmit(value: OrderTicketSubmit): Promise<void> {
    const order: TraderOrderContext = {
      type: 'com.demo.traderOrder',
      orderId: `CT-${Date.now().toString(36).toUpperCase()}`,
      instrument: { ticker: value.ticker, ISIN: value.isin, name: value.instrumentName },
      side: value.side,
      orderType: value.orderType,
      quantity: value.quantity,
      limitPrice: value.limitPrice ?? undefined,
      tif: value.tif,
      venue: value.venue,
      account: value.account,
      currency: value.currency,
      notional: value.notional,
      status: 'New',
      createdAt: new Date().toISOString(),
      name: `${value.side} ${value.quantity} ${value.ticker}`,
    };
    try {
      await this.interop.broadcast(order);
      this.pushActivity('success', `Order broadcast: ${order.side} ${order.quantity} ${order.instrument.ticker}`);
      void this.logger.info('order-submit', order);
    } catch (err) {
      this.pushActivity('danger', `Order broadcast failed: ${(err as Error).message}`);
    }
  }

  onFormChange(_form: OrderTicketFormValue): void {
    // Hook for future analytics; intentionally a no-op today.
  }

  // ─── Activity log helpers ───────────────────────────────────────────────

  badgeSeverity(kind: ActivityEntry['kind']): 'success' | 'warn' | 'danger' | 'info' {
    return kind === 'success' ? 'success' : kind === 'warn' ? 'warn' : kind === 'danger' ? 'danger' : 'info';
  }

  private pushActivity(kind: ActivityEntry['kind'], text: string): void {
    this.activity.update((arr) => [{ ts: Date.now(), kind, text }, ...arr].slice(0, 40));
  }
}
