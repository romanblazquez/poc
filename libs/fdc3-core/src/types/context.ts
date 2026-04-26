/**
 * FDC3 2.0-compatible context types.
 * These are the strongly-typed contracts shared across ALL runtime providers.
 * Apps should only import from this module — never from provider-specific code.
 */

/** Base context that every FDC3 message must conform to. */
export interface Fdc3Context {
  /** Namespaced type string, e.g. "fdc3.contact", "com.acme.order" */
  type: string;
  /** Human-readable label */
  name?: string;
  /** Canonical identifiers. Values are string only per FDC3 spec. */
  id?: Record<string, string | undefined>;
  /** Allow extension fields */
  [key: string]: unknown;
}

// ─── Standard FDC3 contexts ────────────────────────────────────────────────

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

// ─── Custom demo contexts ───────────────────────────────────────────────────

export interface PaymentRequestContext extends Fdc3Context {
  type: 'com.demo.paymentRequest';
  customerId: string;
  amount: number;
  currency: string;
  reference?: string;
  description?: string;
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

export type ThemeName = 'quartz-dark' | 'quartz-light' | 'alpine-dark' | 'material-dark';

export interface ThemeContext extends Fdc3Context {
  type: 'com.demo.theme';
  theme: ThemeName;
}

// ─── Type guard helpers ─────────────────────────────────────────────────────

export function isContactContext(ctx: Fdc3Context): ctx is ContactContext {
  return ctx.type === 'fdc3.contact';
}

export function isInstrumentContext(ctx: Fdc3Context): ctx is InstrumentContext {
  return ctx.type === 'fdc3.instrument';
}

export function isPaymentRequestContext(ctx: Fdc3Context): ctx is PaymentRequestContext {
  return ctx.type === 'com.demo.paymentRequest';
}

export function isFundContext(ctx: Fdc3Context): ctx is FundContext {
  return ctx.type === 'com.demo.fund';
}

export function isOrderContext(ctx: Fdc3Context): ctx is OrderContext {
  return ctx.type === 'com.demo.order';
}

export function isThemeContext(ctx: Fdc3Context): ctx is ThemeContext {
  return ctx.type === 'com.demo.theme';
}
