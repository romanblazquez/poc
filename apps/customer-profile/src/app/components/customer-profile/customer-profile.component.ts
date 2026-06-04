import { Component, Input, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InteropService, ResolveError } from '@fdc3-poc/interop-angular';
import type { ContactContext, PaymentRequestContext, PaymentResultContext, ThemeName } from '@fdc3-poc/interop-angular';
import {
  InteropChannelPickerComponent,
  InteropEmptyStateComponent,
  InteropStatusBadgeComponent,
  InteropWorkstationHeaderComponent,
} from '@fdc3-poc/interop-angular/ui';
import {
  getCustomerById,
  getAccountsByCustomer,
  getTransactionsByCustomer,
} from '@fdc3-poc/shared-domain';
import type { Customer, Account, Transaction } from '@fdc3-poc/shared-domain';

@Component({
  selector: 'app-customer-profile',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    InteropChannelPickerComponent,
    InteropEmptyStateComponent,
    InteropStatusBadgeComponent,
    InteropWorkstationHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-profile.component.html',
})
export class CustomerProfileComponent implements OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  customer: Customer | null = null;
  accounts: Account[] = [];
  transactions: Transaction[] = [];
  intentStatus = '';
  intentSeverity: 'success' | 'warn' | 'danger' | 'info' = 'info';

  private intentTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly interop: InteropService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.interop.contexts$<ContactContext>('fdc3.contact').subscribe((ctx) => {
      const id = ctx.id?.customerId;
      if (!id) return;
      this.loadCustomer(id);
    });

    this.interop.intents$<ContactContext>('ViewContact').subscribe(({ context }) => {
      if (context?.id?.customerId) this.loadCustomer(context.id.customerId);
    });
  }

  ngOnDestroy(): void {
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
    this.intentSeverity = 'info';
    this.cdr.markForCheck();
    try {
      const resolution = await this.interop.raiseIntent('StartPayment', ctx);
      const result = resolution.result as PaymentResultContext | undefined;
      if (result?.type === 'com.demo.paymentResult') {
        this.intentStatus =
          result.status === 'approved'
            ? `Payment approved: ${result.currency} ${result.amount.toLocaleString()}`
            : `Payment rejected: ${result.reference}`;
        this.intentSeverity = result.status === 'approved' ? 'success' : 'danger';
      } else {
        this.intentStatus = 'Payment completed';
        this.intentSeverity = 'success';
      }
    } catch (err) {
      this.intentStatus = this.intentErrorMessage(err, 'StartPayment');
      this.intentSeverity = 'danger';
    }
    this.cdr.markForCheck();
    this.clearIntentStatusLater();
  }

  async handleViewPortfolio(): Promise<void> {
    if (!this.customer) return;
    this.intentStatus = 'Routing portfolio...';
    this.intentSeverity = 'info';
    this.cdr.markForCheck();
    try {
      const resolution = await this.interop.raiseIntent('ViewPortfolio', this.toContactContext());
      this.intentStatus = `Portfolio -> ${resolution.source.appId}`;
      this.intentSeverity = 'success';
    } catch (err) {
      this.intentStatus = this.intentErrorMessage(err, 'ViewPortfolio');
      this.intentSeverity = 'danger';
    }
    this.cdr.markForCheck();
    this.clearIntentStatusLater();
  }

  trackByAccountId(_index: number, acc: Account): string {
    return acc.accountId;
  }

  trackByTxId(_index: number, tx: Transaction): string {
    return tx.txId;
  }

  private loadCustomer(customerId: string): void {
    const found = getCustomerById(customerId);
    if (!found) return;
    this.customer = found;
    this.accounts = getAccountsByCustomer(customerId);
    this.transactions = getTransactionsByCustomer(customerId);
    this.cdr.markForCheck();
  }

  private toContactContext(): ContactContext {
    if (!this.customer) throw new Error('No customer selected');
    return {
      type: 'fdc3.contact',
      name: this.customer.name,
      id: {
        customerId: this.customer.customerId,
        email: this.customer.email,
      },
    };
  }

  private intentErrorMessage(err: unknown, intent: string): string {
    const code = (err as Error)?.message ?? String(err);
    if (code === ResolveError.NoAppsFound) return `No handler for ${intent}`;
    if (code === ResolveError.UserCancelled) return 'Resolver cancelled';
    return `Error: ${code}`;
  }

  private clearIntentStatusLater(): void {
    if (this.intentTimeout) clearTimeout(this.intentTimeout);
    this.intentTimeout = setTimeout(() => {
      this.intentStatus = '';
      this.cdr.markForCheck();
    }, 3000);
  }
}
