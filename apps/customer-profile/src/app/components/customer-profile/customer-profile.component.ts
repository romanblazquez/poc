import { Component, Input, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InteropService, ResolveError } from '@fdc3-poc/interop-angular';
import type {
  Channel,
  ContactContext,
  PaymentRequestContext,
  PaymentResultContext,
  PaymentStage,
  PaymentStatusContext,
  PrivateChannel,
  ThemeName,
} from '@fdc3-poc/interop-angular';
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

const STAGE_LABELS: Record<PaymentStage, string> = {
  'received': 'Received',
  'validating': 'Validating',
  'pending-approver-a': 'Pending Approver A',
  'pending-approver-b': 'Pending Approver B',
  'approved': 'Approved',
  'rejected': 'Rejected',
  'settled': 'Settled',
  'reversed': 'Reversed',
};

const STAGE_ORDER: PaymentStage[] = [
  'received',
  'validating',
  'pending-approver-a',
  'pending-approver-b',
  'approved',
  'settled',
];

interface PaymentStreamEntry {
  stage: PaymentStage;
  label: string;
  ts: string;
  message?: string;
  terminal?: boolean;
}

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

  /** Streaming-payment state — populated when StartPayment returns a PrivateChannel. */
  paymentStream: PaymentStreamEntry[] = [];
  paymentReference: string | null = null;
  paymentCurrentStage: PaymentStage | null = null;
  paymentTerminal = false;
  readonly screenStages = STAGE_ORDER;
  readonly stageLabels = STAGE_LABELS;

  private intentTimeout?: ReturnType<typeof setTimeout>;
  private activePaymentChannel?: PrivateChannel;
  private paymentChannelUnsub?: () => void;

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
    this.paymentChannelUnsub?.();
    if (this.activePaymentChannel) {
      void this.activePaymentChannel.disconnect().catch(() => undefined);
    }
  }

  /** Has this stage been reached? Drives the timeline checkmark. */
  stageReached(stage: PaymentStage): boolean {
    return this.paymentStream.some((e) => e.stage === stage);
  }

  stageTs(stage: PaymentStage): string {
    const entry = this.paymentStream.find((e) => e.stage === stage);
    if (!entry) return '';
    return new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  async handleStartPayment(): Promise<void> {
    if (!this.customer) return;
    // Reset any prior stream so the user sees a fresh timeline.
    this.resetPaymentStream();
    const ctx: PaymentRequestContext = {
      type: 'com.demo.paymentRequest',
      customerId: this.customer.customerId,
      amount: 1250,
      currency: 'EUR',
      description: `Payment for ${this.customer.name}`,
      reference: `PAY-${Date.now()}`,
    };
    this.paymentReference = ctx.reference ?? null;
    this.intentStatus = 'Routing intent…';
    this.intentSeverity = 'info';
    this.cdr.markForCheck();
    try {
      const resolution = await this.interop.raiseIntent('StartPayment', ctx);
      const result = resolution.result;
      // Modern path — handler returned a PrivateChannel; subscribe to status updates.
      if (this.isChannel(result)) {
        await this.subscribeToPaymentChannel(result);
        this.intentStatus = `Stream open — Payment Action is processing`;
        this.intentSeverity = 'info';
      } else if (this.isPaymentResultContext(result)) {
        // Legacy one-shot result — render straight to the final state.
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
    if (!this.activePaymentChannel) this.clearIntentStatusLater();
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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async subscribeToPaymentChannel(channel: Channel): Promise<void> {
    // Tear down any previous stream first.
    this.paymentChannelUnsub?.();
    if (this.activePaymentChannel && this.activePaymentChannel !== (channel as PrivateChannel)) {
      try { await this.activePaymentChannel.disconnect(); } catch { /* ignore */ }
    }
    this.activePaymentChannel = channel as PrivateChannel;
    const handle = await channel.addContextListener<PaymentStatusContext>(
      'com.demo.paymentStatus',
      (status) => this.onPaymentStatus(status),
    );
    this.paymentChannelUnsub = (): void => handle.unsubscribe();
    // React to early disconnects (window closed before settlement, etc.).
    if (typeof (channel as PrivateChannel).onDisconnect === 'function') {
      (channel as PrivateChannel).onDisconnect(() => {
        if (!this.paymentTerminal) {
          this.intentStatus = `Payment stream disconnected before settlement`;
          this.intentSeverity = 'warn';
          this.cdr.markForCheck();
        }
        this.paymentChannelUnsub?.();
        this.paymentChannelUnsub = undefined;
        this.activePaymentChannel = undefined;
      });
    }
  }

  private onPaymentStatus(status: PaymentStatusContext): void {
    if (this.paymentReference && status.reference !== this.paymentReference) return;
    this.paymentCurrentStage = status.stage;
    this.paymentStream = [
      ...this.paymentStream,
      {
        stage: status.stage,
        label: STAGE_LABELS[status.stage],
        ts: status.ts,
        message: status.message,
        terminal: status.terminal,
      },
    ];
    if (status.terminal) {
      this.paymentTerminal = true;
      this.intentStatus =
        status.stage === 'settled' || status.stage === 'approved'
          ? `Settled — ${status.currency} ${status.amount.toLocaleString()} for ${status.reference}`
          : status.stage === 'rejected'
            ? `Rejected — ${status.message ?? status.reference}`
            : `${STAGE_LABELS[status.stage]} — ${status.reference}`;
      this.intentSeverity =
        status.stage === 'settled' || status.stage === 'approved' ? 'success'
        : status.stage === 'rejected' || status.stage === 'reversed' ? 'danger'
        : 'info';
    } else {
      this.intentStatus = `Stream → ${STAGE_LABELS[status.stage]}`;
      this.intentSeverity = 'info';
    }
    this.cdr.markForCheck();
  }

  private resetPaymentStream(): void {
    this.paymentStream = [];
    this.paymentReference = null;
    this.paymentCurrentStage = null;
    this.paymentTerminal = false;
    this.paymentChannelUnsub?.();
    this.paymentChannelUnsub = undefined;
    if (this.activePaymentChannel) {
      void this.activePaymentChannel.disconnect().catch(() => undefined);
      this.activePaymentChannel = undefined;
    }
  }

  private loadCustomer(customerId: string): void {
    const found = getCustomerById(customerId);
    if (!found) return;
    this.customer = found;
    this.accounts = getAccountsByCustomer(customerId);
    this.transactions = getTransactionsByCustomer(customerId);
    // Don't clear an in-flight payment stream just because the customer
    // selection moved on — the user might still want to see it complete.
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

  private isChannel(value: unknown): value is Channel {
    return !!value && typeof value === 'object'
      && typeof (value as Channel).addContextListener === 'function'
      && typeof (value as Channel).id === 'string';
  }

  private isPaymentResultContext(value: unknown): value is PaymentResultContext {
    return !!value && typeof value === 'object'
      && (value as PaymentResultContext).type === 'com.demo.paymentResult';
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
      // Don't wipe an active stream's status — only clear when nothing's live.
      if (!this.activePaymentChannel) {
        this.intentStatus = '';
        this.cdr.markForCheck();
      }
    }, 3000);
  }
}
