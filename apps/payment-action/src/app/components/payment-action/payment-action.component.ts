import { Component, Input, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InteropService } from '@fdc3-poc/interop-angular';
import type { PaymentRequestContext, PaymentResultContext, ThemeName } from '@fdc3-poc/interop-angular';
import {
  InteropChannelPickerComponent,
  InteropEmptyStateComponent,
  InteropStatusBadgeComponent,
  InteropWorkstationHeaderComponent,
} from '@fdc3-poc/interop-angular/ui';
import { getCustomerById } from '@fdc3-poc/shared-domain';

interface PaymentForm {
  customerId: string;
  customerName: string;
  amount: string;
  currency: string;
  reference: string;
  description: string;
  recipientName: string;
  recipientIban: string;
}

type PaymentStatus = 'idle' | 'pending' | 'approved' | 'rejected';

const EMPTY_FORM: PaymentForm = {
  customerId: '',
  customerName: '',
  amount: '',
  currency: 'EUR',
  reference: '',
  description: '',
  recipientName: '',
  recipientIban: '',
};

@Component({
  selector: 'app-payment-action',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    InteropChannelPickerComponent,
    InteropEmptyStateComponent,
    InteropStatusBadgeComponent,
    InteropWorkstationHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payment-action.component.html',
})
export class PaymentActionComponent implements OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  form: PaymentForm = { ...EMPTY_FORM };
  status: PaymentStatus = 'idle';
  fromIntent = false;

  private statusTimeout?: ReturnType<typeof setTimeout>;
  private currentRequestId?: string;

  constructor(
    private readonly interop: InteropService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.interop.intents$<PaymentRequestContext>('StartPayment').subscribe(({ context: ctx, meta }) => {
      if (!ctx) return;
      const customer = ctx.customerId ? getCustomerById(ctx.customerId) : null;
      this.form = {
        customerId: ctx.customerId ?? '',
        customerName: customer?.name ?? ctx.customerId ?? '',
        amount: String(ctx.amount ?? ''),
        currency: ctx.currency ?? 'EUR',
        reference: ctx.reference ?? `PAY-${Date.now()}`,
        description: ctx.description ?? '',
        recipientName: customer?.name ?? '',
        recipientIban: '',
      };
      this.currentRequestId = meta?.requestId;
      this.fromIntent = true;
      this.status = 'pending';
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    if (this.statusTimeout) clearTimeout(this.statusTimeout);
  }

  async handleApprove(): Promise<void> {
    await this.completeIntent('approved');
  }

  async handleReject(): Promise<void> {
    await this.completeIntent('rejected');
  }

  private async completeIntent(status: 'approved' | 'rejected'): Promise<void> {
    const requestId = this.currentRequestId;
    const result: PaymentResultContext = {
      type: 'com.demo.paymentResult',
      status,
      reference: this.form.reference,
      customerId: this.form.customerId,
      amount: this.paymentTotal,
      currency: this.form.currency,
      message: status === 'approved' ? `Payment ${this.form.reference} approved` : `Payment ${this.form.reference} rejected`,
    };

    if (this.fromIntent && requestId) {
      this.status = status;
      this.cdr.markForCheck();
      await this.interop.completeIntent(requestId, result);
      await this.interop.closeWindow();
      return;
    }

    this.status = status;
    this.cdr.markForCheck();
    this.statusTimeout = setTimeout(() => {
      this.status = 'idle';
      this.form = { ...EMPTY_FORM };
      this.fromIntent = false;
      this.currentRequestId = undefined;
      this.cdr.markForCheck();
    }, status === 'approved' ? 3000 : 2000);
  }

  handleNew(): void {
    this.form = { ...EMPTY_FORM, currency: 'EUR', reference: `PAY-${Date.now()}` };
    this.status = 'pending';
    this.fromIntent = false;
    this.currentRequestId = undefined;
    this.cdr.markForCheck();
  }

  get paymentTotal(): number {
    return Number(this.form.amount || 0);
  }
}
