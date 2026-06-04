import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Workstation header chrome — the row of "MARK · Title · spacer · actions"
 * that sits at the top of every app in this POC. Replaces the open-coded
 * `.ws-header > .ws-title + …` blocks duplicated across all apps.
 *
 * Slots:
 *  - default `<ng-content>`: right-aligned actions (badges, buttons, channel picker)
 *  - `slot="title-after"`: anything you want right after the title text
 *
 * @example
 *   <interop-workstation-header mark="OT" title="Order Ticket">
 *     <interop-status-badge label="Live" severity="success" />
 *     <interop-channel-picker />
 *   </interop-workstation-header>
 */
@Component({
  selector: 'interop-workstation-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="ws">
      <div class="title">
        @if (mark()) { <span class="mark">{{ mark() }}</span> }
        <span class="text">{{ title() }}</span>
        <ng-content select="[slot=title-after]" />
      </div>
      <div class="actions"><ng-content /></div>
    </header>
  `,
  styles: [`
    :host { display: block; }
    .ws {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      min-height: 44px;
      gap: 12px;
      background: var(--interop-header-bg, var(--ws-panel, rgba(255,255,255,0.02)));
      border-bottom: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.08)));
    }
    .title {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 0 1 auto;
    }
    .mark {
      display: inline-grid;
      place-items: center;
      width: 28px; height: 28px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 11px;
      letter-spacing: 0.04em;
      background: var(--interop-mark-bg, var(--ws-panel-2, rgba(255,255,255,0.06)));
      color: var(--interop-muted, var(--ws-muted, #8d93b8));
      border: 1px solid var(--interop-border, var(--ws-border, rgba(255,255,255,0.08)));
    }
    .text {
      font-weight: 800;
      font-size: 14px;
      color: var(--interop-text, var(--ws-text, #e6e9ff));
      letter-spacing: 0.01em;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1 1 auto;
      justify-content: flex-end;
      min-width: 0;
    }
  `],
})
export class InteropWorkstationHeaderComponent {
  readonly title = input.required<string>();
  readonly mark = input<string | null | undefined>(null);
}
