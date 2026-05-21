import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import type {
  InstrumentContext,
  PrivateChannel,
  ThemeName,
  TraderOrderContext,
} from '@fdc3-poc/fdc3-core';
import { getQuoteByTicker } from '@fdc3-poc/shared-domain';

type Side = 'Buy' | 'Sell';
type QuoteStatus = 'Pending' | 'Live' | 'Accepted' | 'Rejected' | 'Expired';

interface VenueQuote {
  venue: string;
  price: number;          // bid for Sell-side RFQ, ask for Buy-side RFQ
  quotedQty: number;      // some venues won't fill the full size
  receivedAt: number;
  expiresAt: number;      // ms epoch
  status: QuoteStatus;
  rejectionReason?: string;
}

interface RfqSession {
  rfqId: string;
  ticker: string;
  instrumentName: string;
  isin?: string;
  side: Side;
  quantity: number;
  currency: string;
  startedAt: number;
}

const VENUES = ['Citadel', 'Virtu', 'Jane Street', 'Optiver', 'XTX'];
const QUOTE_TTL_MS = 12_000;
const POLL_MS = 500;

@Component({
  selector: 'app-rfq-quote',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, SelectButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rfq-quote.component.html',
})
export class RfqQuoteComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  // Form
  ticker = '';
  instrumentName = '';
  isin = '';
  currency = 'USD';
  side: Side = 'Buy';
  quantity = 5000;
  readonly sides: Array<{ label: Side; value: Side }> = [
    { label: 'Buy', value: 'Buy' },
    { label: 'Sell', value: 'Sell' },
  ];
  readonly quickQty = [1000, 5000, 10000, 25000];

  // Session
  session: RfqSession | null = null;
  quotes: VenueQuote[] = [];
  banner: string | null = null;
  history: Array<{ rfqId: string; side: Side; ticker: string; outcome: 'Filled' | 'Rejected' | 'Expired'; venue?: string; price?: number; ts: number }> = [];

  private unsubInstrumentCtx?: () => void;
  private rfqResponseChannel?: PrivateChannel;
  private rfqResponseUnsub?: () => void;
  private quoteTimers: ReturnType<typeof setTimeout>[] = [];
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!window.fdc3) return;
    this.unsubInstrumentCtx = window.fdc3.addContextListener<InstrumentContext>(
      'fdc3.instrument',
      (ctx) => this.applyInstrument(ctx),
    );
    // 500ms tick to update countdown UI + expire stale quotes
    this.pollTimer = setInterval(() => this.tickCountdowns(), POLL_MS);
  }

  ngOnDestroy(): void {
    this.unsubInstrumentCtx?.();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.disposeSession();
  }

  // ─── Form helpers ─────────────────────────────────────────────────────────

  get canRequest(): boolean {
    return !!this.ticker && this.quantity > 0 && !this.session;
  }

  setQuickQty(qty: number): void { this.quantity = qty; }

  get bestQuote(): VenueQuote | null {
    const live = this.quotes.filter((q) => q.status === 'Live');
    if (live.length === 0) return null;
    // For Buy: lowest ask wins. For Sell: highest bid wins.
    return live.reduce((best, q) =>
      this.session?.side === 'Buy'
        ? q.price < best.price ? q : best
        : q.price > best.price ? q : best,
    );
  }

  countdownPct(q: VenueQuote): number {
    if (q.status !== 'Live') return 0;
    const total = QUOTE_TTL_MS;
    const left = Math.max(q.expiresAt - Date.now(), 0);
    return Math.round((left / total) * 100);
  }

  countdownSec(q: VenueQuote): number {
    return Math.max(Math.ceil((q.expiresAt - Date.now()) / 1000), 0);
  }

  quoteSeverity(q: VenueQuote): 'success' | 'warn' | 'danger' | 'info' {
    if (q.status === 'Accepted') return 'success';
    if (q.status === 'Rejected' || q.status === 'Expired') return 'danger';
    if (q.status === 'Live') return 'warn';
    return 'info';
  }

  isBestQuote(q: VenueQuote): boolean {
    const best = this.bestQuote;
    return !!best && best.venue === q.venue && q.status === 'Live';
  }

  trackByVenue(_i: number, q: VenueQuote): string {
    return q.venue;
  }

  trackByHist(_i: number, h: { rfqId: string }): string {
    return h.rfqId;
  }

  // ─── RFQ lifecycle ────────────────────────────────────────────────────────

  /** Kick off a new RFQ session — opens a PrivateChannel that "venue" timers publish back on. */
  async requestQuotes(): Promise<void> {
    if (!this.canRequest || !window.fdc3) return;
    const quote = getQuoteByTicker(this.ticker);
    const reference = quote?.price ?? 100;

    const rfqId = `RFQ-${Date.now().toString(36).toUpperCase()}`;
    this.session = {
      rfqId,
      ticker: this.ticker,
      instrumentName: this.instrumentName || quote?.name || this.ticker,
      isin: this.isin || quote?.isin,
      side: this.side,
      quantity: this.quantity,
      currency: this.currency,
      startedAt: Date.now(),
    };

    // Pre-populate pending rows for every venue so the UI shows the line-up
    // instantly; each venue then fills in its real quote when the timer fires.
    this.quotes = VENUES.map((venue) => ({
      venue,
      price: 0,
      quotedQty: 0,
      receivedAt: 0,
      expiresAt: 0,
      status: 'Pending' as const,
    }));
    this.banner = `Requesting quotes from ${VENUES.length} venues`;
    this.cdr.markForCheck();

    // Open a PrivateChannel for the responses. Even though the venue stubs live
    // in this same process, going through a Channel proves the round-trip and
    // means a real venue app could be wired in tomorrow with no code changes.
    this.rfqResponseChannel = await window.fdc3.createPrivateChannel();
    const responseListener = await this.rfqResponseChannel.addContextListener<VenueQuoteContext>(
      'com.demo.rfqResponse',
      (resp) => this.onVenueQuote(resp),
    );
    this.rfqResponseUnsub = (): void => responseListener.unsubscribe();
    this.rfqResponseChannel.onDisconnect(() => {
      this.rfqResponseUnsub?.();
      this.rfqResponseChannel = undefined;
    });

    // Schedule simulated venue responses — staggered, with realistic spreads.
    VENUES.forEach((venue, idx) => {
      const lag = 150 + Math.round(Math.random() * 700) + idx * 80;
      const t = setTimeout(() => this.simulateVenueResponse(venue, reference, rfqId), lag);
      this.quoteTimers.push(t);
    });
  }

  /** Accept one venue's quote → broadcast a TraderOrderContext so the blotter prints it. */
  async accept(q: VenueQuote): Promise<void> {
    if (!this.session || q.status !== 'Live' || !window.fdc3) return;
    const sess = this.session;
    q.status = 'Accepted';
    // Mark every other quote as Rejected.
    for (const other of this.quotes) {
      if (other.venue !== q.venue && other.status === 'Live') {
        other.status = 'Rejected';
        other.rejectionReason = 'Lost RFQ';
      }
    }

    const ord: TraderOrderContext = {
      type: 'com.demo.traderOrder',
      orderId: `ORD-${sess.rfqId}`,
      instrument: { ticker: sess.ticker, ISIN: sess.isin, name: sess.instrumentName },
      side: sess.side,
      orderType: 'Limit',
      quantity: Math.min(q.quotedQty, sess.quantity),
      limitPrice: q.price,
      tif: 'IOC',
      venue: q.venue,
      account: 'DESK-PROP',
      currency: sess.currency,
      notional: q.price * Math.min(q.quotedQty, sess.quantity),
      status: 'Filled',
      createdAt: new Date().toISOString(),
      name: `${sess.side} ${sess.quantity} ${sess.ticker} @ ${q.price.toFixed(2)} (${q.venue})`,
    };
    await window.fdc3.broadcast(ord);

    this.history = [{
      rfqId: sess.rfqId,
      side: sess.side,
      ticker: sess.ticker,
      outcome: 'Filled' as const,
      venue: q.venue,
      price: q.price,
      ts: Date.now(),
    }, ...this.history].slice(0, 8);

    this.banner = `Accepted ${q.venue} @ ${q.price.toFixed(2)} — order routed`;
    this.cdr.markForCheck();
    setTimeout(() => this.finaliseSession(), 1500);
  }

  rejectAll(): void {
    if (!this.session) return;
    for (const q of this.quotes) {
      if (q.status === 'Live') {
        q.status = 'Rejected';
        q.rejectionReason = 'User declined';
      }
    }
    this.history = [{
      rfqId: this.session.rfqId,
      side: this.session.side,
      ticker: this.session.ticker,
      outcome: 'Rejected' as const,
      ts: Date.now(),
    }, ...this.history].slice(0, 8);
    this.banner = 'RFQ rejected — all venues declined';
    this.cdr.markForCheck();
    setTimeout(() => this.finaliseSession(), 1200);
  }

  // ─── Internal: simulated venue + countdown ────────────────────────────────

  private simulateVenueResponse(venue: string, reference: number, rfqId: string): void {
    if (!this.session || this.session.rfqId !== rfqId) return;
    if (!this.rfqResponseChannel) return;

    // 12% chance a venue passes on the RFQ entirely.
    if (Math.random() < 0.12) {
      this.applyVenueUpdate(venue, { status: 'Rejected', rejectionReason: 'No axe' });
      return;
    }

    // Spread modelling: Buy → slightly above reference (ask), Sell → slightly below (bid).
    // Each venue has its own bias to make winners non-deterministic.
    const venueBias = (VENUES.indexOf(venue) - 2) * 0.0006;
    const noise = (Math.random() - 0.5) * 0.0015;
    const skew = this.session.side === 'Buy' ? 0.0008 : -0.0008;
    const price = +(reference * (1 + venueBias + noise + skew)).toFixed(2);
    const fullSize = Math.random() < 0.65;
    const quotedQty = fullSize ? this.session.quantity : Math.round(this.session.quantity * (0.4 + Math.random() * 0.4));

    const resp: VenueQuoteContext = {
      type: 'com.demo.rfqResponse',
      rfqId,
      venue,
      price,
      quotedQty,
      expiresAt: Date.now() + QUOTE_TTL_MS,
    };
    // Push through the PrivateChannel — exercises the broadcast→subscriber loop.
    void this.rfqResponseChannel.broadcast(resp).catch((e) => console.warn('[rfq] channel broadcast failed', e));
  }

  private onVenueQuote(resp: VenueQuoteContext): void {
    if (!this.session || this.session.rfqId !== resp.rfqId) return;
    this.applyVenueUpdate(resp.venue, {
      price: resp.price,
      quotedQty: resp.quotedQty,
      receivedAt: Date.now(),
      expiresAt: resp.expiresAt,
      status: 'Live',
    });
  }

  private applyVenueUpdate(venue: string, patch: Partial<VenueQuote>): void {
    this.quotes = this.quotes.map((q) => (q.venue === venue ? { ...q, ...patch } : q));
    this.cdr.markForCheck();
  }

  private tickCountdowns(): void {
    if (!this.session) return;
    const now = Date.now();
    let mutated = false;
    this.quotes = this.quotes.map((q) => {
      if (q.status === 'Live' && q.expiresAt && q.expiresAt <= now) {
        mutated = true;
        return { ...q, status: 'Expired' as QuoteStatus };
      }
      return q;
    });
    if (mutated) {
      // If every quote is now in a terminal state, close the session.
      const stillLive = this.quotes.some((q) => q.status === 'Live' || q.status === 'Pending');
      if (!stillLive) {
        this.history = [{
          rfqId: this.session.rfqId,
          side: this.session.side,
          ticker: this.session.ticker,
          outcome: 'Expired' as const,
          ts: Date.now(),
        }, ...this.history].slice(0, 8);
        this.banner = 'All quotes expired';
        setTimeout(() => this.finaliseSession(), 1500);
      }
      this.cdr.markForCheck();
    } else {
      // Even without status changes we want the displayed seconds-left to refresh.
      this.cdr.markForCheck();
    }
  }

  private async finaliseSession(): Promise<void> {
    this.disposeSession();
    this.banner = null;
    this.cdr.markForCheck();
  }

  private disposeSession(): void {
    for (const t of this.quoteTimers) clearTimeout(t);
    this.quoteTimers = [];
    this.rfqResponseUnsub?.();
    if (this.rfqResponseChannel) {
      void this.rfqResponseChannel.disconnect().catch(() => undefined);
      this.rfqResponseChannel = undefined;
    }
    this.session = null;
    this.quotes = [];
  }

  // ─── Instrument context handling ──────────────────────────────────────────

  private applyInstrument(ctx: InstrumentContext): void {
    if (!ctx?.id?.ticker) return;
    const quote = getQuoteByTicker(ctx.id.ticker);
    this.ticker = ctx.id.ticker;
    this.instrumentName = ctx.name ?? quote?.name ?? ctx.id.ticker;
    this.isin = ctx.id.ISIN ?? quote?.isin ?? '';
    this.currency = quote?.currency ?? this.currency;
    this.cdr.markForCheck();
  }
}

/** Internal IPC-shaped context — kept inside this app since the rest of the
 *  desktop has no reason to know about RFQ responses. */
interface VenueQuoteContext {
  type: 'com.demo.rfqResponse';
  rfqId: string;
  venue: string;
  price: number;
  quotedQty: number;
  expiresAt: number;
  [k: string]: unknown;
}
