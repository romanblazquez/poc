/**
 * @fdc3-poc/interop-angular — primary entry point.
 */

// Provider + service
export { provideInterop } from './lib/provide-interop';
export { InteropService } from './lib/interop.service';
export type { IntentInvocation } from './lib/interop.service';

// Tokens / config
export { INTEROP_CONFIG } from './lib/tokens';
export type { InteropConfig, InteropOfflineMode } from './lib/tokens';

// Discovery (mostly for advanced use cases — testing, custom shims)
export type { InteropMode, DiscoveryResult } from './lib/discovery/agent-discovery';
export { discoverAgent } from './lib/discovery/agent-discovery';
export { getAgentOrNull } from './lib/discovery/get-agent-shim';
export type { GetAgentOptions } from './lib/discovery/get-agent-shim';

// Re-export the FDC3-compatible type universe so consumers can import
// everything they need from a single package.
export type {
  AccountContext,
  AppIdentifier,
  AppIntent,
  AppMetadata,
  Channel,
  ChannelDisplayMetadata,
  ChannelListener,
  ChannelType,
  ContactContext,
  ContextMetadata,
  Fdc3ChannelChangedEventDetails,
  Fdc3Context,
  Fdc3DesktopAgent,
  Fdc3Event,
  Fdc3EventHandler,
  Fdc3EventType,
  FundContext,
  ImplementationMetadata,
  InstrumentContext,
  IntentInvocationMetadata,
  IntentMetadata,
  IntentResolution,
  Listener,
  ListenerHandle,
  OrderContext,
  OrderStatusContext,
  PaymentRequestContext,
  PaymentResultContext,
  PaymentStage,
  PaymentStatusContext,
  ComplianceVerdict,
  ComplianceVerdictContext,
  PortfolioContext,
  PositionContext,
  PrivateChannel,
  PrivateChannelEventListener,
  ResolveErrorCode,
  ThemeContext,
  ThemeName,
  TraderOrderContext,
  Unsubscribe,
  UserChannel,
} from './lib/fdc3-types';
export {
  DEFAULT_USER_CHANNELS,
  IntentResolutionError,
  NoAppsFoundError,
  ResolveError,
  UserCancelledResolutionError,
} from './lib/fdc3-types';
