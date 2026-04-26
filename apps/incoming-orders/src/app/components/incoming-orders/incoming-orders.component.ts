import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, RowClickedEvent, GetRowIdParams } from 'ag-grid-community';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { FundContext, OrderContext, ThemeName } from '@fdc3-poc/fdc3-core';
import { getFundById, INCOMING_ORDERS } from '@fdc3-poc/shared-domain';
import type { FundAllocation, IncomingOrder } from '@fdc3-poc/shared-domain';

@Component({
  selector: 'app-incoming-orders',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './incoming-orders.component.html',
})
export class IncomingOrdersComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'quartz-dark';

  fundId: string | null = null;
  selectedOrderId: string | null = null;

  readonly columnDefs: ColDef<IncomingOrder>[] = [
    { field: 'orderId', headerName: 'Order', width: 115, pinned: 'left' },
    { field: 'fundName', headerName: 'Fund', minWidth: 210, flex: 1 },
    {
      field: 'side',
      width: 90,
      cellStyle: ({ value }) => ({ color: value === 'Buy' ? '#087443' : '#b42318', fontWeight: 800 }),
    },
    {
      field: 'quantity',
      width: 120,
      type: 'rightAligned',
      valueFormatter: ({ value }) => Number(value).toLocaleString(),
    },
    {
      field: 'notional',
      width: 130,
      type: 'rightAligned',
      valueFormatter: ({ data, value }) => `${data?.currency ?? ''} ${Number(value).toLocaleString()}`,
    },
    { field: 'receivedAt', headerName: 'Received', width: 120 },
    { field: 'status', width: 125 },
    { field: 'source', width: 130 },
    { field: 'trader', width: 130 },
  ];

  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
  };

  private unsubTheme?: () => void;
  private unsubFund?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!window.fdc3) return;

    this.unsubFund = window.fdc3.addContextListener<FundContext>('com.demo.fund', (ctx) => {
      this.fundId = ctx.id.fundId;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.unsubTheme?.();
    this.unsubFund?.();
  }

  get agGridTheme(): string {
    return THEMES[this.theme].agGrid;
  }

  get orders(): IncomingOrder[] {
    return this.fundId ? INCOMING_ORDERS.filter((o) => o.fundId === this.fundId) : INCOMING_ORDERS;
  }

  get selectedFund(): FundAllocation | undefined {
    return this.fundId ? getFundById(this.fundId) : undefined;
  }

  getRowId = (params: GetRowIdParams<IncomingOrder>): string => params.data.orderId;

  clearFilter(): void {
    this.fundId = null;
    this.cdr.markForCheck();
  }

  async onRowClicked(event: RowClickedEvent<IncomingOrder>): Promise<void> {
    if (!event.data || !window.fdc3) return;
    const order = event.data;
    this.selectedOrderId = order.orderId;
    this.cdr.markForCheck();

    const orderContext: OrderContext = {
      type: 'com.demo.order',
      name: order.orderId,
      orderId: order.orderId,
      fundId: order.fundId,
      side: order.side,
      quantity: order.quantity,
      notional: order.notional,
      currency: order.currency,
      status: order.status,
    };
    await window.fdc3.broadcast(orderContext);

    const fund = getFundById(order.fundId);
    if (fund) {
      await window.fdc3.broadcast({
        type: 'com.demo.fund',
        name: fund.name,
        id: { fundId: fund.fundId, ticker: fund.ticker, ISIN: fund.isin },
        strategy: fund.strategy,
      } satisfies FundContext);
    }
  }
}
