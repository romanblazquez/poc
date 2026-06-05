import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InteropService } from '@fdc3-poc/interop-angular';
import type {
  ComplianceVerdict,
  ComplianceVerdictContext,
  TraderOrderContext,
} from '@fdc3-poc/interop-angular';
import { InteropLogger } from '@fdc3-poc/interop-angular/logs';
import {
  InteropChannelPickerComponent,
  InteropEmptyStateComponent,
  InteropStatusBadgeComponent,
  InteropWorkstationHeaderComponent,
} from '@fdc3-poc/interop-angular/ui';
import { DEFAULT_POLICY, evaluateOrder } from './compliance-rules';
import type { CompliancePolicy, OrderEvaluation } from './compliance-rules';

interface DecisionEntry {
  ts: number;
  orderId: string;
  ticker: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  currency: string;
  notional: number;
  verdict: ComplianceVerdict;
  reasons: string[];
  source: 'broadcast' | 'intent';
}

const HISTORY_LIMIT = 30;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    InteropChannelPickerComponent,
    InteropEmptyStateComponent,
    InteropStatusBadgeComponent,
    InteropWorkstationHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="workstation-app">
      <interop-workstation-header mark="CC" title="Compliance Check">
        <interop-status-badge label="Pre-trade gate" severity="info" />
        <interop-status-badge *ngIf="interop.ready()" [label]="modeLabel()" severity="success" />
        <interop-channel-picker />
      </interop-workstation-header>

      <div class="ws-content">
        <!-- Summary ribbon -->
        <section class="card ribbon">
          <div class="kpi">
            <span class="label">Approved today</span>
            <span class="value good">{{ approvedCount() }}</span>
          </div>
          <div class="kpi">
            <span class="label">Review</span>
            <span class="value warn">{{ reviewCount() }}</span>
          </div>
          <div class="kpi">
            <span class="label">Blocked</span>
            <span class="value bad">{{ blockedCount() }}</span>
          </div>
          <div class="kpi big">
            <span class="label">Last decision</span>
            <span class="value">
              <interop-status-badge *ngIf="lastDecision() as d"
                                    [label]="d.verdict | uppercase"
                                    [severity]="badgeFor(d.verdict)" />
              <span *ngIf="lastDecision() as d" class="last-detail">
                {{ d.ticker }} · {{ d.side }} {{ d.quantity | number }} ·
                {{ d.currency }} {{ d.notional | number:'1.0-0' }}
              </span>
            </span>
          </div>
        </section>

        <!-- Policy editor -->
        <section class="card">
          <div class="card-title">Policy</div>
          <div class="policy">
            <label>
              <span class="lbl">Review &gt;</span>
              <input class="input" type="number" min="0" step="100000"
                     [(ngModel)]="reviewCap" (ngModelChange)="onPolicyChange()" />
            </label>
            <label>
              <span class="lbl">Block &gt;</span>
              <input class="input" type="number" min="0" step="100000"
                     [(ngModel)]="hardCap" (ngModelChange)="onPolicyChange()" />
            </label>
            <label>
              <span class="lbl">Collar %</span>
              <input class="input" type="number" min="0" step="0.5" max="50"
                     [(ngModel)]="collarPct" (ngModelChange)="onPolicyChange()" />
            </label>
            <label class="wide">
              <span class="lbl">Restricted tickers (comma-separated)</span>
              <input class="input" type="text"
                     [(ngModel)]="restrictedRaw" (ngModelChange)="onPolicyChange()" />
            </label>
          </div>
          <div class="policy-hint">
            Orders broadcast on the user channel are scored passively.
            Apps can also raise <code>ValidateOrder</code> with a
            <code>com.demo.traderOrder</code> context to get a synchronous verdict.
          </div>
        </section>

        <!-- Decision log -->
        <section class="card">
          <div class="card-title-row">
            <div class="card-title">Recent decisions</div>
            <button *ngIf="decisions().length > 0" type="button" class="link" (click)="clearLog()">
              Clear log
            </button>
          </div>
          @if (decisions().length === 0) {
            <interop-empty-state mark="CC" title="No orders scored yet"
              message="Submit a buy or sell from the Order Ticket on this channel — every order broadcast lands here." />
          } @else {
            <ul class="log">
              @for (d of decisions(); track d.ts) {
                <li class="entry" [attr.data-verdict]="d.verdict">
                  <interop-status-badge [label]="d.verdict | uppercase" [severity]="badgeFor(d.verdict)" />
                  <span class="entry-main">
                    <strong>{{ d.ticker }}</strong>
                    <span class="side" [class.buy]="d.side === 'Buy'" [class.sell]="d.side === 'Sell'">{{ d.side }}</span>
                    {{ d.quantity | number }} · {{ d.currency }} {{ d.notional | number:'1.0-0' }}
                    <span class="src">{{ d.source }}</span>
                  </span>
                  <span class="entry-reasons">
                    @for (r of d.reasons; track r) { <span class="reason">{{ r }}</span> }
                  </span>
                  <span class="entry-ts">{{ d.ts | date:'HH:mm:ss' }}</span>
                </li>
              }
            </ul>
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .workstation-app { display: flex; flex-direction: column; height: 100%; }
    .ws-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      overflow-y: auto;
    }
    .card {
      background: var(--ws-panel, rgba(255,255,255,0.02));
      border: 1px solid var(--ws-border, rgba(255,255,255,0.08));
      border-radius: 10px;
      padding: 14px;
    }
    .card-title {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--ws-muted, #8d93b8); font-weight: 700;
      margin-bottom: 10px;
    }
    .card-title-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px;
    }
    .card-title-row .card-title { margin-bottom: 0; }
    .ribbon {
      display: grid;
      grid-template-columns: repeat(3, minmax(120px, 1fr)) 2fr;
      gap: 14px;
      align-items: center;
    }
    .kpi { display: flex; flex-direction: column; gap: 4px; }
    .kpi.big { gap: 8px; }
    .kpi .label {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--ws-muted, #8d93b8); font-weight: 700;
    }
    .kpi .value {
      font-size: 20px; font-weight: 900;
      color: var(--ws-text, #e6e9ff);
      font-variant-numeric: tabular-nums;
      display: flex; align-items: center; gap: 10px;
    }
    .kpi .value.good { color: var(--ws-positive, #0f8a4b); }
    .kpi .value.warn { color: #e8b440; }
    .kpi .value.bad  { color: var(--ws-negative, #b42318); }
    .last-detail {
      font-size: 13px; font-weight: 600;
      color: var(--ws-muted, #8d93b8);
    }
    .policy {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px 14px;
    }
    .policy .wide { grid-column: 1 / -1; }
    .policy label { display: flex; flex-direction: column; gap: 3px; }
    .policy .lbl {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--ws-muted, #8d93b8); font-weight: 700;
    }
    .input {
      padding: 6px 9px; font-size: 13px;
      background: var(--ws-panel-2, rgba(255,255,255,0.04));
      border: 1px solid var(--ws-border, rgba(255,255,255,0.12));
      border-radius: 6px;
      color: var(--ws-text, #e6e9ff);
      outline: none;
    }
    .input:focus { border-color: var(--ws-accent, #4080e8); }
    .policy-hint {
      margin-top: 10px;
      font-size: 11px;
      color: var(--ws-muted, #8d93b8);
      line-height: 1.5;
    }
    .log { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
    .entry {
      display: grid;
      grid-template-columns: 100px 2fr 3fr 80px;
      gap: 10px;
      align-items: center;
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(255,255,255,0.02);
      font-size: 12px;
    }
    .entry[data-verdict="review"]  { background: rgba(232, 192, 64, 0.07); }
    .entry[data-verdict="blocked"] { background: rgba(232, 64, 64, 0.07); }
    .entry-main { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .side.buy  { color: var(--ws-positive, #0f8a4b); font-weight: 700; }
    .side.sell { color: var(--ws-negative, #b42318); font-weight: 700; }
    .src {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--ws-muted, #8d93b8); margin-left: auto;
    }
    .entry-reasons { display: flex; flex-direction: column; gap: 2px; }
    .reason {
      font-size: 11px;
      color: var(--ws-muted, #8d93b8);
      line-height: 1.4;
    }
    .entry-ts {
      color: var(--ws-muted, #8d93b8);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .link {
      background: transparent; border: 0; cursor: pointer;
      color: var(--ws-muted, #8d93b8); font-size: 11px;
      text-decoration: underline; text-underline-offset: 3px;
    }
    .link:hover { color: var(--ws-text, #e6e9ff); }
  `],
})
export class AppComponent {
  protected readonly interop = inject(InteropService);
  private readonly logger = inject(InteropLogger);
  private readonly destroyRef = inject(DestroyRef);

  // Policy form state (bound to <input> via ngModel)
  reviewCap = DEFAULT_POLICY.reviewNotionalCap;
  hardCap = DEFAULT_POLICY.hardNotionalCap;
  collarPct = DEFAULT_POLICY.priceCollar * 100;
  restrictedRaw = '';

  private policy: CompliancePolicy = { ...DEFAULT_POLICY };
  readonly decisions = signal<DecisionEntry[]>([]);
  readonly lastDecision = computed(() => this.decisions()[0] ?? null);
  readonly approvedCount = computed(() => this.decisions().filter((d) => d.verdict === 'approved').length);
  readonly reviewCount = computed(() => this.decisions().filter((d) => d.verdict === 'review').length);
  readonly blockedCount = computed(() => this.decisions().filter((d) => d.verdict === 'blocked').length);
  readonly modeLabel = computed(() =>
    this.interop.mode() === 'shell' ? 'Shell agent'
    : this.interop.mode() === 'web-agent' ? 'Web agent'
    : this.interop.mode() === 'browser-fallback' ? 'Browser fallback'
    : this.interop.mode(),
  );

  constructor() {
    // Passive monitor: every traderOrder broadcast on the channel is scored
    // and recorded. We do NOT re-broadcast a verdict to avoid feedback loops.
    this.interop
      .contexts$<TraderOrderContext>('com.demo.traderOrder')
      .subscribe((order) => this.handleBroadcast(order));

    // Synchronous gate: any app that wants a pre-trade verdict raises
    // ValidateOrder with the TraderOrderContext. We complete the intent with
    // a ComplianceVerdictContext so the caller can branch on it.
    this.interop
      .intents$<TraderOrderContext>('ValidateOrder')
      .subscribe(({ context, meta }) => this.handleIntent(context, meta?.requestId));
  }

  badgeFor(verdict: ComplianceVerdict): 'success' | 'warn' | 'danger' {
    return verdict === 'approved' ? 'success' : verdict === 'review' ? 'warn' : 'danger';
  }

  clearLog(): void {
    this.decisions.set([]);
  }

  onPolicyChange(): void {
    const restricted = new Set(
      this.restrictedRaw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0),
    );
    const collar = Math.max(0, Number(this.collarPct) || 0) / 100;
    this.policy = {
      reviewNotionalCap: Math.max(0, Number(this.reviewCap) || 0),
      hardNotionalCap: Math.max(0, Number(this.hardCap) || 0),
      restrictedTickers: restricted,
      priceCollar: collar,
    };
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  private handleBroadcast(order: TraderOrderContext): void {
    const ev = evaluateOrder(order, this.policy);
    this.recordDecision(order, ev, 'broadcast');
    if (ev.verdict !== 'approved') {
      void this.logger.warn(
        `compliance:${ev.verdict}`,
        { orderId: order.orderId, ticker: order.instrument.ticker, reasons: ev.outcomes.map((o) => o.reason) },
      );
    }
  }

  private async handleIntent(order: TraderOrderContext | undefined, requestId: string | undefined): Promise<void> {
    if (!order) return;
    const ev = evaluateOrder(order, this.policy);
    this.recordDecision(order, ev, 'intent');
    if (!requestId) return;
    const verdict: ComplianceVerdictContext = {
      type: 'com.demo.complianceVerdict',
      name: `${ev.verdict.toUpperCase()} ${order.orderId}`,
      orderId: order.orderId,
      ticker: order.instrument.ticker,
      side: order.side,
      quantity: order.quantity,
      notional: ev.notional,
      currency: order.currency,
      verdict: ev.verdict,
      reasons: ev.outcomes.map((o) => `${o.rule}: ${o.reason}`),
      ts: new Date().toISOString(),
    };
    try {
      await this.interop.completeIntent(requestId, verdict);
    } catch (err) {
      void this.logger.error('compliance:completeIntent-failed', err);
    }
  }

  private recordDecision(order: TraderOrderContext, ev: OrderEvaluation, source: DecisionEntry['source']): void {
    const entry: DecisionEntry = {
      ts: Date.now(),
      orderId: order.orderId,
      ticker: order.instrument.ticker,
      side: order.side,
      quantity: order.quantity,
      currency: order.currency,
      notional: ev.notional,
      verdict: ev.verdict,
      reasons: ev.outcomes.map((o) => `${o.rule}: ${o.reason}`),
      source,
    };
    this.decisions.update((arr) => [entry, ...arr].slice(0, HISTORY_LIMIT));
    // destroyRef just keeps the lint happy that we use it; the auto-teardown
    // already covered the contexts$/intents$ subscriptions.
    void this.destroyRef;
  }
}
