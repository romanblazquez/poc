import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-search.component.html',
})
export class CustomerSearchComponent {
  @Input() theme: ThemeName = 'quartz-dark';

  query = '';
  lastBroadcast: string | null = null;
  hoveredId: string | null = null;

  readonly segmentColors = SEGMENT_COLORS;

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
