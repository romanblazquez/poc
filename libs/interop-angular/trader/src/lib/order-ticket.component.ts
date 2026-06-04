import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InteropSideToggleComponent } from '@fdc3-poc/interop-angular/ui';
import type { InteropSide } from '@fdc3-poc/interop-angular/ui';

export type OrderType = 'Market' | 'Limit';
export type OrderTif = 'DAY' | 'IOC' | 'GTC' | 'FOK';

export interface OrderTicketFormValue {
  ticker: string;
  instrumentName: string;
  isin?: string;
  side: InteropSide;
  orderType: OrderType;
  quantity: number;
  limitPrice: number | null;
  tif: OrderTif;
  venue: string;
  account: string;
  currency: string;
}

export interface OrderTicketSubmit extends OrderTicketFormValue {
  /** Estimated notional = qty × (limit or last). */
  notional: number;
}

const DEFAULT_VENUES = ['NASDAQ', 'NYSE', 'XETRA', 'BME', 'ARCA', 'SmartRouter'];
const DEFAULT_ACCOUNTS = ['DESK-PROP', 'DESK-CLIENT', 'AGENCY', 'PB-1001'];

/**
 * Reusable, self-contained order ticket. Pre-fillable by the parent via the
 * `prefill` signal input; emits `(submit)` with the full form value plus a
 * computed notional. **No FDC3 coupling** — the parent decides whether to
 * `broadcast()` the resulting order, raise an intent, or both. Designed to be
 * dropped into any Angular 21 app, including a cloud-served one.
 *
 * @example
 *   <interop-order-ticket
 *     [prefill]="ticketPrefill()"
 *     [referencePrice]="lastPrice()"
 *     (submit)="onSubmit($event)" />
 */
@Component({
  selector: 'interop-order-ticket',
  standalone: true,
  imports: [CommonModule, FormsModule, InteropSideToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="ticket" (submit)="$event.preventDefault(); doSubmit()">
      <!-- Instrument header -->
      <div class="row two">
        <div class="cell">
          <div class="label">Instrument</div>
          <input class="input" type="text" [(ngModel)]="form().ticker" name="ticker"
                 placeholder="Ticker" (input)="onFieldChange()" />
        </div>
        <div class="cell">
          <div class="label">Name</div>
          <input class="input" type="text" [(ngModel)]="form().instrumentName" name="name"
                 placeholder="Instrument name" (input)="onFieldChange()" />
        </div>
      </div>

      <!-- Side / type -->
      <div class="row two">
        <div class="cell">
          <div class="label">Side</div>
          <interop-side-toggle [(side)]="form().side" />
        </div>
        <div class="cell">
          <div class="label">Order type</div>
          <div class="seg">
            <button type="button" class="seg-btn" [class.active]="form().orderType === 'Market'"
                    (click)="setOrderType('Market')">Market</button>
            <button type="button" class="seg-btn" [class.active]="form().orderType === 'Limit'"
                    (click)="setOrderType('Limit')">Limit</button>
          </div>
        </div>
      </div>

      <!-- Quantity -->
      <div class="cell">
        <div class="label">Quantity</div>
        <input class="input" type="number" min="0" [(ngModel)]="form().quantity" name="qty"
               (input)="onFieldChange()" />
        <div class="quick">
          @for (q of quickQty; track q) {
            <button type="button" class="chip" (click)="setQty(q)">{{ q }}</button>
          }
        </div>
      </div>

      <!-- Limit price -->
      @if (form().orderType === 'Limit') {
        <div class="cell">
          <div class="label">Limit price ({{ form().currency }})</div>
          <input class="input" type="number" step="0.01" min="0"
                 [ngModel]="form().limitPrice" name="limit"
                 (ngModelChange)="setLimit($event)" />
        </div>
      }

      <!-- TIF / Venue / Account -->
      <div class="row three">
        <div class="cell">
          <div class="label">TIF</div>
          <select class="input" [(ngModel)]="form().tif" name="tif" (change)="onFieldChange()">
            @for (t of tifs; track t) { <option [value]="t">{{ t }}</option> }
          </select>
        </div>
        <div class="cell">
          <div class="label">Venue</div>
          <select class="input" [(ngModel)]="form().venue" name="venue" (change)="onFieldChange()">
            @for (v of venues(); track v) { <option [value]="v">{{ v }}</option> }
          </select>
        </div>
        <div class="cell">
          <div class="label">Account</div>
          <select class="input" [(ngModel)]="form().account" name="account" (change)="onFieldChange()">
            @for (a of accounts(); track a) { <option [value]="a">{{ a }}</option> }
          </select>
        </div>
      </div>

      <!-- Notional + submit -->
      <div class="notional">
        <span class="label">Estimated notional</span>
        <span class="value">{{ form().currency }} {{ notional() | number:'1.2-2' }}</span>
      </div>

      <button type="submit" class="submit"
              [class.buy]="form().side === 'Buy'" [class.sell]="form().side === 'Sell'"
              [disabled]="!canSubmit()">
        {{ form().side === 'Buy' ? 'Buy' : 'Sell' }} {{ form().quantity || 0 | number }} {{ form().ticker || '—' }}
      </button>
    </form>
  `,
  styles: [`
    :host { display: block; }
    .ticket {
      display: flex; flex-direction: column; gap: 10px;
      padding: 14px;
      background: var(--interop-card-bg, var(--ws-panel, rgba(255,255,255,0.02)));
      border-radius: 10px;
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.08)));
    }
    .row { display: grid; gap: 10px; }
    .row.two { grid-template-columns: 1fr 1fr; }
    .row.three { grid-template-columns: 1fr 1fr 1fr; }
    .cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .label {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--interop-muted, var(--ws-muted, #8d93b8)); font-weight: 700;
    }
    .input {
      width: 100%; box-sizing: border-box;
      padding: 7px 9px; font-size: 13px;
      background: var(--interop-input-bg, var(--ws-panel-2, rgba(255,255,255,0.04)));
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.12)));
      border-radius: 6px; color: var(--interop-text, var(--ws-text, #e6e9ff));
      outline: none;
    }
    .input:focus { border-color: var(--interop-accent, var(--ws-accent, #4080e8)); }
    .quick { display: flex; gap: 4px; flex-wrap: wrap; }
    .chip {
      padding: 3px 9px; font-size: 11px; border-radius: 999px;
      background: var(--interop-chip-bg, transparent);
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.12)));
      color: var(--interop-text, var(--ws-text, #e6e9ff));
      cursor: pointer;
    }
    .chip:hover { background: var(--interop-chip-hover, rgba(255,255,255,0.06)); }
    .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .seg-btn {
      padding: 6px 10px; font-size: 12px; font-weight: 700; border-radius: 6px;
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.12)));
      background: transparent; color: var(--interop-muted, var(--ws-muted, #8d93b8));
      cursor: pointer;
    }
    .seg-btn.active {
      background: var(--interop-accent, var(--ws-accent, #4080e8));
      border-color: var(--interop-accent, var(--ws-accent, #4080e8));
      color: #fff;
    }
    .notional {
      display: flex; justify-content: space-between; align-items: baseline;
      padding: 10px 12px;
      background: var(--interop-input-bg, var(--ws-panel-2, rgba(255,255,255,0.04)));
      border-radius: 8px;
    }
    .notional .label { font-size: 11px; }
    .notional .value {
      font-size: 18px; font-weight: 900; font-variant-numeric: tabular-nums;
      color: var(--interop-text, var(--ws-text, #e6e9ff));
    }
    .submit {
      padding: 11px; border-radius: 8px; border: 0;
      font-size: 14px; font-weight: 800; cursor: pointer;
      color: #fff;
      background: var(--interop-accent, var(--ws-accent, #4080e8));
    }
    .submit.buy  { background: var(--interop-positive, var(--ws-positive, #0f8a4b)); }
    .submit.sell { background: var(--interop-negative, var(--ws-negative, #b42318)); }
    .submit:disabled { opacity: 0.5; cursor: not-allowed; }
  `],
})
export class InteropOrderTicketComponent {
  /** Optional initial form values. Re-applied whenever the input identity changes. */
  readonly prefill = input<Partial<OrderTicketFormValue> | null>(null);
  /** Reference price used when notional is computed for a Market order. */
  readonly referencePrice = input<number | null>(null);
  /** Override the default list of venues. */
  readonly venues = input<readonly string[]>(DEFAULT_VENUES);
  /** Override the default list of accounts. */
  readonly accounts = input<readonly string[]>(DEFAULT_ACCOUNTS);

  @Output() readonly submit = new EventEmitter<OrderTicketSubmit>();
  @Output() readonly formChange = new EventEmitter<OrderTicketFormValue>();

  readonly tifs: readonly OrderTif[] = ['DAY', 'IOC', 'GTC', 'FOK'];
  readonly quickQty = [100, 500, 1000, 5000];

  private readonly _form = signal<OrderTicketFormValue>({
    ticker: '',
    instrumentName: '',
    isin: undefined,
    side: 'Buy',
    orderType: 'Limit',
    quantity: 100,
    limitPrice: null,
    tif: 'DAY',
    venue: DEFAULT_VENUES[5],
    account: DEFAULT_ACCOUNTS[0],
    currency: 'USD',
  });
  readonly form = this._form.asReadonly();

  readonly notional = computed(() => {
    const f = this._form();
    const price = f.orderType === 'Limit' ? (f.limitPrice ?? 0) : (this.referencePrice() ?? 0);
    return (Number(f.quantity) || 0) * (Number(price) || 0);
  });

  readonly canSubmit = computed(() => {
    const f = this._form();
    if (!f.ticker || (f.quantity ?? 0) <= 0) return false;
    if (f.orderType === 'Limit' && (!f.limitPrice || f.limitPrice <= 0)) return false;
    return true;
  });

  constructor() {
    // Apply prefill on every change to the input.
    const initial = this.prefill();
    if (initial) this._form.update((f) => ({ ...f, ...initial }));
  }

  /** Imperative re-fill — useful when the parent receives a new fdc3.instrument. */
  applyPrefill(p: Partial<OrderTicketFormValue>): void {
    this._form.update((f) => ({ ...f, ...p }));
    this.formChange.emit(this._form());
  }

  setQty(qty: number): void {
    this._form.update((f) => ({ ...f, quantity: qty }));
    this.onFieldChange();
  }

  setLimit(value: number | null): void {
    this._form.update((f) => ({ ...f, limitPrice: value }));
    this.onFieldChange();
  }

  setOrderType(t: OrderType): void {
    this._form.update((f) => ({ ...f, orderType: t }));
    this.onFieldChange();
  }

  onFieldChange(): void {
    this.formChange.emit(this._form());
  }

  doSubmit(): void {
    if (!this.canSubmit()) return;
    this.submit.emit({ ...this._form(), notional: this.notional() });
  }
}
