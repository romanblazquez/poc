import { Component, Input, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InteropService } from '@fdc3-poc/interop-angular';
import type {
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

type ScreenStatus = 'idle' | 'pending' | 'streaming' | 'approved' | 'rejected';

interface StageEntry {
  stage: PaymentStage;
  label: string;
  ts: string;
  message?: string;
  terminal?: boolean;
}

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

/**
 * Latency simulator. Pre-approval stages run automatically with small delays
 * so the raiser sees a realistic timeline streaming over the PrivateChannel.
 */
const VALIDATING_DELAY_MS = 450;
const APPROVER_A_DELAY_MS = 650;
const SETTLEMENT_DELAY_MS = 800;

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
  status: ScreenStatus = 'idle';
  fromIntent = false;
  /** Four-eyes approval state — both approvers must click before the payment is finalised. */
  approverA = false;
  approverB = false;
  currentStage: PaymentStage | null = null;
  timeline: StageEntry[] = [];

  readonly stageLabels = STAGE_LABELS;
  readonly screenStages: PaymentStage[] = [
    'received',
    'validating',
    'pending-approver-a',
    'pending-approver-b',
    'approved',
    'settled',
  ];

  private statusTimeout?: ReturnType<typeof setTimeout>;
  private currentRequestId?: string;
  private stream?: PrivateChannel;
  private streamCompleted = false;
  private pendingTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private readonly interop: InteropService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.interop.intents$<PaymentRequestContext>('StartPayment').subscribe(({ context: ctx, meta }) => {
      if (!ctx) return;
      void this.onIntent(ctx, meta?.requestId);
    });
  }

  ngOnDestroy(): void {
    if (this.statusTimeout) clearTimeout(this.statusTimeout);
    this.cancelPendingTimers();
    void this.closeStream();
  }

  /** Stage reached so far (for "active" highlighting in the timeline). */
  stageReached(stage: PaymentStage): boolean {
    const idx = this.timeline.findIndex((t) => t.stage === stage);
    return idx >= 0;
  }

  /** Local time at which the given stage entered the timeline (display-only). */
  getStageTs(stage: PaymentStage): string {
    const entry = this.timeline.find((t) => t.stage === stage);
    if (!entry) return '';
    const d = new Date(entry.ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  get canApproveA(): boolean {
    return this.status === 'streaming' && this.currentStage === 'pending-approver-a' && !this.approverA;
  }

  get canApproveB(): boolean {
    return this.status === 'streaming' && this.currentStage === 'pending-approver-b' && this.approverA && !this.approverB;
  }

  get awaitingApproval(): boolean {
    return this.status === 'streaming'
      && (this.currentStage === 'pending-approver-a' || this.currentStage === 'pending-approver-b');
  }

  async handleApproverA(): Promise<void> {
    if (!this.canApproveA) return;
    this.approverA = true;
    this.cdr.markForCheck();
    await this.advanceTo('pending-approver-b', 'Approver A signed off — awaiting Approver B');
    // Approver A automatically passes the ball to the (separate human) Approver B.
  }

  async handleApproverB(): Promise<void> {
    if (!this.canApproveB) return;
    this.approverB = true;
    this.cdr.markForCheck();
    await this.advanceTo('approved', 'Approved by 4-eyes panel');
    // Auto-settlement after a short delay.
    const t = setTimeout(() => {
      void this.advanceTo('settled', 'Funds released', true);
      this.status = 'approved';
      this.cdr.markForCheck();
    }, SETTLEMENT_DELAY_MS);
    this.pendingTimers.push(t);
  }

  async handleReject(): Promise<void> {
    if (this.status !== 'streaming') {
      // Legacy path: a one-shot reject before the streaming model kicked in.
      await this.completeIntentLegacy('rejected');
      return;
    }
    this.cancelPendingTimers();
    await this.advanceTo('rejected', 'Rejected by reviewer', true);
    this.status = 'rejected';
    this.cdr.markForCheck();
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

  // ─── Intent handling — opens the PrivateChannel, streams every stage ────

  private async onIntent(ctx: PaymentRequestContext, requestId?: string): Promise<void> {
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
    this.currentRequestId = requestId;
    this.fromIntent = true;
    this.timeline = [];
    this.approverA = false;
    this.approverB = false;
    this.currentStage = null;

    if (!requestId) {
      // No request id → can't open a PrivateChannel. Fall back to the legacy
      // one-shot completion path, which is fine for non-FDC3 callers.
      this.status = 'pending';
      this.cdr.markForCheck();
      return;
    }

    // Open the PrivateChannel and return it to the raiser. From this point on,
    // every stage change is pushed over the channel so Customer Profile (or
    // any other raiser) can render a live timeline.
    try {
      this.stream = await this.interop.createPrivateChannel();
      this.streamCompleted = false;
      await this.interop.completeIntent(requestId, this.stream);
      this.status = 'streaming';
      this.cdr.markForCheck();
    } catch (err) {
      console.warn('[payment-action] PrivateChannel unavailable, falling back to one-shot', err);
      this.stream = undefined;
      this.status = 'pending';
      this.cdr.markForCheck();
      return;
    }

    // Drive the pre-approval stages on a timer.
    await this.advanceTo('received', 'Payment instruction received');
    this.pendingTimers.push(setTimeout(() => {
      void this.advanceTo('validating', 'KYC + screening checks running');
      const t2 = setTimeout(() => {
        void this.advanceTo('pending-approver-a', '4-eyes review — awaiting Approver A');
      }, VALIDATING_DELAY_MS);
      this.pendingTimers.push(t2);
    }, APPROVER_A_DELAY_MS));
  }

  /** Append a stage to the timeline AND push it over the PrivateChannel. */
  private async advanceTo(stage: PaymentStage, message?: string, terminal = false): Promise<void> {
    const ts = new Date().toISOString();
    this.currentStage = stage;
    this.timeline = [...this.timeline, { stage, label: STAGE_LABELS[stage], ts, message, terminal }];
    this.cdr.markForCheck();

    if (this.stream) {
      const update: PaymentStatusContext = {
        type: 'com.demo.paymentStatus',
        reference: this.form.reference,
        customerId: this.form.customerId,
        amount: this.paymentTotal,
        currency: this.form.currency,
        stage,
        message,
        ts,
        terminal,
      };
      try {
        await this.stream.broadcast(update);
      } catch (err) {
        console.warn('[payment-action] failed to push status', err);
      }
      if (terminal) {
        this.streamCompleted = true;
        // Keep the channel open briefly so late subscribers catch the terminal
        // event, then disconnect to release main-process resources.
        const t = setTimeout(() => { void this.closeStream(); }, 1500);
        this.pendingTimers.push(t);
      }
    }
  }

  private async closeStream(): Promise<void> {
    if (!this.stream) return;
    try { await this.stream.disconnect(); } catch { /* ignore */ }
    this.stream = undefined;
  }

  private cancelPendingTimers(): void {
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers = [];
  }

  /** Legacy one-shot path — kept for raisers without a request id. */
  private async completeIntentLegacy(status: 'approved' | 'rejected'): Promise<void> {
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

  // For the template — mark unused-var lint quiet for stream cleanup helper.
  protected _isStreamCompleted(): boolean { return this.streamCompleted; }
}
