import { Component, Input, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import type { ColDef, RowClickedEvent, GetRowIdParams } from 'ag-grid-community';
import { THEMES } from '@fdc3-poc/fdc3-core';
import { InteropService } from '@fdc3-poc/interop-angular';
import type { Channel, FundContext, OrderContext, ThemeName } from '@fdc3-poc/interop-angular';
import { getFundById, INCOMING_ORDERS } from '@fdc3-poc/shared-domain';
import type { FundAllocation, IncomingOrder } from '@fdc3-poc/shared-domain';

const FUNDOPS_CHANNEL_ID = 'com.demo.fundops';

@Component({
  selector: 'app-incoming-orders',
  standalone: true,
  imports: [CommonModule, AgGridAngular, ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './incoming-orders.component.html',
})
export class IncomingOrdersComponent implements OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  fundId: string | null = null;
  selectedOrderId: string | null = null;

  readonly columnDefs: ColDef<IncomingOrder>[] = [
    { field: 'orderId', headerName: 'Order', width: 115, pinned: 'left' },
    { field: 'fundName', headerName: 'Fund', minWidth: 210, flex: 1 },
    {
      field: 'side',
      width: 90,
      cellStyle: ({ value, node }) => ({
        color: node?.isSelected() ? 'var(--ws-selection-text)' : value === 'Buy' ? '#087443' : '#b42318',
        fontWeight: 800,
      }),
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

  private fundOpsChannel?: Channel;
  private fundOpsUnsub?: () => void;

  constructor(
    private readonly interop: InteropService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    void this.bootstrapChannel();
  }

  ngOnDestroy(): void {
    this.fundOpsUnsub?.();
  }

  private async bootstrapChannel(): Promise<void> {
    try {
      this.fundOpsChannel = await this.interop.getOrCreateChannel(FUNDOPS_CHANNEL_ID);
      const handle = await this.fundOpsChannel.addContextListener<FundContext>('com.demo.fund', (ctx) => {
        this.fundId = ctx.id.fundId;
        this.cdr.markForCheck();
      });
      this.fundOpsUnsub = (): void => handle.unsubscribe();

      // Late-join sync — adopt whatever fund the trio is currently focused on.
      const last = await this.fundOpsChannel.getCurrentContext('com.demo.fund');
      if (last && (last as FundContext).id?.fundId) {
        this.fundId = (last as FundContext).id.fundId;
        this.cdr.markForCheck();
      }
    } catch (err) {
      console.warn('[incoming-orders] AppChannel unavailable; staying offline', err);
    }
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
    if (!event.data || !this.fundOpsChannel) return;
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
    await this.fundOpsChannel.broadcast(orderContext);

    const fund = getFundById(order.fundId);
    if (fund) {
      await this.fundOpsChannel.broadcast({
        type: 'com.demo.fund',
        name: fund.name,
        id: { fundId: fund.fundId, ticker: fund.ticker, ISIN: fund.isin },
        strategy: fund.strategy,
      } satisfies FundContext);
    }
  }
}
