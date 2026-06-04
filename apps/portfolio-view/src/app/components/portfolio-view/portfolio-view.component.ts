import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GetRowIdParams, GridApi, GridReadyEvent, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import { THEMES } from '@fdc3-poc/fdc3-core';
import { InteropService, ResolveError } from '@fdc3-poc/interop-angular';
import type { AppIntent, ContactContext, Fdc3Context, InstrumentContext, ThemeName } from '@fdc3-poc/interop-angular';
import {
  InteropChannelPickerComponent,
  InteropEmptyStateComponent,
  InteropStatusBadgeComponent,
  InteropWorkstationHeaderComponent,
} from '@fdc3-poc/interop-angular/ui';
import { PortfolioMarketFeed } from '../../services/portfolio-market-feed';
import type { PortfolioRow } from '../../services/portfolio-market-feed';

interface PortfolioContext extends Fdc3Context {
  type: 'fdc3.portfolio';
  name: string;
  positions: Array<{
    instrument: InstrumentContext;
    holding: number;
    marketValue: number;
    pnl: number;
  }>;
}

@Component({
  selector: 'app-portfolio-view',
  standalone: true,
  imports: [
    CommonModule,
    AgGridAngular,
    InteropChannelPickerComponent,
    InteropEmptyStateComponent,
    InteropStatusBadgeComponent,
    InteropWorkstationHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './portfolio-view.component.html',
})
export class PortfolioViewComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  readonly feed = new PortfolioMarketFeed(1200);
  positions: PortfolioRow[] = [];
  customerName = '';
  selectedTicker: string | null = null;
  banner = '';
  rowActions: AppIntent[] = [];

  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
  };

  readonly columnDefs: ColDef<PortfolioRow>[] = [
    { field: 'name', headerName: 'Instrument', minWidth: 210, flex: 1, pinned: 'left' },
    { field: 'ticker', width: 95, pinned: 'left' },
    {
      field: 'quantity',
      headerName: 'Qty',
      width: 100,
      type: 'rightAligned',
      valueFormatter: ({ value }) => Number(value).toLocaleString(),
    },
    {
      field: 'avgCost',
      headerName: 'Avg',
      width: 90,
      type: 'rightAligned',
      valueFormatter: ({ value }) => Number(value).toFixed(2),
    },
    {
      field: 'currentPrice',
      headerName: 'Last',
      width: 90,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => Number(value).toFixed(2),
      cellStyle: ({ data, node }) => this.priceCellStyle(data?.lastDir, !!node?.isSelected()),
    },
    {
      field: 'marketValue',
      headerName: 'Mkt Value',
      width: 120,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    },
    {
      field: 'dayPnl',
      headerName: 'Day P&L',
      width: 115,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => `${Number(value) >= 0 ? '+' : ''}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      cellStyle: ({ value, node }) => this.pnlCellStyle(Number(value), !!node?.isSelected()),
    },
    {
      field: 'pnl',
      headerName: 'Total P&L',
      width: 120,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => `${Number(value) >= 0 ? '+' : ''}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      cellStyle: ({ value, node }) => this.pnlCellStyle(Number(value), !!node?.isSelected()),
    },
    {
      field: 'pnlPct',
      headerName: 'P&L %',
      width: 95,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)}%`,
      cellStyle: ({ value, node }) => this.pnlCellStyle(Number(value), !!node?.isSelected()),
    },
    {
      headerName: 'Actions',
      width: 235,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams<PortfolioRow>) => this.renderActions(params),
    },
  ];

  private gridApi?: GridApi<PortfolioRow>;
  private unsubFeed?: () => void;

  constructor(
    private readonly interop: InteropService,
    private readonly cdr: ChangeDetectorRef,
    private readonly zone: NgZone,
  ) {
    this.interop.contexts$<ContactContext>('fdc3.contact').subscribe((ctx) => {
      if (ctx.id?.customerId) this.loadPortfolio(ctx.id.customerId);
    });

    this.interop.intents$<ContactContext>('ViewPortfolio').subscribe(({ context }) => {
      if (context?.id?.customerId) this.loadPortfolio(context.id.customerId);
    });
  }

  ngOnInit(): void {
    this.unsubFeed = this.feed.subscribe((rows) => {
      this.positions = rows;
      if (this.gridApi) this.gridApi.applyTransactionAsync({ update: rows });
      this.cdr.markForCheck();
    });
    this.feed.start();
    void this.discoverRowActions();
  }

  ngOnDestroy(): void {
    this.feed.stop();
    this.unsubFeed?.();
  }

  onGridReady(event: GridReadyEvent<PortfolioRow>): void {
    this.gridApi = event.api;
  }

  async onGridRowClicked(event: RowClickedEvent<PortfolioRow>): Promise<void> {
    if (event.data) await this.broadcastInstrument(event.data);
  }

  get agGridTheme(): string {
    return THEMES[this.theme].agGrid;
  }

  getRowId = (params: GetRowIdParams<PortfolioRow>): string => params.data.ticker;

  get grossExposure(): number {
    return this.positions.reduce((sum, p) => sum + Math.abs(p.marketValue), 0);
  }

  get netExposure(): number {
    return this.positions.reduce((sum, p) => sum + p.marketValue, 0);
  }

  get totalPnL(): number {
    return this.positions.reduce((sum, p) => sum + p.pnl, 0);
  }

  get dayPnL(): number {
    return this.positions.reduce((sum, p) => sum + p.dayPnl, 0);
  }

  get totalValue(): number {
    return this.netExposure;
  }

  trackByTicker(_index: number, pos: PortfolioRow): string {
    return pos.ticker;
  }

  pickRow(row: PortfolioRow): void {
    void this.broadcastInstrument(row);
  }

  async raiseAllocate(): Promise<void> {
    if (this.positions.length === 0) return;
    const ctx = this.toPortfolioContext();
    this.banner = 'Raising Allocate...';
    this.cdr.markForCheck();
    try {
      const res = await this.interop.raiseIntent('Allocate', ctx);
      this.banner = `Allocate -> ${res.source.appId}`;
    } catch (err) {
      this.banner = this.intentErrorMessage(err, 'Allocate');
    } finally {
      this.clearBannerLater();
    }
  }

  private loadPortfolio(customerId: string): void {
    const loaded = this.feed.loadCustomer(customerId);
    this.customerName = loaded.customerName;
    this.positions = loaded.rows;
    this.banner = `Loaded ${loaded.customerName}`;
    this.cdr.markForCheck();
    this.clearBannerLater();
  }

  private async broadcastInstrument(row: PortfolioRow): Promise<void> {
    const ctx = this.toInstrumentContext(row);
    this.selectedTicker = row.ticker;
    this.cdr.markForCheck();
    await this.interop.broadcast(ctx);
  }

  private async discoverRowActions(): Promise<void> {
    const ctx: InstrumentContext = { type: 'fdc3.instrument', name: 'Instrument', id: {} };
    try {
      const intents = await this.interop.findIntentsByContext(ctx);
      this.rowActions = intents.filter((i) => i.intent.name !== 'ViewPortfolio');
      this.gridApi?.refreshCells({ columns: ['Actions'], force: true });
      this.cdr.markForCheck();
    } catch {
      this.rowActions = [];
    }
  }

  private renderActions(params: ICellRendererParams<PortfolioRow>): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:4px;align-items:center;height:100%;overflow:hidden';
    const row = params.data;
    if (!row || this.rowActions.length === 0) {
      const span = document.createElement('span');
      span.textContent = 'no handlers';
      span.style.cssText = 'font-size:11px;color:var(--ws-muted);font-style:italic';
      wrap.appendChild(span);
      return wrap;
    }
    for (const action of this.rowActions) {
      const btn = document.createElement('button');
      btn.className = 'p-button p-button-sm p-button-text';
      btn.style.padding = '2px 7px';
      btn.textContent = action.intent.displayName ?? action.intent.name;
      btn.title = `Raise ${action.intent.name}`;
      btn.onclick = (event) => {
        event.stopPropagation();
        void this.raiseRowIntent(row, action);
      };
      wrap.appendChild(btn);
    }
    return wrap;
  }

  private async raiseRowIntent(row: PortfolioRow, action: AppIntent): Promise<void> {
    this.zone.run(() => {
      this.banner = `Raising ${action.intent.name}...`;
      this.cdr.markForCheck();
    });
    try {
      const res = await this.interop.raiseIntent(action.intent.name, this.toInstrumentContext(row));
      this.zone.run(() => {
        this.banner = `${action.intent.name} -> ${res.source.appId}`;
        this.cdr.markForCheck();
      });
    } catch (err) {
      this.zone.run(() => {
        this.banner = this.intentErrorMessage(err, action.intent.name);
        this.cdr.markForCheck();
      });
    } finally {
      this.clearBannerLater();
    }
  }

  private toInstrumentContext(row: PortfolioRow): InstrumentContext {
    return {
      type: 'fdc3.instrument',
      name: row.name,
      id: { ticker: row.ticker, ISIN: row.isin },
    };
  }

  private toPortfolioContext(): PortfolioContext {
    return {
      type: 'fdc3.portfolio',
      name: this.customerName || 'Portfolio',
      positions: this.positions.map((p) => ({
        instrument: this.toInstrumentContext(p),
        holding: p.quantity,
        marketValue: p.marketValue,
        pnl: p.pnl,
      })),
    };
  }

  private pnlCellStyle(value: number, selected: boolean): Record<string, string | number> {
    return {
      color: selected ? 'var(--ws-selection-text)' : value >= 0 ? 'var(--ws-positive)' : 'var(--ws-negative)',
      fontWeight: 800,
    };
  }

  private priceCellStyle(dir: PortfolioRow['lastDir'] | undefined, selected: boolean): Record<string, string | number> {
    const style: Record<string, string | number> = { fontWeight: 800 };
    if (selected) style['color'] = 'var(--ws-selection-text)';
    else if (dir === 'up') style['color'] = 'var(--ws-positive)';
    else if (dir === 'down') style['color'] = 'var(--ws-negative)';
    return style;
  }

  private intentErrorMessage(err: unknown, intent: string): string {
    const code = (err as Error)?.message ?? String(err);
    if (code === ResolveError.NoAppsFound) return `No app handles ${intent}`;
    if (code === ResolveError.UserCancelled) return 'Resolver cancelled';
    return `Error: ${code}`;
  }

  private clearBannerLater(): void {
    setTimeout(() => this.zone.run(() => {
      this.banner = '';
      this.cdr.markForCheck();
    }), 2500);
  }
}
