import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Standard empty-state card. Title, optional message, optional 2-letter
 * "mark" badge, and content-projection slot for a CTA button.
 *
 * @example
 *   <interop-empty-state mark="OB" title="No orders yet"
 *                       message="Submit a Buy/Sell from the ticket to populate this blotter.">
 *     <button>New Order</button>
 *   </interop-empty-state>
 */
@Component({
  selector: 'interop-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      @if (mark()) { <div class="mark">{{ mark() }}</div> }
      <div class="title">{{ title() }}</div>
      @if (message()) { <div class="message">{{ message() }}</div> }
      <div class="cta"><ng-content /></div>
    </div>
  `,
  styles: [`
    :host { display: flex; align-items: center; justify-content: center; width: 100%; }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 32px 24px;
      text-align: center;
      color: var(--interop-muted, var(--ws-muted, #8d93b8));
    }
    .mark {
      width: 48px; height: 48px;
      border-radius: 12px;
      display: grid; place-items: center;
      background: var(--interop-mark-bg, var(--ws-panel-2, rgba(255,255,255,0.06)));
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.08)));
      font-weight: 800;
      font-size: 16px;
      color: var(--interop-muted, var(--ws-muted, #8d93b8));
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }
    .title {
      font-weight: 800;
      font-size: 15px;
      color: var(--interop-text, var(--ws-text, #e6e9ff));
    }
    .message { font-size: 13px; max-width: 340px; line-height: 1.5; }
    .cta:empty { display: none; }
    .cta { margin-top: 6px; }
  `],
})
export class InteropEmptyStateComponent {
  readonly title = input.required<string>();
  readonly message = input<string | null | undefined>(null);
  readonly mark = input<string | null | undefined>(null);
}
