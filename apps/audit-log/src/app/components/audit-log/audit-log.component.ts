import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GetRowIdParams } from 'ag-grid-community';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { FundContext, OrderContext, ThemeName } from '@fdc3-poc/fdc3-core';
import { AUDIT_EVENTS, getAuditEventsByFund, getFundById } from '@fdc3-poc/shared-domain';
import type { AuditEvent, FundAllocation } from '@fdc3-poc/shared-domain';

function severityColor(severity: string): string {
  if (severity === 'Critical') return '#b42318';
  if (severity === 'Warning') return '#b76e00';
  return '#087443';
}

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit-log.component.html',
})
export class AuditLogComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'quartz-dark';

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

  private unsubTheme?: () => void;
  private unsubFund?: () => void;
  private unsubOrder?: () => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!window.fdc3) return;

    this.unsubFund = window.fdc3.addContextListener<FundContext>('com.demo.fund', (ctx) => {
      this.fundId = ctx.id.fundId;
      this.cdr.markForCheck();
    });

    this.unsubOrder = window.fdc3.addContextListener<OrderContext>('com.demo.order', (ctx) => {
      this.lastOrderId = ctx.orderId;
      this.fundId = ctx.fundId;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.unsubTheme?.();
    this.unsubFund?.();
    this.unsubOrder?.();
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
