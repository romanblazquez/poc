import { Component, Input, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import { TagModule } from 'primeng/tag';
import type { ColDef, GetRowIdParams } from 'ag-grid-community';
import { THEMES } from '@fdc3-poc/fdc3-core';
import { InteropService } from '@fdc3-poc/interop-angular';
import type { Channel, FundContext, OrderContext, ThemeName } from '@fdc3-poc/interop-angular';
import { AUDIT_EVENTS, getAuditEventsByFund, getFundById } from '@fdc3-poc/shared-domain';
import type { AuditEvent, FundAllocation } from '@fdc3-poc/shared-domain';

const FUNDOPS_CHANNEL_ID = 'com.demo.fundops';

function severityColor(severity: string): string {
  if (severity === 'Critical') return '#b42318';
  if (severity === 'Warning') return '#b76e00';
  return '#087443';
}

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, AgGridAngular, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit-log.component.html',
})
export class AuditLogComponent implements OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  fundId: string | null = null;
  lastOrderId: string | null = null;

  readonly columnDefs: ColDef<AuditEvent>[] = [
    { field: 'timestamp', width: 115, sort: 'desc' },
    {
      field: 'severity',
      width: 120,
      cellStyle: ({ value }) => ({ color: severityColor(String(value)), fontWeight: 800 }),
    },
    { field: 'actor', width: 150 },
    { field: 'action', width: 150 },
    { field: 'details', minWidth: 280, flex: 1, wrapText: true, autoHeight: true },
    { field: 'auditId', headerName: 'Audit ID', width: 130 },
  ];

  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
  };

  private fundOpsChannel?: Channel;
  private fundOpsFundUnsub?: () => void;
  private fundOpsOrderUnsub?: () => void;

  constructor(
    private readonly interop: InteropService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    void this.bootstrapChannel();
  }

  ngOnDestroy(): void {
    this.fundOpsFundUnsub?.();
    this.fundOpsOrderUnsub?.();
  }

  private async bootstrapChannel(): Promise<void> {
    try {
      this.fundOpsChannel = await this.interop.getOrCreateChannel(FUNDOPS_CHANNEL_ID);

      const fundHandle = await this.fundOpsChannel.addContextListener<FundContext>('com.demo.fund', (ctx) => {
        this.fundId = ctx.id.fundId;
        this.cdr.markForCheck();
      });
      this.fundOpsFundUnsub = (): void => fundHandle.unsubscribe();

      const orderHandle = await this.fundOpsChannel.addContextListener<OrderContext>('com.demo.order', (ctx) => {
        this.lastOrderId = ctx.orderId;
        this.fundId = ctx.fundId;
        this.cdr.markForCheck();
      });
      this.fundOpsOrderUnsub = (): void => orderHandle.unsubscribe();

      // Pull whatever fund/order context is already on the channel so the
      // audit blotter is filtered the moment it opens.
      const lastFund = await this.fundOpsChannel.getCurrentContext('com.demo.fund');
      if (lastFund && (lastFund as FundContext).id?.fundId) {
        this.fundId = (lastFund as FundContext).id.fundId;
      }
      const lastOrder = await this.fundOpsChannel.getCurrentContext('com.demo.order');
      if (lastOrder) {
        const order = lastOrder as OrderContext;
        this.lastOrderId = order.orderId;
        if (order.fundId) this.fundId = order.fundId;
      }
      this.cdr.markForCheck();
    } catch (err) {
      console.warn('[audit-log] AppChannel unavailable; staying offline', err);
    }
  }

  get agGridTheme(): string {
    return THEMES[this.theme].agGrid;
  }

  get events(): AuditEvent[] {
    return this.fundId ? getAuditEventsByFund(this.fundId) : AUDIT_EVENTS;
  }

  get selectedFund(): FundAllocation | undefined {
    return this.fundId ? getFundById(this.fundId) : undefined;
  }

  getRowId = (params: GetRowIdParams<AuditEvent>): string => params.data.auditId;
}
