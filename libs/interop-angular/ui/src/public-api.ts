/**
 * @fdc3-poc/interop-angular/ui — themable Angular UI primitives.
 *
 * Standalone components, OnPush, no PrimeNG dep. Every visual property is
 * controlled via CSS custom properties prefixed `--interop-*` with sensible
 * defaults that reach into the workstation theme tokens (`--ws-*`) when
 * present, so they "just work" inside this monorepo's apps AND inside any
 * third-party Angular app that defines its own tokens.
 */

export { InteropStatusBadgeComponent } from './lib/status-badge.component';
export type { InteropSeverity } from './lib/status-badge.component';

export { InteropSideToggleComponent } from './lib/side-toggle.component';
export type { InteropSide } from './lib/side-toggle.component';

export { InteropInstrumentTagComponent } from './lib/instrument-tag.component';
export { InteropEmptyStateComponent } from './lib/empty-state.component';
export { InteropWorkstationHeaderComponent } from './lib/workstation-header.component';
export { InteropChannelPickerComponent } from './lib/channel-picker.component';
