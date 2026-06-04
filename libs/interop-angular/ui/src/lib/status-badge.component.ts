import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type InteropSeverity = 'info' | 'success' | 'warn' | 'danger' | 'muted';

/**
 * Compact pill-style severity badge. Drop-in replacement for `<p-tag>` /
 * MatChip in apps that don't want a UI-framework dependency.
 *
 * @example
 *   <interop-status-badge label="Filled" severity="success" />
 */
@Component({
  selector: 'interop-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [attr.data-severity]="severity()">{{ label() }}</span>`,
  styles: [`
    :host { display: inline-flex; }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1.5;
      background: var(--interop-badge-bg-info,    rgba(64, 128, 232, 0.18));
      color:      var(--interop-badge-fg-info,    var(--ws-accent, #4080e8));
    }
    .badge[data-severity="success"] {
      background: var(--interop-badge-bg-success, rgba(15, 138, 75, 0.18));
      color:      var(--interop-badge-fg-success, var(--ws-positive, #0f8a4b));
    }
    .badge[data-severity="warn"] {
      background: var(--interop-badge-bg-warn,    rgba(232, 192, 64, 0.18));
      color:      var(--interop-badge-fg-warn,    #e8b440);
    }
    .badge[data-severity="danger"] {
      background: var(--interop-badge-bg-danger,  rgba(232, 64, 64, 0.18));
      color:      var(--interop-badge-fg-danger,  var(--ws-negative, #b42318));
    }
    .badge[data-severity="muted"] {
      background: var(--interop-badge-bg-muted,   rgba(141, 147, 184, 0.18));
      color:      var(--interop-badge-fg-muted,   var(--ws-muted, #8d93b8));
    }
  `],
})
export class InteropStatusBadgeComponent {
  readonly label = input.required<string>();
  readonly severity = input<InteropSeverity>('info');
  /** Exposed for tests / harness queries; not used in the template. */
  readonly _classKey = computed(() => `badge--${this.severity()}`);
}
