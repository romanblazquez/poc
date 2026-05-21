import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GetRowIdParams, GridApi, GridReadyEvent, ICellRendererParams } from 'ag-grid-community';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectButtonModule } from 'primeng/selectbutton';
import { THEMES, ResolveError } from '@fdc3-poc/fdc3-core';
import type {
  Fdc3Context,
  InstrumentContext,
  OrderStatusContext,
  ThemeName,
  TraderOrderContext,
} from '@fdc3-poc/fdc3-core';

type StatusFilter = 'All' | 'Working' | 'Done' | 'Issues';

/**
 * The shape stored per grid row. Merges the original TraderOrderContext with
 * the most-recent OrderStatusContext for that orderId.
 */
interface BlotterRow {
  orderId: string;
  createdAt: string;
  side: 'Buy' | 'Sell';
  ticker: string;
  instrumentName: string;
  isin?: string;
  orderType: 'Market' | 'Limit';
  qty: number;
  limitPrice?: number;
  tif: string;
  venue: string;
  account: string;
  currency: string;
  notional?: number;
  status: TraderOrderContext['status'];
  filledQty: number;
  remainingQty: number;
  avgPrice: number | null;
  lastPrice: number | null;
  lastUpdate: string;
  cancelling?: boolean;
  cancelMessage?: string;
}

@Component({
  selector: 'app-order-blotter',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridAngular, ButtonModule, TagModule, SelectButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-blotter.component.html',
})
export class OrderBlotterComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  rows: BlotterRow[] = [];
  filter: StatusFilter = 'All';
  instrumentFilter: string | null = null;
  readonly filterOptions: Array<{ label: StatusFilter; value: StatusFilter }> = [
    { label: 'All', value: 'All' },
    { label: 'Working', value: 'Working' },
    { label: 'Done', value: 'Done' },
    { label: 'Issues', value: 'Issues' },
  ];

  readonly defaultColDef: ColDef = { sortable: true, filter: true, resizable: true };

  readonly columnDefs: ColDef<BlotterRow>[] = [
    {
      headerName: 'Time',
      width: 95,
      valueGetter: ({ data }) => data?.createdAt ?? '',
      valueFormatter: ({ value }) => value ? new Date(value).toLocaleTimeString() : '',
      pinned: 'left',
    },
    { field: 'orderId', headerName: 'Order ID', width: 150, pinned: 'left' },
    {
      field: 'side',
      width: 80,
      cellStyle: ({ value, node }) => ({
        color: node?.isSelected() ? 'var(--ws-selection-text)' : value === 'Buy' ? 'var(--ws-positive)' : 'var(--ws-negative)',
        fontWeight: 800,
      }),
    },
    { field: 'ticker', width: 95 },
    { field: 'instrumentName', headerName: 'Instrument', minWidth: 160, flex: 1 },
    { field: 'qty', headerName: 'Qty', width: 95, type: 'rightAligned', valueFormatter: ({ value }) => Number(value).toLocaleString() },
    {
      field: 'filledQty',
      headerName: 'Filled',
      width: 100,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value, data }) => `${Number(value).toLocaleString()} (${data ? Math.round((value / data.qty) * 100) : 0}%)`,
    },
    {
      field: 'avgPrice',
      headerName: 'Avg Px',
      width: 95,
      type: 'rightAligned',
      enableCellChangeFlash: true,
      valueFormatter: ({ value }) => (value == null ? '—' : Number(value).toFixed(2)),
    },
    {
      field: 'limitPrice',
      headerName: 'Limit',
      width: 95,
      type: 'rightAligned',
      valueFormatter: ({ value, data }) => (data?.orderType === 'Market' ? 'MKT' : value == null ? '—' : Number(value).toFixed(2)),
    },
    { field: 'tif', headerName: 'TIF', width: 80 },
    { field: 'venue', width: 120 },
    { field: 'account', width: 130 },
    {
      field: 'status',
      width: 130,
      enableCellChangeFlash: true,
    },
    {
      headerName: 'Actions',
      width: 170,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: this.renderActions.bind(this),
    },
  ];

  // The renderer is registered as a method so it can dispatch onto component methods.
  private renderActions(params: ICellRendererParams<BlotterRow>): HTMLElement {
    const row = params.data;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:6px;align-items:center;height:100%';
    if (!row) return wrap;

    const isDone = row.status === 'Filled' || row.status === 'Cancelled' || row.status === 'Rejected';
    const viewBtn = document.createElement('button');
    viewBtn.className = 'p-button p-button-sm p-button-text';
    viewBtn.textContent = 'View';
    viewBtn.onclick = () => this.broadcastInstrumentFromRow(row);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'p-button p-button-sm p-button-danger p-button-outlined';
    cancelBtn.textContent = row.cancelling ? '…' : 'Cancel';
    cancelBtn.disabled = isDone || !!row.cancelling;
    cancelBtn.onclick = () => this.requestCancel(row);

    wrap.appendChild(viewBtn);
    wrap.appendChild(cancelBtn);
    return wrap;
  }

  @ViewChild(AgGridAngular) grid?: AgGridAngular<BlotterRow>;
  private gridApi?: GridApi<BlotterRow>;

  private unsubOrder?: () => void;
  private unsubStatus?: () => void;
  private unsubInstrumentCtx?: () => void;
  private unsubViewOrders?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!window.fdc3) return;

    this.unsubOrder = window.fdc3.addContextListener<TraderOrderContext>(
      'com.demo.traderOrder',
      (ctx) => this.handleOrder(ctx),
    );
    this.unsubStatus = window.fdc3.addContextListener<OrderStatusContext>(
      'com.demo.orderStatus',
      (ctx) => this.handleStatus(ctx),
    );
    this.unsubInstrumentCtx = window.fdc3.addContextListener<InstrumentContext>(
      'fdc3.instrument',
      (ctx) => {
        this.instrumentFilter = ctx.id?.ticker ?? null;
        this.applyExternalFilter();
        this.cdr.markForCheck();
      },
    );
    this.unsubViewOrders = window.fdc3.addIntentListener('ViewOrders', (ctx) => {
      const instr = ctx as InstrumentContext | undefined;
      if (instr?.id?.ticker) {
        this.instrumentFilter = instr.id.ticker;
        this.applyExternalFilter();
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.unsubOrder?.();
    this.unsubStatus?.();
    this.unsubInstrumentCtx?.();
    this.unsubViewOrders?.();
  }

  onGridReady(e: GridReadyEvent<BlotterRow>): void {
    this.gridApi = e.api;
    this.applyExternalFilter();
  }

  setFilter(value: StatusFilter): void {
    this.filter = value;
    this.applyExternalFilter();
  }

  clearInstrumentFilter(): void {
    this.instrumentFilter = null;
    this.applyExternalFilter();
  }

  get agGridTheme(): string {
    return THEMES[this.theme].agGrid;
  }

  getRowId = (params: GetRowIdParams<BlotterRow>): string => params.data.orderId;

  get summary(): { working: number; filled: number; cancelled: number; gross: number; net: number } {
    let working = 0, filled = 0, cancelled = 0, gross = 0, net = 0;
    for (const r of this.rows) {
      if (r.status === 'Working' || r.status === 'New' || r.status === 'PartiallyFilled') working++;
      else if (r.status === 'Filled') filled++;
      else if (r.status === 'Cancelled' || r.status === 'Rejected') cancelled++;
      const px = r.avgPrice ?? r.limitPrice ?? 0;
      const notional = r.filledQty * px;
      gross += Math.abs(notional);
      net += (r.side === 'Buy' ? 1 : -1) * notional;
    }
    return { working, filled, cancelled, gross, net };
  }

  trackByRow(_i: number, r: BlotterRow): string {
    return r.orderId;
  }

  // ─── Context handlers ────────────────────────────────────────────────────

  private handleOrder(ctx: TraderOrderContext): void {
    const row: BlotterRow = {
      orderId: ctx.orderId,
      createdAt: ctx.createdAt,
      side: ctx.side,
      ticker: ctx.instrument.ticker,
      instrumentName: ctx.instrument.name ?? ctx.instrument.ticker,
      isin: ctx.instrument.ISIN,
      orderType: ctx.orderType,
      qty: ctx.quantity,
      limitPrice: ctx.limitPrice,
      tif: ctx.tif,
      venue: ctx.venue,
      account: ctx.account,
      currency: ctx.currency,
      notional: ctx.notional,
      status: ctx.status,
      filledQty: 0,
      remainingQty: ctx.quantity,
      avgPrice: null,
      lastPrice: null,
      lastUpdate: ctx.createdAt,
    };
    this.upsertRow(row, 'add');
  }

  private handleStatus(ctx: OrderStatusContext): void {
    const existing = this.rows.find((r) => r.orderId === ctx.orderId);
    if (!existing) return; // We never saw the parent order — ignore for now.
    const updated: BlotterRow = {
      ...existing,
      status: ctx.status,
      filledQty: ctx.filledQty ?? existing.filledQty,
      remainingQty: ctx.remainingQty ?? Math.max(existing.qty - (ctx.filledQty ?? existing.filledQty), 0),
      avgPrice: ctx.avgPrice ?? existing.avgPrice,
      lastPrice: ctx.lastPrice ?? existing.lastPrice,
      lastUpdate: ctx.ts,
    };
    this.upsertRow(updated, 'update');
  }

  private upsertRow(row: BlotterRow, op: 'add' | 'update'): void {
    const idx = this.rows.findIndex((r) => r.orderId === row.orderId);
    if (idx >= 0) {
      this.rows = [...this.rows.slice(0, idx), row, ...this.rows.slice(idx + 1)];
    } else {
      this.rows = [row, ...this.rows];
    }
    if (this.gridApi) {
      this.gridApi.applyTransactionAsync(op === 'add' ? { add: [row], addIndex: 0 } : { update: [row] });
    }
    this.cdr.markForCheck();
  }

  // ─── Row actions ─────────────────────────────────────────────────────────

  private async broadcastInstrumentFromRow(row: BlotterRow): Promise<void> {
    if (!window.fdc3) return;
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: row.instrumentName,
      id: { ticker: row.ticker, ISIN: row.isin },
    };
    await window.fdc3.broadcast(ctx);
  }

  private async requestCancel(row: BlotterRow): Promise<void> {
    if (!window.fdc3) return;
    const ctx: Fdc3Context = {
      type: 'com.demo.cancelRequest',
      name: `Cancel ${row.orderId}`,
      orderId: row.orderId,
    };
    row.cancelling = true;
    this.refreshRow(row);
    try {
      await window.fdc3.raiseIntent('CancelOrder', ctx);
      row.cancelMessage = 'Cancel routed';
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      row.cancelMessage = msg === ResolveError.NoAppsFound ? 'No cancel handler registered' : msg;
    } finally {
      row.cancelling = false;
      this.refreshRow(row);
    }
  }

  private refreshRow(row: BlotterRow): void {
    this.rows = this.rows.map((r) => (r.orderId === row.orderId ? { ...row } : r));
    if (this.gridApi) {
      this.gridApi.applyTransactionAsync({ update: [{ ...row }] });
    }
    this.cdr.markForCheck();
  }

  // ─── Filters ─────────────────────────────────────────────────────────────

  private applyExternalFilter(): void {
    if (!this.gridApi) return;
    this.gridApi.setGridOption?.('isExternalFilterPresent', () => true);
    this.gridApi.setGridOption?.('doesExternalFilterPass', (node) => {
      const r = node.data as BlotterRow | undefined;
      if (!r) return false;
      if (this.instrumentFilter && r.ticker !== this.instrumentFilter) return false;
      switch (this.filter) {
        case 'Working': return r.status === 'New' || r.status === 'Working' || r.status === 'PartiallyFilled';
        case 'Done':    return r.status === 'Filled';
        case 'Issues':  return r.status === 'Rejected' || r.status === 'Cancelled';
        default: return true;
      }
    });
    this.gridApi.onFilterChanged?.();
  }

  statusSeverity(status: BlotterRow['status']): 'success' | 'warn' | 'danger' | 'info' {
    if (status === 'Filled') return 'success';
    if (status === 'Cancelled' || status === 'Rejected') return 'danger';
    if (status === 'PartiallyFilled') return 'warn';
    return 'info';
  }
}
