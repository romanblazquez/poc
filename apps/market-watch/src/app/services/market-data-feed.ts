import { MARKET_QUOTES } from '@fdc3-poc/shared-domain';
import type { MarketQuote } from '@fdc3-poc/shared-domain';

/**
 * Live shape used by the market-watch grid. Extends the static MarketQuote with
 * synthetic bid/ask, a small price history for the sparkline, and the original
 * session-open price so we can render P&L vs. open.
 */
export interface MarketRow extends MarketQuote {
  bid: number;
  ask: number;
  open: number;
  history: number[];
  /** Direction of the last tick — used for color cues without referring to AG Grid state. */
  lastDir: 'up' | 'down' | 'flat';
}

const HISTORY_DEPTH = 32;
const HALF_SPREAD_BPS = 4;   // ≈ 4 bps half-spread (cheap symbols spread proportionally).
const TICK_VOL_BPS = 25;     // 25 bps stdev-ish per tick.

export type MarketFeedListener = (rows: MarketRow[]) => void;

/**
 * Source-agnostic market-data feed. The only implementation today is a
 * deterministic-ish random walk seeded from `MARKET_QUOTES`. Tomorrow this
 * class can be swapped for a WebSocket / FIX feed without touching the
 * component — the public surface (`start`, `stop`, `getRows`, `subscribe`)
 * is intentionally tiny.
 */
export class MarketDataFeed {
  private rows: MarketRow[];
  private timer?: ReturnType<typeof setInterval>;
  private readonly listeners = new Set<MarketFeedListener>();

  constructor(intervalMs = 1100) {
    this.rows = MARKET_QUOTES.map((q) => MarketDataFeed.seedRow(q));
    this.intervalMs = intervalMs;
  }

  private readonly intervalMs: number;

  /** Snapshot of the current rows (mutation-safe — returns the same array). */
  getRows(): MarketRow[] { return this.rows; }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tickAll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Subscribe to tick events. Returns an unsubscribe fn. */
  subscribe(listener: MarketFeedListener): () => void {
    this.listeners.add(listener);
    return (): void => { this.listeners.delete(listener); };
  }

  private tickAll(): void {
    this.rows = this.rows.map((r) => this.tickRow(r));
    for (const l of this.listeners) {
      try { l(this.rows); } catch (e) { console.error('[market-feed] listener threw', e); }
    }
  }

  private tickRow(r: MarketRow): MarketRow {
    const drift = (Math.random() - 0.5) * (r.price * TICK_VOL_BPS / 10_000);
    const next = Math.max(+(r.price + drift).toFixed(4), 0.01);
    const halfSpread = +(next * HALF_SPREAD_BPS / 10_000).toFixed(4);
    const change = +(next - r.open).toFixed(4);
    const changePct = +((change / r.open) * 100).toFixed(4);
    const dir: 'up' | 'down' | 'flat' = next > r.price ? 'up' : next < r.price ? 'down' : 'flat';
    const history = [...r.history, next].slice(-HISTORY_DEPTH);
    return {
      ...r,
      price: next,
      change,
      changePct,
      bid: +(next - halfSpread).toFixed(4),
      ask: +(next + halfSpread).toFixed(4),
      history,
      lastDir: dir,
      volume: r.volume + Math.round(Math.random() * 5_000),
    };
  }

  private static seedRow(q: MarketQuote): MarketRow {
    const halfSpread = +(q.price * HALF_SPREAD_BPS / 10_000).toFixed(4);
    const open = +(q.price - q.change).toFixed(4);
    return {
      ...q,
      open,
      bid: +(q.price - halfSpread).toFixed(4),
      ask: +(q.price + halfSpread).toFixed(4),
      history: Array.from({ length: 20 }, (_, i) => +(open + (q.price - open) * (i / 19)).toFixed(4)),
      lastDir: 'flat',
    };
  }
}
