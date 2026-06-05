/**
 * Vendored FDC3-compatible types used by the publishable Angular package.
 *
 * These mirror the small runtime/type surface this POC exposes from
 * `@fdc3-poc/fdc3-core`, but live inside the Angular package so ng-packagr can
 * build a self-contained library without inlining sibling workspace source.
 */

export interface Fdc3Context {
  type: string;
  name?: string;
  id?: Record<string, string | undefined>;
  [key: string]: unknown;
}

export interface ContactContext extends Fdc3Context {
  type: 'fdc3.contact';
  name: string;
  id: {
    email?: string;
    customerId?: string;
    FDS_ID?: string;
    [key: string]: string | undefined;
  };
}

export interface InstrumentContext extends Fdc3Context {
  type: 'fdc3.instrument';
  name: string;
  id: {
    ticker?: string;
    ISIN?: string;
    CUSIP?: string;
    RIC?: string;
    BBG?: string;
    [key: string]: string | undefined;
  };
}

export interface PositionContext extends Fdc3Context {
  type: 'fdc3.position';
  instrument: InstrumentContext;
  holding: number;
}

export interface PortfolioContext extends Fdc3Context {
  type: 'fdc3.portfolio';
  positions: PositionContext[];
}

export interface PaymentRequestContext extends Fdc3Context {
  type: 'com.demo.paymentRequest';
  customerId: string;
  amount: number;
  currency: string;
  reference?: string;
  description?: string;
}

export interface PaymentResultContext extends Fdc3Context {
  type: 'com.demo.paymentResult';
  status: 'approved' | 'rejected';
  reference: string;
  customerId: string;
  amount: number;
  currency: string;
  message: string;
}

/**
 * Streaming update pushed by Payment Action over the PrivateChannel it returns
 * from `completeIntent`. Lets the raiser render a live status timeline rather
 * than a one-shot result. Terminal stages (`approved` / `rejected` / `settled`
 * / `reversed`) signal the end of the stream.
 */
export type PaymentStage =
  | 'received'
  | 'validating'
  | 'pending-approver-a'
  | 'pending-approver-b'
  | 'approved'
  | 'rejected'
  | 'settled'
  | 'reversed';

export interface PaymentStatusContext extends Fdc3Context {
  type: 'com.demo.paymentStatus';
  reference: string;
  customerId: string;
  amount: number;
  currency: string;
  stage: PaymentStage;
  message?: string;
  ts: string;
  /** When the stage is terminal (approved / rejected / settled / reversed). */
  terminal?: boolean;
}

export interface AccountContext extends Fdc3Context {
  type: 'com.demo.account';
  accountId: string;
  accountNumber: string;
  customerId: string;
  balance: number;
  currency: string;
}

export interface FundContext extends Fdc3Context {
  type: 'com.demo.fund';
  name: string;
  id: {
    fundId: string;
    ticker?: string;
    ISIN?: string;
    [key: string]: string | undefined;
  };
  strategy?: string;
}

export interface OrderContext extends Fdc3Context {
  type: 'com.demo.order';
  orderId: string;
  fundId: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  notional: number;
  currency: string;
  status: string;
}

/**
 * Per-rule outcome from the compliance gate.
 * `approved` — rule passed.
 * `review`   — manual review required; the order can proceed but is flagged.
 * `blocked`  — order rejected by policy.
 */
export type ComplianceVerdict = 'approved' | 'review' | 'blocked';

/**
 * Result the compliance-check app returns from a `ValidateOrder` intent (or
 * pushes onto the user channel after passively scoring an order).
 * `verdict` is the most severe outcome across all triggered rules.
 */
export interface ComplianceVerdictContext extends Fdc3Context {
  type: 'com.demo.complianceVerdict';
  orderId: string;
  ticker: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  notional: number;
  currency: string;
  verdict: ComplianceVerdict;
  reasons: string[];
  ts: string;
}

export interface TraderOrderContext extends Fdc3Context {
  type: 'com.demo.traderOrder';
  orderId: string;
  instrument: { ticker: string; ISIN?: string; name?: string };
  side: 'Buy' | 'Sell';
  orderType: 'Market' | 'Limit';
  quantity: number;
  limitPrice?: number;
  tif: 'DAY' | 'IOC' | 'GTC' | 'FOK';
  venue: string;
  account: string;
  currency: string;
  notional?: number;
  status: 'New' | 'Working' | 'PartiallyFilled' | 'Filled' | 'Cancelled' | 'Rejected';
  createdAt: string;
}

export interface OrderStatusContext extends Fdc3Context {
  type: 'com.demo.orderStatus';
  orderId: string;
  status: 'New' | 'Working' | 'PartiallyFilled' | 'Filled' | 'Cancelled' | 'Rejected';
  filledQty?: number;
  remainingQty?: number;
  avgPrice?: number;
  lastPrice?: number;
  lastQty?: number;
  message?: string;
  ts: string;
}

export type ThemeName = 'dark-financial' | 'light-financial' | 'high-contrast' | 'luxury-neutral';

export interface ThemeContext extends Fdc3Context {
  type: 'com.demo.theme';
  theme: ThemeName;
}

export interface AppIdentifier {
  appId: string;
  instanceId?: string;
}

export interface ContextMetadata {
  source?: AppIdentifier;
}

export interface AppMetadata extends AppIdentifier {
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  icons?: { src: string }[];
}

export interface ImplementationMetadata {
  fdc3Version: string;
  provider: string;
  providerVersion: string;
  appMetadata: AppMetadata;
  optionalFeatures: {
    OriginatingAppMetadata: boolean;
    UserChannelMembershipAPIs: boolean;
    DesktopAgentBridging: boolean;
  };
}

export interface IntentMetadata {
  name: string;
  displayName?: string;
}

export interface AppIntent {
  intent: IntentMetadata;
  apps: AppMetadata[];
}

export interface IntentResolution {
  source: { appId: string };
  intent: string;
  result?: Fdc3Context | Channel;
}

export const ResolveError = {
  NoAppsFound: 'NoAppsFound',
  ResolverUnavailable: 'ResolverUnavailable',
  UserCancelled: 'UserCancelledResolution',
  ResolverTimeout: 'ResolverTimeout',
  IntentDeliveryFailed: 'IntentDeliveryFailed',
  TargetAppUnavailable: 'TargetAppUnavailable',
  TargetInstanceUnavailable: 'TargetInstanceUnavailable',
} as const;
export type ResolveErrorCode = (typeof ResolveError)[keyof typeof ResolveError];

export class NoAppsFoundError extends Error {
  constructor() {
    super(ResolveError.NoAppsFound);
    this.name = 'NoAppsFoundError';
  }
}

export class UserCancelledResolutionError extends Error {
  constructor() {
    super(ResolveError.UserCancelled);
    this.name = 'UserCancelledResolutionError';
  }
}

export class IntentResolutionError extends Error {
  constructor(
    public readonly intent: string,
    public readonly context?: Fdc3Context,
  ) {
    super(`No handler found for intent "${intent}"`);
    this.name = 'IntentResolutionError';
  }
}

export type ChannelType = 'user' | 'app' | 'private';

export interface ChannelDisplayMetadata {
  name: string;
  color: string;
  glyph?: string;
}

export interface UserChannel {
  id: string;
  type: ChannelType;
  displayMetadata: ChannelDisplayMetadata;
}

export interface ChannelListener {
  unsubscribe(): void;
}

export interface Channel {
  readonly id: string;
  readonly type: ChannelType;
  readonly displayMetadata?: ChannelDisplayMetadata;
  broadcast(context: Fdc3Context): Promise<void>;
  getCurrentContext(contextType?: string): Promise<Fdc3Context | null>;
  addContextListener<T extends Fdc3Context>(
    handler: (context: T) => void,
  ): Promise<ChannelListener>;
  addContextListener<T extends Fdc3Context>(
    contextType: string | null,
    handler: (context: T) => void,
  ): Promise<ChannelListener>;
}

export interface PrivateChannelEventListener {
  unsubscribe(): void;
}

export interface PrivateChannel extends Channel {
  readonly type: 'private';
  onAddContextListener(handler: (contextType: string | null) => void): PrivateChannelEventListener;
  onUnsubscribe(handler: (contextType: string | null) => void): PrivateChannelEventListener;
  onDisconnect(handler: () => void): PrivateChannelEventListener;
  disconnect(): Promise<void>;
}

export type Unsubscribe = () => void;

export interface Listener {
  unsubscribe(): void;
}

export type ListenerHandle = Unsubscribe & Listener & PromiseLike<Listener>;

export interface IntentInvocationMetadata {
  requestId?: string;
}

export type Fdc3EventType = 'userChannelChanged';

export interface Fdc3ChannelChangedEventDetails {
  currentChannelId: string | null;
}

export interface Fdc3Event {
  type: Fdc3EventType;
  details: Fdc3ChannelChangedEventDetails;
}

export type Fdc3EventHandler = (event: Fdc3Event) => void;

export interface Fdc3DesktopAgent {
  broadcast(context: Fdc3Context): Promise<void>;
  addContextListener<T extends Fdc3Context>(
    handler: (context: T) => void,
  ): ListenerHandle;
  addContextListener<T extends Fdc3Context>(
    type: string | null,
    handler: (context: T, metadata?: ContextMetadata) => void,
  ): ListenerHandle;
  raiseIntent(intent: string, context?: Fdc3Context): Promise<IntentResolution>;
  raiseIntentForContext(context: Fdc3Context): Promise<IntentResolution>;
  addIntentListener(
    intent: string,
    handler: (context?: Fdc3Context, metadata?: IntentInvocationMetadata) => Promise<void> | void,
  ): ListenerHandle;
  addEventListener(type: Fdc3EventType | null, handler: Fdc3EventHandler): ListenerHandle;
  completeIntent(requestId: string, result?: Fdc3Context | PrivateChannel): Promise<void>;
  closeWindow(): Promise<boolean>;
  getTheme(): Promise<ThemeName>;
  setTheme(theme: ThemeName): Promise<ThemeName>;
  onThemeChanged(handler: (theme: ThemeName) => void): Unsubscribe;
  joinUserChannel(channelId: string): Promise<void>;
  leaveCurrentChannel(): Promise<void>;
  getCurrentChannel(): Promise<UserChannel | null>;
  getUserChannels(): Promise<UserChannel[]>;
  open(app: { appId: string }, context?: Fdc3Context): Promise<void>;
  getInfo(): Promise<ImplementationMetadata>;
  findIntent(intent: string, context?: Fdc3Context, resultType?: string): Promise<AppIntent>;
  findIntentsByContext(context: Fdc3Context, resultType?: string): Promise<AppIntent[]>;
  getOrCreateChannel(channelId: string): Promise<Channel>;
  createPrivateChannel(): Promise<PrivateChannel>;
}

export const DEFAULT_USER_CHANNELS: UserChannel[] = [
  { id: 'channel-1', type: 'user', displayMetadata: { name: 'Red', color: '#e84040' } },
  { id: 'channel-2', type: 'user', displayMetadata: { name: 'Orange', color: '#e87040' } },
  { id: 'channel-3', type: 'user', displayMetadata: { name: 'Yellow', color: '#e8d840' } },
  { id: 'channel-4', type: 'user', displayMetadata: { name: 'Green', color: '#40c080' } },
  { id: 'channel-5', type: 'user', displayMetadata: { name: 'Blue', color: '#4080e8' } },
  { id: 'channel-6', type: 'user', displayMetadata: { name: 'Purple', color: '#9040e8' } },
];
