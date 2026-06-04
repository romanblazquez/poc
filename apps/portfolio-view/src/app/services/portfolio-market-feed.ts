import { getCustomerById, getPortfolioByCustomer, MARKET_QUOTES } from '@fdc3-poc/shared-domain';
import type { PortfolioPosition } from '@fdc3-poc/shared-domain';

export interface PortfolioRow extends PortfolioPosition {
  openPrice: number;
  lastDir: 'up' | 'down' | 'flat';
  marketValue: number;
  costBasis: number;
  pnl: number;
  pnlPct: number;
  dayPnl: number;
  dayPnlPct: number;
}

export interface LoadedPortfolio {
  customerName: string;
  rows: PortfolioRow[];
}

type Listener = (rows: PortfolioRow[]) => void;

const quoteByTicker = new Map(MARKET_QUOTES.map((q) => [q.ticker, q]));

export class PortfolioMarketFeed {
  private rows: PortfolioRow[] = [];
  private readonly listeners = new Set<Listener>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly intervalMs = 1200) {}

  loadCustomer(customerId: string): LoadedPortfolio {
    this.rows = getPortfolioByCustomer(customerId).map((pos) => this.toRow(pos));
    this.emit();
    return {
      customerName: getCustomerById(customerId)?.name ?? customerId,
      rows: this.getRows(),
    };
  }

  getRows(): PortfolioRow[] {
    return this.rows.map((r) => ({ ...r }));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getRows());
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private tick(): void {
    if (this.rows.length === 0) return;
    this.rows = this.rows.map((row) => {
      const stdev = row.currentPrice * 0.0022;
      const delta = (Math.random() - 0.5) * stdev;
      const nextPrice = Math.max(row.currentPrice + delta, 0.01);
      return this.revalue({
        ...row,
        currentPrice: +nextPrice.toFixed(2),
        lastDir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      });
    });
    this.emit();
  }

  private toRow(pos: PortfolioPosition): PortfolioRow {
    const quote = quoteByTicker.get(pos.ticker);
    const currentPrice = quote?.price ?? pos.currentPrice;
    return this.revalue({
      ...pos,
      currentPrice,
      openPrice: currentPrice,
      lastDir: 'flat',
      marketValue: 0,
      costBasis: 0,
      pnl: 0,
      pnlPct: 0,
      dayPnl: 0,
      dayPnlPct: 0,
    });
  }

  private revalue(row: PortfolioRow): PortfolioRow {
    const marketValue = row.quantity * row.currentPrice;
    const costBasis = row.quantity * row.avgCost;
    const pnl = marketValue - costBasis;
    const dayPnl = row.quantity * (row.currentPrice - row.openPrice);
    return {
      ...row,
      marketValue,
      costBasis,
      pnl,
      pnlPct: costBasis === 0 ? 0 : (pnl / costBasis) * 100,
      dayPnl,
      dayPnlPct: row.openPrice === 0 ? 0 : ((row.currentPrice - row.openPrice) / row.openPrice) * 100,
    };
  }

  private emit(): void {
    const snapshot = this.getRows();
    for (const listener of this.listeners) listener(snapshot);
  }
}
