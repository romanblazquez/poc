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

/**
 * App metadata returned by the DesktopAgent for the *calling* app
 * (FDC3 2.0 `AppMetadata`, narrowed to what this POC populates).
 */
export interface AppMetadata extends AppIdentifier {
  /** Stable name (usually equals appId) */
  name?: string;
  /** Human-readable title from the app directory */
  title?: string;
  /** Description from the app directory */
  description?: string;
  /** App version (from package.json or directory) */
  version?: string;
  /** Optional icon URL or emoji shorthand */
  icons?: { src: string }[];
}

/**
 * Implementation metadata returned by `fdc3.getInfo()` per FDC3 2.0.
 * Lets apps verify the desktop agent version, capabilities, and their own identity.
 */
export interface ImplementationMetadata {
  /** FDC3 protocol version this agent implements */
  fdc3Version: string;
  /** Stable provider identifier — e.g. "fdc3-desktop-poc", "io.Connect", "OpenFin" */
  provider: string;
  /** Provider package version */
  providerVersion: string;
  /** Metadata about the calling app */
  appMetadata: AppMetadata;
  /** Capability flags */
  optionalFeatures: {
    OriginatingAppMetadata: boolean;
    UserChannelMembershipAPIs: boolean;
    DesktopAgentBridging: boolean;
  };
}

/**
 * Declarative interop adapter for apps that have no FDC3 code of their own.
 * The shell injects a small runtime into the app's page that translates DOM
 * events into FDC3 calls (emit rules) and incoming FDC3 contexts into DOM
 * updates (listen rules). This lets a plain web app participate in context
 * sharing and intent routing without modifying its source.
 */
export interface AdapterEmitRule {
  /** DOM trigger — delegated listener, so late-rendered elements still match */
  on: {
    /** CSS selector matched via Element.closest() from the event target */
    selector: string;
    /** DOM event name, e.g. "click", "dblclick", "change" */
    event: string;
  };
  /** What to do when the trigger fires (default: "broadcast") */
  action?: 'broadcast' | 'raiseIntent';
  /** Intent name — required when action is "raiseIntent" */
  intent?: string;
  context: {
    /** FDC3 context type, e.g. "fdc3.instrument" */
    type: string;
    /** Static fields merged into every emitted context */
    template?: Record<string, unknown>;
    /**
     * Context field path → element accessor.
     * Accessors: "dataset.<key>", "textContent", "value", or "attr:<name>".
     * Example: { "id.ticker": "dataset.ticker", "name": "textContent" }
     */
    map?: Record<string, string>;
  };
}

export interface AdapterListenStep {
  /** Context field path to read, e.g. "id.ticker" */
  from: string;
  /** CSS selector of the element to update */
  selector: string;
  /** How to apply the value (default: "value" — sets input value) */
  set?: 'value' | 'textContent';
  /** Event to dispatch on the element after applying, e.g. "input", "change" */
  thenDispatch?: string;
}

export interface AdapterListenRule {
  /** FDC3 context type to subscribe to */
  contextType: string;
  apply: AdapterListenStep[];
  /** CSS selector to click once all steps have been applied (e.g. a submit button) */
  thenClick?: string;
}

export interface AppAdapterConfig {
  /** Set false to keep the config but skip injection */
  enabled?: boolean;
  emit?: AdapterEmitRule[];
  listen?: AdapterListenRule[];
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
  /** CSS color applied to the icon (tints Lucide SVGs, background for images) */
  iconColor?: string;
  /** Category for launcher grouping */
  category?: string;
  /** FDC3 capability declarations (broadcasts, listensTo, raisesIntents, handlesIntents) */
  capabilities?: {
    /** When false, Interop Flow shows the app as a node but does not auto-generate connectors for it. */
    autoWire?: boolean;
    broadcasts?: string[];
    listensTo?: string[];
    raisesIntents?: string[];
    handlesIntents?: string[];
  };
  /**
   * Optional role gating — when present, this app is only shown in the
   * launcher to users whose `currentRole` is in the list. Empty / absent
   * means visible to everyone (the default). Honoured by the Manager Console
   * pillar and the AppLauncher; FDC3 routing is NOT affected — entitlements
   * are a UI surface, not an interop boundary.
   */
  roles?: string[];
  /**
   * Declarative interop adapter for non-FDC3 apps. When present (and not
   * disabled), the shell injects a runtime that bridges the app's DOM to
   * FDC3 broadcasts/intents according to the rules. The app's declared
   * `capabilities` should describe what the adapter emits and listens to.
   */
  adapter?: AppAdapterConfig;
}
