import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import type {
  IntentInvocationMetadata,
  InstrumentContext,
  OrderStatusContext,
  PrivateChannel,
  ThemeName,
  TraderOrderContext,
} from '@fdc3-poc/fdc3-core';
import { getQuoteByTicker } from '@fdc3-poc/shared-domain';

type Side = 'Buy' | 'Sell';
type OrderType = 'Market' | 'Limit';
type Tif = 'DAY' | 'IOC' | 'GTC' | 'FOK';

interface TicketForm {
  ticker: string;
  instrumentName: string;
  isin: string;
  side: Side;
  orderType: OrderType;
  quantity: number;
  limitPrice: number | null;
  tif: Tif;
  venue: string;
  account: string;
  currency: string;
}

interface StatusRow {
  ts: string;
  status: string;
  message?: string;
  filledQty?: number;
  avgPrice?: number;
}

/** Body of a status update — same shape as OrderStatusContext minus the FDC3 envelope fields. */
interface StatusUpdate {
  status: OrderStatusContext['status'];
  filledQty?: number;
  remainingQty?: number;
  avgPrice?: number;
  lastPrice?: number;
  lastQty?: number;
  message?: string;
}

const VENUES = ['NASDAQ', 'NYSE', 'XETRA', 'BME', 'ARCA', 'SmartRouter'];
const ACCOUNTS = ['DESK-PROP', 'DESK-CLIENT', 'AGENCY', 'PB-1001', 'PB-1002'];
const QUICK_QTY = [100, 500, 1000, 5000];

function makeEmptyForm(): TicketForm {
  return {
    ticker: '',
    instrumentName: '',
    isin: '',
    side: 'Buy',
    orderType: 'Limit',
    quantity: 100,
    limitPrice: null,
    tif: 'DAY',
    venue: 'SmartRouter',
    account: 'DESK-PROP',
    currency: 'USD',
  };
}

@Component({
  selector: 'app-order-ticket',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectButtonModule,
    SelectModule,
    TagModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-ticket.component.html',
})
export class OrderTicketComponent implements OnInit, OnDestroy {
  @Input() theme: ThemeName = 'dark-financial';

  form: TicketForm = makeEmptyForm();
  readonly venues = VENUES.map((v) => ({ label: v, value: v }));
  readonly accounts = ACCOUNTS.map((v) => ({ label: v, value: v }));
  readonly quickQty = QUICK_QTY;
  readonly sides: Array<{ label: Side; value: Side }> = [
    { label: 'Buy', value: 'Buy' },
    { label: 'Sell', value: 'Sell' },
  ];
  readonly orderTypes: Array<{ label: OrderType; value: OrderType }> = [
    { label: 'Market', value: 'Market' },
    { label: 'Limit', value: 'Limit' },
  ];
  readonly tifs: Array<{ label: Tif; value: Tif }> = [
    { label: 'DAY', value: 'DAY' },
    { label: 'IOC', value: 'IOC' },
    { label: 'GTC', value: 'GTC' },
    { label: 'FOK', value: 'FOK' },
  ];

  lastBroadcast: { orderId: string; ts: string } | null = null;
  streamingOrderId: string | null = null;
  statusFeed: StatusRow[] = [];
  intentBanner: string | null = null;

  private unsubInstrumentCtx?: () => void;
  private unsubCreateOrder?: () => void;
  private unsubStartOrder?: () => void;
  private activeStream?: PrivateChannel;
  private streamTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!window.fdc3) return;

    this.unsubInstrumentCtx = window.fdc3.addContextListener<InstrumentContext>(
      'fdc3.instrument',
      (ctx) => this.applyInstrument(ctx),
    );

    this.unsubCreateOrder = window.fdc3.addIntentListener(
      'CreateOrder',
      (ctx, meta) => this.handleIntent('CreateOrder', ctx as InstrumentContext | undefined, meta),
    );
    this.unsubStartOrder = window.fdc3.addIntentListener(
      'StartOrder',
      (ctx, meta) => this.handleIntent('StartOrder', ctx as InstrumentContext | undefined, meta),
    );
  }

  ngOnDestroy(): void {
    this.unsubInstrumentCtx?.();
    this.unsubCreateOrder?.();
    this.unsubStartOrder?.();
    this.disposeStream();
  }

  get notional(): number {
    const price =
      this.form.orderType === 'Limit'
        ? this.form.limitPrice ?? 0
        : this.referencePrice;
    return Number(this.form.quantity ?? 0) * Number(price ?? 0);
  }

  get referencePrice(): number {
    if (!this.form.ticker) return 0;
    const q = getQuoteByTicker(this.form.ticker);
    return q?.price ?? 0;
  }

  get canSubmit(): boolean {
    if (!this.form.ticker) return false;
    if (!this.form.quantity || this.form.quantity <= 0) return false;
    if (this.form.orderType === 'Limit' && (!this.form.limitPrice || this.form.limitPrice <= 0)) return false;
    return true;
  }

  /** Quick-fill the qty input. */
  setQuickQty(qty: number): void {
    this.form.quantity = qty;
  }

  applyReferencePrice(): void {
    if (this.form.orderType !== 'Limit') return;
    if (!this.referencePrice) return;
    this.form.limitPrice = this.referencePrice;
  }

  resetTicket(): void {
    this.disposeStream();
    this.form = makeEmptyForm();
    this.lastBroadcast = null;
    this.streamingOrderId = null;
    this.statusFeed = [];
    this.intentBanner = null;
    this.cdr.markForCheck();
  }

  /**
   * Submit handler — both for the standalone path (no intent) and the
   * intent-driven path. When called from an intent, `pendingRequestId` is set
   * and we return a PrivateChannel via `completeIntent`.
   */
  async submit(): Promise<void> {
    if (!this.canSubmit) return;

    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const orderCtx: TraderOrderContext = {
      type: 'com.demo.traderOrder',
      orderId,
      instrument: { ticker: this.form.ticker, ISIN: this.form.isin, name: this.form.instrumentName },
      side: this.form.side,
      orderType: this.form.orderType,
      quantity: this.form.quantity,
      limitPrice: this.form.orderType === 'Limit' ? this.form.limitPrice ?? undefined : undefined,
      tif: this.form.tif,
      venue: this.form.venue,
      account: this.form.account,
      currency: this.form.currency,
      notional: this.notional,
      status: 'New',
      createdAt: now,
      name: `${this.form.side} ${this.form.quantity} ${this.form.ticker} @ ${this.form.orderType === 'Limit' ? this.form.limitPrice : 'Market'}`,
    };

    if (!window.fdc3) return;

    // Always broadcast the order so any blotter on the same channel sees it.
    await window.fdc3.broadcast(orderCtx);
    this.lastBroadcast = { orderId, ts: now };
    this.appendStatus({ ts: now, status: 'New', message: 'Order routed to venue' });

    if (this.pendingRequestId) {
      await this.completeIntentWithStream(orderCtx);
    } else {
      // Standalone path: still stream simulated venue updates locally
      // (and over any active PrivateChannel from a previous intent if present).
      this.streamingOrderId = orderId;
      this.scheduleSimulatedFills(orderCtx);
    }

    this.cdr.markForCheck();
  }

  private async handleIntent(
    intentName: 'CreateOrder' | 'StartOrder',
    ctx: InstrumentContext | undefined,
    meta?: IntentInvocationMetadata,
  ): Promise<void> {
    if (!ctx) return;
    this.applyInstrument(ctx);
    this.intentBanner = `Intent ${intentName} received — review and submit`;
    this.pendingRequestId = meta?.requestId;
    this.cdr.markForCheck();
  }

  private pendingRequestId: string | undefined;

  /**
   * For intent-driven submissions: create a PrivateChannel, return it as the
   * intent result via `completeIntent`, then push simulated fills/updates on it.
   */
  private async completeIntentWithStream(order: TraderOrderContext): Promise<void> {
    if (!window.fdc3 || !this.pendingRequestId) return;
    const stream = await window.fdc3.createPrivateChannel();
    this.activeStream = stream;
    this.streamingOrderId = order.orderId;
    await window.fdc3.completeIntent(this.pendingRequestId, stream);
    this.pendingRequestId = undefined;
    this.intentBanner = `Streaming on private channel ${stream.id.slice(0, 14)}…`;
    this.scheduleSimulatedFills(order);
    this.cdr.markForCheck();
  }

  /**
   * Push a small sequence of OrderStatusContext events to the active
   * PrivateChannel (or just the local feed, if standalone). Demonstrates the
   * FDC3 follow-up pattern without needing a real OMS.
   */
  private scheduleSimulatedFills(order: TraderOrderContext): void {
    const remaining = order.quantity;
    const refPrice = order.orderType === 'Limit' ? order.limitPrice ?? this.referencePrice : this.referencePrice;
    const firstFill = Math.round(remaining * 0.4);
    const secondFill = remaining - firstFill;

    this.streamTimers.push(setTimeout(() => this.pushStatus(order, {
      status: 'Working', message: 'Acknowledged by venue',
    }), 350));

    this.streamTimers.push(setTimeout(() => this.pushStatus(order, {
      status: 'PartiallyFilled',
      filledQty: firstFill,
      remainingQty: remaining - firstFill,
      avgPrice: refPrice,
      lastQty: firstFill,
      lastPrice: refPrice,
      message: `Partial fill ${firstFill}`,
    }), 1100));

    this.streamTimers.push(setTimeout(() => this.pushStatus(order, {
      status: 'Filled',
      filledQty: remaining,
      remainingQty: 0,
      avgPrice: refPrice,
      lastQty: secondFill,
      lastPrice: refPrice,
      message: 'Order fully filled',
    }), 2100));
  }

  private async pushStatus(order: TraderOrderContext, partial: StatusUpdate): Promise<void> {
    const ts = new Date().toISOString();
    const status: OrderStatusContext = { ...partial, type: 'com.demo.orderStatus', orderId: order.orderId, ts };
    this.appendStatus({
      ts,
      status: status.status,
      message: status.message,
      filledQty: status.filledQty,
      avgPrice: status.avgPrice,
    });
    if (this.activeStream) {
      try { await this.activeStream.broadcast(status); } catch (e) { console.error('[order-ticket] stream broadcast failed', e); }
    }
    // Also broadcast on the user channel so any subscribed blotter sees fills.
    if (window.fdc3) {
      try { await window.fdc3.broadcast(status); } catch (e) { console.error('[order-ticket] context broadcast failed', e); }
    }
    this.cdr.markForCheck();
  }

  private applyInstrument(ctx: InstrumentContext | undefined): void {
    if (!ctx?.id?.ticker) return;
    const ticker = ctx.id.ticker;
    const quote = getQuoteByTicker(ticker);
    this.form = {
      ...this.form,
      ticker,
      instrumentName: ctx.name ?? quote?.name ?? ticker,
      isin: ctx.id.ISIN ?? quote?.isin ?? '',
      currency: quote?.currency ?? this.form.currency,
      limitPrice: this.form.orderType === 'Limit' ? quote?.price ?? this.form.limitPrice : this.form.limitPrice,
    };
    this.cdr.markForCheck();
  }

  private appendStatus(row: StatusRow): void {
    this.statusFeed = [row, ...this.statusFeed].slice(0, 20);
  }

  private disposeStream(): void {
    for (const t of this.streamTimers) clearTimeout(t);
    this.streamTimers = [];
    if (this.activeStream) {
      void this.activeStream.disconnect().catch(() => undefined);
      this.activeStream = undefined;
    }
  }

  trackByStatus(_i: number, row: StatusRow): string {
    return row.ts + row.status;
  }
}
