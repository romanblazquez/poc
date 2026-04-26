import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ContactContext, InstrumentContext } from '@fdc3-poc/fdc3-core';
import type { ThemeName } from '@fdc3-poc/fdc3-core';
import { getPortfolioByCustomer, getCustomerById } from '@fdc3-poc/shared-domain';
import type { PortfolioPosition } from '@fdc3-poc/shared-domain';

@Component({
  selector: 'app-portfolio-view',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './portfolio-view.component.html',
})
export class PortfolioViewComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'quartz-dark';

  positions: PortfolioPosition[] = [];
  customerName = '';
  selectedTicker: string | null = null;

  private unsub1?: () => void;
  private unsub2?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!window.fdc3) return;

    const loadPortfolio = (customerId: string): void => {
      this.positions = getPortfolioByCustomer(customerId);
      const cust = getCustomerById(customerId);
      this.customerName = cust?.name ?? customerId;
      this.cdr.markForCheck();
    };

    this.unsub1 = window.fdc3.addContextListener('fdc3.contact', (ctx: ContactContext) => {
      if (ctx.id?.customerId) loadPortfolio(ctx.id.customerId);
    });

    this.unsub2 = window.fdc3.addIntentListener('ViewPortfolio', (raw) => {
      const ctx = raw as ContactContext | undefined;
      if (ctx?.id?.customerId) loadPortfolio(ctx.id.customerId);
    });
  }

  ngOnDestroy(): void {
    this.unsub1?.();
    this.unsub2?.();
  }

  async onPositionClick(pos: PortfolioPosition): Promise<void> {
    if (!window.fdc3) return;
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: pos.name,
      id: { ticker: pos.ticker, ISIN: pos.isin },
    };
    this.selectedTicker = pos.ticker;
    this.cdr.markForCheck();
    await window.fdc3.broadcast(ctx);
  }

  get totalValue(): number {
    return this.positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
  }

  get totalPnL(): number {
    return this.positions.reduce((sum, p) => sum + p.quantity * (p.currentPrice - p.avgCost), 0);
  }

  pnl(pos: PortfolioPosition): number {
    return pos.quantity * (pos.currentPrice - pos.avgCost);
  }

  pnlPct(pos: PortfolioPosition): number {
    return ((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100;
  }

  trackByTicker(_index: number, pos: PortfolioPosition): string {
    return pos.ticker;
  }
}
