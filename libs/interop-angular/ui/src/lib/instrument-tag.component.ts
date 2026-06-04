import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Compact ticker chip — shows the symbol plus an optional last-price and
 * session-change pill. Click-to-broadcast can be added by the consumer with
 * a click handler; this component is presentation-only.
 *
 * @example
 *   <interop-instrument-tag ticker="AAPL" [price]="189.30" [change]="1.25" />
 */
@Component({
  selector: 'interop-instrument-tag',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="tag" [attr.data-trend]="trend()">
      <strong class="ticker">{{ ticker() }}</strong>
      @if (price() !== null && price() !== undefined) {
        <span class="price">{{ price() | number:'1.2-2' }}</span>
      }
      @if (change() !== null && change() !== undefined) {
        <span class="change">{{ change()! >= 0 ? '+' : '' }}{{ change() | number:'1.2-2' }}</span>
      }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }
    .tag {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 6px;
      background: var(--interop-tag-bg, var(--ws-panel-2, rgba(255,255,255,0.06)));
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.08)));
      font-size: 12px;
      line-height: 1.6;
      color: var(--interop-text, var(--ws-text, #e6e9ff));
      font-variant-numeric: tabular-nums;
    }
    .ticker { font-weight: 800; letter-spacing: 0.03em; }
    .price  { font-weight: 600; }
    .change { font-weight: 700; }
    .tag[data-trend="up"]   .change { color: var(--interop-positive, var(--ws-positive, #0f8a4b)); }
    .tag[data-trend="down"] .change { color: var(--interop-negative, var(--ws-negative, #b42318)); }
  `],
})
export class InteropInstrumentTagComponent {
  readonly ticker = input.required<string>();
  readonly price = input<number | null | undefined>(null);
  readonly change = input<number | null | undefined>(null);
  readonly trend = computed<'up' | 'down' | 'flat'>(() => {
    const c = this.change();
    if (c == null) return 'flat';
    return c > 0 ? 'up' : c < 0 ? 'down' : 'flat';
  });
}
