import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GetRowIdParams, GridApi, GridReadyEvent, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import { THEMES } from '@fdc3-poc/fdc3-core';
import { InteropService, ResolveError } from '@fdc3-poc/interop-angular';
import type {
  AppIntent,
  InstrumentContext,
  ThemeName,
} from '@fdc3-poc/interop-angular';
import {
  InteropChannelPickerComponent,
  InteropStatusBadgeComponent,
  InteropWorkstationHeaderComponent,
} from '@fdc3-poc/interop-angular/ui';
import { TelemetryService, Fdc3TracerService, TrackDirective } from '@fdc3-poc/ngx-telemetry';
import { MarketDataFeed } from '../../services/market-data-feed';
import type { MarketRow } from '../../services/market-data-feed';

@Component({
  selector: 'app-market-watch',
  standalone: true,
  imports: [
    CommonModule,
    AgGridAngular,
    InteropChannelPickerComponent,
    InteropStatusBadgeComponent,
    InteropWorkstationHeaderComponent,
    TrackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './market-watch.component.html',
})
export class MarketWatchComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  readonly feed = new MarketDataFeed(1100);
  rows: MarketRow[] = this.feed.getRows();
  highlighted: string | null = null;
  intentStatus = '';

  /** Discovered once per session, then re-used for every row's actions menu. */
  rowActions: AppIntent[] = [];

  readonly defaultColDef: ColDef = { sortable: true, filter: true, resizable: true };

  readonly columnDefs: ColDef<MarketRow>[] = [
    { field: 'ticker', headerName: 'Ticker', width: 95, pinned: 'left' },
    { field: 'name', headerName: 'Instrument', minWidth: 200, flex: 1 },
    {
      field: 'bid',
      headerName: 'Bid',
      width: 90,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => Number(value).toFixed(2),
      cellStyle: { color: 'var(--ws-positive)', fontWeight: 600 },
    },
    {
      field: 'ask',
      headerName: 'Ask',
      width: 90,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => Number(value).toFixed(2),
      cellStyle: { color: 'var(--ws-negative)', fontWeight: 600 },
    },
    {
      field: 'price',
      headerName: 'Last',
      width: 95,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => Number(value).toFixed(2),
      cellStyle: ({ data, node }) => ({
        color: node?.isSelected() ? 'var(--ws-selection-text)' :
               data?.lastDir === 'up' ? 'var(--ws-positive)' :
               data?.lastDir === 'down' ? 'var(--ws-negative)' : 'var(--ws-text)',
        fontWeight: 800,
      }),
    },
    {
      field: 'change',
      headerName: 'Chg',
      width: 90,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}`,
      cellStyle: ({ value, node }) => ({
        color: node?.isSelected() ? 'var(--ws-selection-text)' : Number(value) >= 0 ? 'var(--ws-positive)' : 'var(--ws-negative)',
        fontWeight: 800,
      }),
    },
    {
      field: 'changePct',
      headerName: '%',
      width: 80,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`,
      cellStyle: ({ value, node }) => ({
        color: node?.isSelected() ? 'var(--ws-selection-text)' : Number(value) >= 0 ? 'var(--ws-positive)' : 'var(--ws-negative)',
        fontWeight: 800,
      }),
    },
    {
      headerName: 'Spark',
      width: 110,
      sortable: false,
      filter: false,
      valueGetter: ({ data }) => data?.history.join(','),  // forces re-render when history changes
      cellRenderer: (params: ICellRendererParams<MarketRow>) => this.renderSparkline(params),
    },
    {
      field: 'volume',
      headerName: 'Vol',
      width: 95,
      type: 'rightAligned',
      valueFormatter: ({ value }) => `${(Number(value) / 1_000_000).toFixed(1)}M`,
    },
    { field: 'exchange', width: 100 },
    {
      headerName: 'Actions',
      width: 220,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams<MarketRow>) => this.renderActions(params),
    },
  ];

  @ViewChild(AgGridAngular) grid?: AgGridAngular<MarketRow>;
  private gridApi?: GridApi<MarketRow>;

  private unsubFeed?: () => void;

  constructor(
    private readonly interop: InteropService,
    private readonly telemetry: TelemetryService,
    private readonly fdc3Tracer: Fdc3TracerService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
  ) {
    this.interop.contexts$<InstrumentContext>('fdc3.instrument').subscribe((ctx) => {
      this.applyInstrumentBroadcast(ctx);
    });

    this.interop.intents$<InstrumentContext>('ViewInstrument').subscribe(({ context }) => {
      if (context) this.applyInstrumentBroadcast(context);
    });
  }

  ngOnInit(): void {
    // Patch window.fdc3 so all broadcasts/intents automatically become OTEL spans.
    this.fdc3Tracer.attach();

    this.unsubFeed = this.feed.subscribe((rows) => {
      this.rows = rows;
      if (this.gridApi) this.gridApi.applyTransactionAsync({ update: rows });
      this.cdr.markForCheck();
    });
    this.feed.start();

    // Discover actions once. AppDirectory is static so a single query suffices;
    // we exclude `ViewInstrument` (handled here — pointless self-loop).
    void this.interop.findIntentsByContext({ type: 'fdc3.instrument', name: 'discovery', id: {} } as InstrumentContext)
      .then((intents) => {
        this.rowActions = intents.filter((i) => i.intent.name !== 'ViewInstrument');
        // Refresh the rendered cells so the new action set shows up.
        this.gridApi?.refreshCells({ columns: ['Actions'], force: true });
        this.cdr.markForCheck();
      })
      .catch((e) => console.warn('[market-watch] findIntentsByContext failed', e));
  }

  ngOnDestroy(): void {
    this.feed.stop();
    this.unsubFeed?.();
    this.fdc3Tracer.detach();
  }

  onGridReady(e: GridReadyEvent<MarketRow>): void {
    this.gridApi = e.api;
  }

  get agGridTheme(): string {
    return THEMES[this.theme].agGrid;
  }

  getRowId = (params: GetRowIdParams<MarketRow>): string => params.data.ticker;

  // ─── Row click → broadcast instrument ─────────────────────────────────────

  async onGridRowClicked(event: RowClickedEvent<MarketRow>): Promise<void> {
    if (event.data) await this.broadcastInstrument(event.data);
  }

  /** Click handler for the gainers/losers ribbon. */
  pickRow(r: MarketRow): void {
    void this.broadcastInstrument(r);
  }

  private async broadcastInstrument(r: MarketRow): Promise<void> {
    this.highlighted = r.ticker;
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: r.name,
      id: { ticker: r.ticker, ISIN: r.isin },
    };
    this.intentStatus = 'Broadcasting…';
    this.cdr.markForCheck();
    await this.interop.broadcast(ctx);
    this.intentStatus = '';
    this.cdr.markForCheck();
  }

  // ─── Top gainers / losers ─────────────────────────────────────────────────

  get topGainers(): MarketRow[] {
    return [...this.rows].sort((a, b) => b.changePct - a.changePct).slice(0, 3);
  }
  get topLosers(): MarketRow[] {
    return [...this.rows].sort((a, b) => a.changePct - b.changePct).slice(0, 3);
  }

  // ─── Cell renderers ───────────────────────────────────────────────────────

  /** Tiny SVG sparkline keyed off the row's price history. */
  private renderSparkline(params: ICellRendererParams<MarketRow>): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;padding:2px 4px';
    const row = params.data;
    if (!row || row.history.length < 2) return wrap;

    const w = 96, h = 22;
    const min = Math.min(...row.history);
    const max = Math.max(...row.history);
    const range = Math.max(max - min, 0.0001);
    const points = row.history.map((p, i) => {
      const x = (i / (row.history.length - 1)) * w;
      const y = (1 - (p - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const up = row.history[row.history.length - 1] >= row.history[0];
    const stroke = up ? 'var(--ws-positive)' : 'var(--ws-negative)';
    wrap.innerHTML = `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block">
        <polyline fill="none" stroke="${stroke}" stroke-width="1.4" points="${points}" />
      </svg>
    `;
    return wrap;
  }

  /** Per-row dynamic action menu, populated from the cached findIntentsByContext result. */
  private renderActions(params: ICellRendererParams<MarketRow>): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:4px;align-items:center;height:100%;flex-wrap:nowrap;overflow:hidden';
    const row = params.data;
    if (!row) return wrap;
    if (this.rowActions.length === 0) {
      const span = document.createElement('span');
      span.style.cssText = 'color:var(--ws-muted);font-size:11px;font-style:italic';
      span.textContent = 'no handlers';
      wrap.appendChild(span);
      return wrap;
    }
    for (const ai of this.rowActions) {
      const btn = document.createElement('button');
      btn.className = 'p-button p-button-sm p-button-text';
      btn.style.padding = '2px 8px';
      btn.textContent = ai.intent.displayName ?? ai.intent.name;
      btn.title = `Raise ${ai.intent.name}`;
      btn.onclick = (ev) => {
        ev.stopPropagation();   // don't fall through to row-click broadcast
        this.telemetry.recordEvent('ui.action.clicked', {
          'fdc3.intent': ai.intent.name,
          'fdc3.instrument.ticker': row.ticker,
          'fdc3.instrument.id.ISIN': row.isin,
        });
        void this.raiseRowIntent(row, ai);
      };
      wrap.appendChild(btn);
    }
    return wrap;
  }

  private async raiseRowIntent(r: MarketRow, ai: AppIntent): Promise<void> {
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: r.name,
      id: { ticker: r.ticker, ISIN: r.isin },
    };
    this.zone.run(() => {
      this.intentStatus = `Raising ${ai.intent.name}…`;
      this.cdr.markForCheck();
    });
    try {
      const res = await this.interop.raiseIntent(ai.intent.name, ctx);
      this.zone.run(() => {
        this.intentStatus = `${ai.intent.name} → ${res.source.appId}`;
        this.cdr.markForCheck();
      });
    } catch (err) {
      const code = (err as Error)?.message ?? String(err);
      this.zone.run(() => {
        this.intentStatus = code === ResolveError.NoAppsFound
          ? `No app handles ${ai.intent.name}`
          : code === ResolveError.UserCancelled
          ? `Resolver cancelled`
          : `Error: ${code}`;
        this.cdr.markForCheck();
      });
    } finally {
      setTimeout(() => this.zone.run(() => { this.intentStatus = ''; this.cdr.markForCheck(); }), 2500);
    }
  }

  // ─── External instrument context handling ─────────────────────────────────

  private applyInstrumentBroadcast(ctx: InstrumentContext): void {
    if (ctx.id?.ticker) {
      this.highlighted = ctx.id.ticker;
      this.cdr.markForCheck();
      // Scroll to and select the row, if present.
      const node = this.gridApi?.getRowNode(ctx.id.ticker);
      if (node) {
        node.setSelected(true, true);
        this.gridApi?.ensureNodeVisible(node, 'middle');
      }
    }
  }

  trackByRow(_i: number, r: MarketRow): string { return r.ticker; }
}
