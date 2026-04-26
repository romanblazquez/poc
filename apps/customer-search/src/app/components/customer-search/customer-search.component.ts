import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GetRowIdParams, RowClickedEvent } from 'ag-grid-community';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { ContactContext } from '@fdc3-poc/fdc3-core';
import type { ThemeName } from '@fdc3-poc/fdc3-core';
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
  imports: [CommonModule, FormsModule, AgGridAngular, InputTextModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-search.component.html',
})
export class CustomerSearchComponent {
  @Input() theme: ThemeName = 'quartz-dark';

  query = '';
  lastBroadcast: string | null = null;
  hoveredId: string | null = null;

  readonly segmentColors = SEGMENT_COLORS;
  readonly columnDefs: ColDef<Customer>[] = [
    { field: 'name', headerName: 'Customer', minWidth: 210, flex: 1 },
    { field: 'customerId', headerName: 'ID', width: 115 },
    { field: 'segment', width: 150 },
    { field: 'relationship_manager', headerName: 'RM', width: 150 },
    { field: 'country', width: 110 },
    { field: 'relationship', headerName: 'Status', width: 115 },
  ];

  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
  };

  constructor(private cdr: ChangeDetectorRef) {}

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

  get agGridTheme(): string {
    return THEMES[this.theme].agGrid;
  }

  async onGridRowClicked(event: RowClickedEvent<Customer>): Promise<void> {
    if (event.data) await this.onSelect(event.data);
  }

  async onSelect(customer: Customer): Promise<void> {
    if (!window.fdc3) {
      alert('window.fdc3 is not available — are you running inside the Electron shell?');
      return;
    }
    const context: ContactContext = {
      type: 'fdc3.contact',
      name: customer.name,
      id: {
        customerId: customer.customerId,
        email: customer.email,
      },
    };
    await window.fdc3.broadcast(context);
    this.lastBroadcast = customer.name;
    this.cdr.markForCheck();
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
