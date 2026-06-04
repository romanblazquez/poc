/**
 * @fdc3-poc/interop-angular/trader — trading-domain Angular helpers.
 *
 * Kept in its own secondary entry point so the generic FDC3 wrapper (the
 * primary entry) stays domain-agnostic. Consumers opt in:
 *
 *   import { InteropInstrumentAutocompleteComponent } from '@fdc3-poc/interop-angular/trader';
 *
 * The instrument source is pluggable via the `INSTRUMENT_SOURCE` DI token.
 * The default uses a tiny bundled starter catalogue; production deployments
 * inject a real symbology service.
 */

export {
  InteropInstrumentAutocompleteComponent,
} from './lib/instrument-autocomplete.component';

export { interopSparklineCellRenderer } from './lib/sparkline-cell-renderer';
export type { SparklineRendererOptions } from './lib/sparkline-cell-renderer';

export {
  INSTRUMENT_SOURCE,
  provideInstrumentSource,
  defaultInstrumentSource,
} from './lib/instrument-source';
export type { InstrumentRecord, InstrumentSource } from './lib/instrument-source';

export { InteropOrderTicketComponent } from './lib/order-ticket.component';
export type {
  OrderTicketSubmit,
  OrderTicketFormValue,
  OrderTif,
  OrderType,
} from './lib/order-ticket.component';
