import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { ResolveError } from '@fdc3-poc/fdc3-core';
import type {
  InstrumentContext,
  OrderStatusContext,
  PrivateChannel,
  ThemeName,
} from '@fdc3-poc/fdc3-core';
import { getQuoteByTicker, MARKET_QUOTES } from '@fdc3-poc/shared-domain';
import type { MarketQuote } from '@fdc3-poc/shared-domain';

interface Tick {
  ts: number;
  price: number;
}

interface ChartView {
  pathLine: string;       // SVG polyline points
  pathFill: string;       // closed area under line
  width: number;
  height: number;
  min: number;
  max: number;
  /** Y-coordinate of the most recent price (for the live dot). */
  lastY: number;
  lastX: number;
  ticks: Tick[];
}

type RangeKey = '1m' | '5m' | '15m' | '1h';
const RANGE_MS: Record<RangeKey, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
};

const VIEWBOX_W = 800;
const VIEWBOX_H = 320;
const PAD_X = 8;
const PAD_TOP = 20;
const PAD_BOTTOM = 24;

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chart.component.html',
})
export class ChartComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  /** Current selected instrument. Null when nothing's broadcast yet. */
  instrument: { ticker: string; name: string; isin?: string; currency?: string } | null = null;
  range: RangeKey = '5m';
  readonly ranges: Array<{ label: RangeKey; value: RangeKey }> = (Object.keys(RANGE_MS) as RangeKey[]).map((k) => ({ label: k, value: k }));

  ticks: Tick[] = [];
  last: number = 0;
  open: number = 0;
  high: number = 0;
  low: number = 0;
  changeAbs: number = 0;
  changePct: number = 0;
  volume: number = 0;

  view: ChartView = { pathLine: '', pathFill: '', width: VIEWBOX_W, height: VIEWBOX_H, min: 0, max: 0, lastY: 0, lastX: 0, ticks: [] };
  recentFills: Array<{ ts: number; price: number; qty: number; side: 'Buy' | 'Sell' }> = [];
  tradeBanner: string | null = null;

  private tickTimer?: ReturnType<typeof setInterval>;
  private unsubInstrumentCtx?: () => void;
  private unsubViewChart?: () => void;
  private unsubOrderStatus?: () => void;
  activeOrderStream?: PrivateChannel;
  private activeOrderUnsub?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!window.fdc3) return;
    this.unsubInstrumentCtx = window.fdc3.addContextListener<InstrumentContext>(
      'fdc3.instrument',
      (ctx) => this.switchInstrument(ctx),
    );
    this.unsubViewChart = window.fdc3.addIntentListener('ViewChart', (raw) => {
      const ctx = raw as InstrumentContext | undefined;
      if (ctx?.id?.ticker) this.switchInstrument(ctx);
    });
    this.unsubOrderStatus = window.fdc3.addContextListener<OrderStatusContext>(
      'com.demo.orderStatus',
      (s) => this.recordFillFromStatus(s),
    );
    this.tickTimer = setInterval(() => this.advanceTick(), 800);
  }

  ngOnDestroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.unsubInstrumentCtx?.();
    this.unsubViewChart?.();
    this.unsubOrderStatus?.();
    this.activeOrderUnsub?.();
    if (this.activeOrderStream) {
      void this.activeOrderStream.disconnect().catch(() => undefined);
    }
  }

  setRange(value: RangeKey): void {
    this.range = value;
    this.recomputeView();
  }

  /**
   * Raise CreateOrder with the currently displayed instrument. The order-ticket
   * (or any other handler) opens; if it returns a PrivateChannel as the result,
   * we subscribe to it and pin live fills onto the chart.
   */
  async tradeThis(): Promise<void> {
    if (!this.instrument || !window.fdc3) return;
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: this.instrument.name,
      id: { ticker: this.instrument.ticker, ISIN: this.instrument.isin },
    };
    this.tradeBanner = 'Raising CreateOrder…';
    this.cdr.markForCheck();
    try {
      const resolution = await window.fdc3.raiseIntent('CreateOrder', ctx);
      this.tradeBanner = `Routed to ${resolution.source.appId}`;
      const result = resolution.result;
      if (result && typeof result === 'object' && (result as PrivateChannel).type === 'private') {
        await this.subscribeToOrderStream(result as PrivateChannel);
      }
    } catch (err) {
      const code = (err as Error)?.message ?? String(err);
      this.tradeBanner = code === ResolveError.NoAppsFound
        ? 'No app registered for CreateOrder'
        : code === ResolveError.UserCancelled
        ? 'Resolver cancelled'
        : `Error: ${code}`;
    } finally {
      setTimeout(() => { this.tradeBanner = null; this.cdr.markForCheck(); }, 3000);
      this.cdr.markForCheck();
    }
  }

  /** Mark a fill from any orderStatus broadcast on the channel (also catches PrivateChannel events
   *  because the order-ticket dual-broadcasts). */
  private recordFillFromStatus(s: OrderStatusContext): void {
    if (!s.filledQty || !s.lastPrice) return;
    if (!this.instrument) return;
    // Only show fills that look like they relate to our instrument — orderStatus
    // doesn't carry the ticker, so we use a soft heuristic: price near current.
    if (Math.abs(s.lastPrice - this.last) / Math.max(this.last, 1) > 0.2) return;
    this.recentFills = [{ ts: Date.parse(s.ts), price: s.lastPrice, qty: s.lastQty ?? s.filledQty, side: 'Buy' as const }, ...this.recentFills].slice(0, 10);
    this.cdr.markForCheck();
  }

  private async subscribeToOrderStream(stream: PrivateChannel): Promise<void> {
    // Unsubscribe from any previous stream first.
    this.activeOrderUnsub?.();
    if (this.activeOrderStream) {
      try { await this.activeOrderStream.disconnect(); } catch { /* noop */ }
    }
    this.activeOrderStream = stream;
    const listener = await stream.addContextListener<OrderStatusContext>('com.demo.orderStatus', (s) => {
      if (s.lastPrice && s.lastQty) {
        this.recentFills = [
          { ts: Date.parse(s.ts), price: s.lastPrice, qty: s.lastQty, side: 'Buy' as const },
          ...this.recentFills,
        ].slice(0, 10);
        this.cdr.markForCheck();
      }
    });
    this.activeOrderUnsub = (): void => listener.unsubscribe();
    stream.onDisconnect(() => {
      this.activeOrderUnsub?.();
      this.activeOrderStream = undefined;
      this.cdr.markForCheck();
    });
  }

  // ─── Instrument + tick model ─────────────────────────────────────────────

  private switchInstrument(ctx: InstrumentContext): void {
    const ticker = ctx.id?.ticker;
    if (!ticker) return;
    const quote: MarketQuote | undefined = getQuoteByTicker(ticker) ?? MARKET_QUOTES.find((q) => q.name === ctx.name);
    const seedPrice = quote?.price ?? 100;

    this.instrument = {
      ticker,
      name: ctx.name ?? quote?.name ?? ticker,
      isin: ctx.id?.ISIN ?? quote?.isin,
      currency: quote?.currency ?? 'USD',
    };
    this.recentFills = [];
    this.last = seedPrice;
    this.open = seedPrice;
    this.high = seedPrice;
    this.low = seedPrice;
    this.changeAbs = 0;
    this.changePct = 0;
    this.volume = quote?.volume ?? 0;
    // Seed back-history so the chart isn't empty on first render.
    const now = Date.now();
    const seed: Tick[] = [];
    let p = seedPrice;
    for (let i = 90; i >= 0; i--) {
      const jitter = (Math.random() - 0.5) * seedPrice * 0.0025;
      p = Math.max(p + jitter, 0.01);
      seed.push({ ts: now - i * 800, price: +p.toFixed(2) });
    }
    this.ticks = seed;
    this.recomputeStats();
    this.recomputeView();
  }

  private advanceTick(): void {
    if (!this.instrument) return;
    const delta = (Math.random() - 0.5) * this.last * 0.0025;
    const next = +Math.max(this.last + delta, 0.01).toFixed(2);
    this.ticks = [...this.ticks, { ts: Date.now(), price: next }].slice(-600);
    this.last = next;
    this.recomputeStats();
    this.recomputeView();
  }

  private recomputeStats(): void {
    if (this.ticks.length === 0) return;
    const prices = this.ticks.map((t) => t.price);
    this.high = Math.max(...prices);
    this.low = Math.min(...prices);
    this.open = this.ticks[0].price;
    this.changeAbs = +(this.last - this.open).toFixed(2);
    this.changePct = +((this.changeAbs / this.open) * 100).toFixed(2);
  }

  private recomputeView(): void {
    const cutoff = Date.now() - RANGE_MS[this.range];
    const visible = this.ticks.filter((t) => t.ts >= cutoff);
    const list = visible.length > 1 ? visible : this.ticks.slice(-2);
    if (list.length < 2) return;
    const prices = list.map((t) => t.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = Math.max(max - min, 0.0001);
    const w = VIEWBOX_W - PAD_X * 2;
    const h = VIEWBOX_H - PAD_TOP - PAD_BOTTOM;
    const span = list[list.length - 1].ts - list[0].ts || 1;

    let pathLine = '';
    let pathFill = '';
    let lastX = 0;
    let lastY = 0;
    list.forEach((t, i) => {
      const x = PAD_X + ((t.ts - list[0].ts) / span) * w;
      const y = PAD_TOP + (1 - (t.price - min) / range) * h;
      pathLine += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
      if (i === 0) pathFill += `M${x.toFixed(2)},${(PAD_TOP + h).toFixed(2)} L${x.toFixed(2)},${y.toFixed(2)} `;
      else pathFill += `L${x.toFixed(2)},${y.toFixed(2)} `;
      lastX = x;
      lastY = y;
    });
    pathFill += `L${lastX.toFixed(2)},${(PAD_TOP + h).toFixed(2)} Z`;

    this.view = { pathLine, pathFill, width: VIEWBOX_W, height: VIEWBOX_H, min, max, lastX, lastY, ticks: list };
    this.cdr.markForCheck();
  }

  /** Y coordinate for a price within the current view (used for fill markers). */
  yFor(price: number): number {
    const range = Math.max(this.view.max - this.view.min, 0.0001);
    const h = VIEWBOX_H - PAD_TOP - PAD_BOTTOM;
    return PAD_TOP + (1 - (price - this.view.min) / range) * h;
  }

  trackByTick(_i: number, t: Tick): number {
    return t.ts;
  }

  trackByFill(_i: number, f: { ts: number }): number {
    return f.ts;
  }
}
