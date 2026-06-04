import { Component, Input, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, NgZone, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GetRowIdParams, GridApi, GridReadyEvent, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import { InputTextModule } from 'primeng/inputtext';
import { THEMES } from '@fdc3-poc/fdc3-core';
import { InteropService, ResolveError } from '@fdc3-poc/interop-angular';
import type { AppIntent, ContactContext, ThemeName } from '@fdc3-poc/interop-angular';
import {
  InteropChannelPickerComponent,
  InteropStatusBadgeComponent,
  InteropWorkstationHeaderComponent,
} from '@fdc3-poc/interop-angular/ui';
import { CUSTOMERS } from '@fdc3-poc/shared-domain';
import type { Customer } from '@fdc3-poc/shared-domain';

const SEGMENT_COLORS: Record<string, string> = {
  'Private Banking': '#9040e8',
  Institutional: '#4080e8',
  Corporate: '#40c080',
  Retail: '#e87040',
};

@Component({
  selector: 'app-customer-search',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AgGridAngular,
    InputTextModule,
    InteropChannelPickerComponent,
    InteropStatusBadgeComponent,
    InteropWorkstationHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-search.component.html',
})
export class CustomerSearchComponent implements OnInit {
  @Input() theme: ThemeName = 'dark-financial';

  query = '';
  lastBroadcast: string | null = null;
  hoveredId: string | null = null;
  rowActions: AppIntent[] = [];

  readonly segmentColors = SEGMENT_COLORS;
  readonly columnDefs: ColDef<Customer>[] = [
    { field: 'name', headerName: 'Customer', minWidth: 210, flex: 1 },
    { field: 'customerId', headerName: 'ID', width: 115 },
    { field: 'segment', width: 150 },
    { field: 'relationship_manager', headerName: 'RM', width: 150 },
    { field: 'country', width: 110 },
    { field: 'relationship', headerName: 'Status', width: 115 },
    {
      headerName: 'Actions',
      width: 170,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams<Customer>) => this.renderActions(params),
    },
  ];

  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
  };

  @ViewChild(AgGridAngular) grid?: AgGridAngular<Customer>;
  private gridApi?: GridApi<Customer>;

  constructor(
    private readonly interop: InteropService,
    private readonly cdr: ChangeDetectorRef,
    private readonly zone: NgZone,
  ) {}

  ngOnInit(): void {
    void this.interop.findIntentsByContext({ type: 'fdc3.contact', name: 'Contact', id: {} })
      .then((intents) => {
        this.rowActions = intents;
        this.gridApi?.refreshCells({ columns: ['Actions'], force: true });
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.rowActions = [];
      });
  }

  get filtered(): Customer[] {
    const q = this.query.toLowerCase();
    return CUSTOMERS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.customerId.toLowerCase().includes(q) ||
        c.segment.toLowerCase().includes(q),
    );
  }

  getRowId = (params: GetRowIdParams<Customer>): string => params.data.customerId;

  onGridReady(event: GridReadyEvent<Customer>): void {
    this.gridApi = event.api;
  }

  get agGridTheme(): string {
    return THEMES[this.theme].agGrid;
  }

  async onGridRowClicked(event: RowClickedEvent<Customer>): Promise<void> {
    if (event.data) await this.onSelect(event.data);
  }

  async onSelect(customer: Customer): Promise<void> {
    const context = this.toContactContext(customer);
    await this.interop.broadcast(context);
    this.lastBroadcast = customer.name;
    this.cdr.markForCheck();
  }

  private renderActions(params: ICellRendererParams<Customer>): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:4px;align-items:center;height:100%;overflow:hidden';
    const customer = params.data;
    if (!customer || this.rowActions.length === 0) {
      const span = document.createElement('span');
      span.textContent = 'broadcast';
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
        void this.raiseContactIntent(customer, action);
      };
      wrap.appendChild(btn);
    }
    return wrap;
  }

  private async raiseContactIntent(customer: Customer, action: AppIntent): Promise<void> {
    this.zone.run(() => {
      this.lastBroadcast = `Raising ${action.intent.name}...`;
      this.cdr.markForCheck();
    });
    try {
      const res = await this.interop.raiseIntent(action.intent.name, this.toContactContext(customer));
      this.zone.run(() => {
        this.lastBroadcast = `${action.intent.name} -> ${res.source.appId}`;
        this.cdr.markForCheck();
      });
    } catch (err) {
      const code = (err as Error)?.message ?? String(err);
      this.zone.run(() => {
        this.lastBroadcast = code === ResolveError.NoAppsFound
          ? `No app handles ${action.intent.name}`
          : code === ResolveError.UserCancelled
          ? 'Resolver cancelled'
          : `Error: ${code}`;
        this.cdr.markForCheck();
      });
    }
  }

  private toContactContext(customer: Customer): ContactContext {
    return {
      type: 'fdc3.contact',
      name: customer.name,
      id: {
        customerId: customer.customerId,
        email: customer.email,
      },
    };
  }

  segmentBg(segment: string): string {
    return (this.segmentColors[segment] ?? '#888') + '22';
  }

  segmentColor(segment: string): string {
    return this.segmentColors[segment] ?? '#888';
  }

  trackByCustomerId(_index: number, customer: Customer): string {
    return customer.customerId;
  }
}
