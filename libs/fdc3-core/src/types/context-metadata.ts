import type { AppIdentifier } from './app.js';

/**
 * FDC3 2.0 `ContextMetadata` — provenance delivered as the second argument to a
 * context listener: `addContextListener(type, (context, metadata) => …)`.
 *
 * `source` identifies the app that broadcast the context, enabling the
 * `OriginatingAppMetadata` optional feature. Apps use it to attribute or filter
 * inbound contexts; the shell uses it to power the Command Center route matrix.
 */
export interface ContextMetadata {
  /** The app that originated this context, when known. */
  source?: AppIdentifier;
}
