import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import type { ContactContext, PaymentRequestContext } from '@fdc3-poc/fdc3-core';
import type { ThemeName } from '@fdc3-poc/fdc3-core';
import {
  getCustomerById,
  getAccountsByCustomer,
  getTransactionsByCustomer,
} from '@fdc3-poc/shared-domain';
import type { Customer, Account, Transaction } from '@fdc3-poc/shared-domain';

@Component({
  selector: 'app-customer-profile',
  standalone: true,
  imports: [CommonModule, ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-profile.component.html',
})
export class CustomerProfileComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'quartz-dark';

  customer: Customer | null = null;
  accounts: Account[] = [];
  transactions: Transaction[] = [];
  intentStatus = '';

  private unsub1?: () => void;
  private unsub2?: () => void;
  private intentTimeout?: ReturnType<typeof setTimeout>;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!window.fdc3) return;

    this.unsub1 = window.fdc3.addContextListener('fdc3.contact', (ctx: ContactContext) => {
      const id = ctx.id?.customerId;
      if (!id) return;
      const found = getCustomerById(id);
      if (found) {
        this.customer = found;
        this.accounts = getAccountsByCustomer(id);
        this.transactions = getTransactionsByCustomer(id);
        this.cdr.markForCheck();
      }
    });

    this.unsub2 = window.fdc3.addIntentListener('ViewContact', (raw) => {
      const ctx = raw as ContactContext | undefined;
      if (!ctx?.id?.customerId) return;
      const found = getCustomerById(ctx.id.customerId);
      if (found) {
        this.customer = found;
        this.accounts = getAccountsByCustomer(found.customerId);
        this.transactions = getTransactionsByCustomer(found.customerId);
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.unsub1?.();
    this.unsub2?.();
    if (this.intentTimeout) clearTimeout(this.intentTimeout);
  }

  async handleStartPayment(): Promise<void> {
    if (!this.customer) return;
    const ctx: PaymentRequestContext = {
      type: 'com.demo.paymentRequest',
      customerId: this.customer.customerId,
      amount: 1250,
      currency: 'EUR',
      description: `Payment for ${this.customer.name}`,
      reference: `PAY-${Date.now()}`,
    };
    this.intentStatus = 'Routing intent…';
    this.cdr.markForCheck();
    try {
      await window.fdc3.raiseIntent('StartPayment', ctx);
      this.intentStatus = 'Payment Action opened';
    } catch {
      this.intentStatus = 'No handler for StartPayment';
    }
    this.cdr.markForCheck();
    this.intentTimeout = setTimeout(() => {
      this.intentStatus = '';
      this.cdr.markForCheck();
    }, 3000);
  }

  trackByAccountId(_index: number, acc: Account): string {
    return acc.accountId;
  }

  trackByTxId(_index: number, tx: Transaction): string {
    return tx.txId;
  }
}
