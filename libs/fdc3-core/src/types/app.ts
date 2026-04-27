import type { IntentDefinition } from './intent.js';

/**
 * Identifies a running app instance (FDC3 2.0 AppIdentifier).
 */
export interface AppIdentifier {
  appId: string;
  instanceId?: string;
}

/**
 * Full app descriptor from the App Directory.
 * Follows the FDC3 AppD spec loosely, extended with layout and dev hints.
 */
/**
 * Routing policy derived from the Interop Flow designer.
 * Sent from the renderer to the main process whenever the flow changes.
 * The main process uses this to filter context broadcasts and intent deliveries.
 */
export interface FlowPolicy {
  /** When false, the policy is inactive and all traffic flows freely. */
  enabled: boolean;
  /**
   * Keys of the form "sourceAppId:contextType:targetAppId".
   * If a key is present the corresponding context broadcast is BLOCKED.
   */
  disabledContextRoutes: string[];
  /**
   * Keys of the form "sourceAppId:intentName:targetAppId".
   * If a key is present the corresponding intent delivery is BLOCKED.
   */
  disabledIntentRoutes: string[];
}

export interface AppDefinition {
  /** Unique, stable identifier */
  appId: string;
  /** Human-readable title shown in the launcher */
  title: string;
  /** Short description for the launcher tooltip */
  description?: string;
  /** URL to load in production (file:// or https://) */
  url: string;
  /** Override port in dev mode (electron loads http://localhost:port) */
  devPort: number;
  /** Initial window placement/sizing hints */
  initialLayout?: {
    x?: number;
    y?: number;
    width: number;
    height: number;
  };
  /** Intents this app can handle */
  intents?: IntentDefinition[];
  /** Context types this app subscribes to (informational, not enforced) */
  listensForContexts?: string[];
  /** Emoji or short icon code for the launcher */
  icon?: string;
  /** Category for launcher grouping */
  category?: string;
  /** FDC3 capability declarations (broadcasts, listensTo, raisesIntents, handlesIntents) */
  capabilities?: {
    broadcasts?: string[];
    listensTo?: string[];
    raisesIntents?: string[];
    handlesIntents?: string[];
  };
}
