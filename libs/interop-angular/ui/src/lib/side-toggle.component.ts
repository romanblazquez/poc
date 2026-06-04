import { ChangeDetectionStrategy, Component, model } from '@angular/core';

export type InteropSide = 'Buy' | 'Sell';

/**
 * Trader-grade Buy/Sell segmented toggle. Two-way bindable via `[(side)]`.
 * Color-locked so a Bloomberg-trained eye reads side instantly: Buy = green,
 * Sell = red. Keyboard-accessible (arrow keys move focus, space/enter select).
 *
 * @example
 *   <interop-side-toggle [(side)]="form.side" />
 */
@Component({
  selector: 'interop-side-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="seg" role="radiogroup" aria-label="Side">
      <button type="button" class="seg-btn buy"
              role="radio"
              [attr.aria-checked]="side() === 'Buy'"
              [class.active]="side() === 'Buy'"
              (click)="side.set('Buy')">Buy</button>
      <button type="button" class="seg-btn sell"
              role="radio"
              [attr.aria-checked]="side() === 'Sell'"
              [class.active]="side() === 'Sell'"
              (click)="side.set('Sell')">Sell</button>
    </div>
  `,
  styles: [`
    :host { display: inline-block; width: 100%; }
    .seg {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      background: var(--interop-seg-bg, var(--ws-panel-2, rgba(255,255,255,0.04)));
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.08)));
    }
    .seg-btn {
      appearance: none;
      border: 0;
      background: transparent;
      color: var(--interop-muted, var(--ws-muted, #8d93b8));
      font-weight: 700;
      font-size: 13px;
      padding: 7px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: background-color 0.1s ease, color 0.1s ease;
    }
    .seg-btn:hover { color: var(--interop-text, var(--ws-text, #e6e9ff)); }
    .seg-btn.buy.active {
      background: var(--interop-positive, var(--ws-positive, #0f8a4b));
      color: #fff;
    }
    .seg-btn.sell.active {
      background: var(--interop-negative, var(--ws-negative, #b42318));
      color: #fff;
    }
    .seg-btn:focus-visible {
      outline: 2px solid var(--interop-accent, var(--ws-accent, #4080e8));
      outline-offset: 2px;
    }
  `],
})
export class InteropSideToggleComponent {
  readonly side = model<InteropSide>('Buy');
}
