/**
 * Mock domain data for the FDC3 Desktop POC.
 * Used by all demo apps.  Replace with real API calls in a production system.
 */

// ─── Customers ─────────────────────────────────────────────────────────────

export interface Customer {
  customerId: string;
  name: string;
  email: string;
  phone: string;
  segment: 'Retail' | 'Private Banking' | 'Institutional' | 'Corporate';
  relationship: 'Active' | 'Prospect' | 'Dormant';
  relationship_manager: string;
  country: string;
  onboardedDate: string;
}

export const CUSTOMERS: Customer[] = [
  {
    customerId: 'CUST-1001',
    name: 'Maria Garcia',
    email: 'maria.garcia@example.com',
    phone: '+34 91 123 4567',
    segment: 'Private Banking',
    relationship: 'Active',
    relationship_manager: 'James Wilson',
    country: 'Spain',
    onboardedDate: '2018-03-15',
  },
  {
    customerId: 'CUST-1002',
    name: 'Thomas Müller',
    email: 't.muller@example.de',
    phone: '+49 30 9876 5432',
    segment: 'Institutional',
    relationship: 'Active',
    relationship_manager: 'Sarah Chen',
    country: 'Germany',
    onboardedDate: '2015-07-22',
  },
  {
    customerId: 'CUST-1003',
    name: 'Sophie Laurent',
    email: 'slaurent@example.fr',
    phone: '+33 1 4567 8901',
    segment: 'Corporate',
    relationship: 'Active',
    relationship_manager: 'James Wilson',
    country: 'France',
    onboardedDate: '2020-01-10',
  },
  {
    customerId: 'CUST-1004',
    name: 'Hiroshi Tanaka',
    email: 'h.tanaka@example.jp',
    phone: '+81 3 1234 5678',
    segment: 'Private Banking',
    relationship: 'Active',
    relationship_manager: 'Olivia Park',
    country: 'Japan',
    onboardedDate: '2019-11-05',
  },
  {
    customerId: 'CUST-1005',
    name: 'Emily Johnson',
    email: 'e.johnson@example.com',
    phone: '+1 212 555 0199',
    segment: 'Retail',
    relationship: 'Active',
    relationship_manager: 'David Kim',
    country: 'USA',
    onboardedDate: '2022-06-30',
  },
];

// ─── Accounts ──────────────────────────────────────────────────────────────

export interface Account {
  accountId: string;
  accountNumber: string;
  customerId: string;
  type: 'Current' | 'Savings' | 'Investment' | 'Custody';
  currency: string;
  balance: number;
  availableBalance: number;
  openedDate: string;
}

export const ACCOUNTS: Account[] = [
  {
    accountId: 'ACC-2001',
    accountNumber: 'ES91 2100 0418 4502 0005 1332',
    customerId: 'CUST-1001',
    type: 'Current',
    currency: 'EUR',
    balance: 48_250.0,
    availableBalance: 47_000.0,
    openedDate: '2018-03-15',
  },
  {
    accountId: 'ACC-2002',
    accountNumber: 'ES91 2100 0418 4502 0005 1333',
    customerId: 'CUST-1001',
    type: 'Investment',
    currency: 'EUR',
    balance: 312_500.0,
    availableBalance: 310_000.0,
    openedDate: '2018-06-01',
  },
  {
    accountId: 'ACC-2003',
    accountNumber: 'DE89 3704 0044 0532 0130 00',
    customerId: 'CUST-1002',
    type: 'Custody',
    currency: 'EUR',
    balance: 2_450_000.0,
    availableBalance: 2_450_000.0,
    openedDate: '2015-07-22',
  },
  {
    accountId: 'ACC-2004',
    accountNumber: 'FR76 3000 6000 0112 3456 7890 189',
    customerId: 'CUST-1003',
    type: 'Current',
    currency: 'EUR',
    balance: 156_800.0,
    availableBalance: 155_000.0,
    openedDate: '2020-01-10',
  },
];

// ─── Portfolio Positions ────────────────────────────────────────────────────

export interface PortfolioPosition {
  customerId: string;
  ticker: string;
  name: string;
  isin: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  currency: string;
  sector: string;
}

export const PORTFOLIO_POSITIONS: PortfolioPosition[] = [
  {
    customerId: 'CUST-1001',
    ticker: 'AAPL',
    name: 'Apple Inc.',
    isin: 'US0378331005',
    quantity: 500,
    avgCost: 145.2,
    currentPrice: 189.3,
    currency: 'USD',
    sector: 'Technology',
  },
  {
    customerId: 'CUST-1001',
    ticker: 'MSFT',
    name: 'Microsoft Corp.',
    isin: 'US5949181045',
    quantity: 300,
    avgCost: 280.1,
    currentPrice: 415.6,
    currency: 'USD',
    sector: 'Technology',
  },
  {
    customerId: 'CUST-1001',
    ticker: 'SAN.MC',
    name: 'Banco Santander',
    isin: 'ES0113900J37',
    quantity: 10000,
    avgCost: 3.2,
    currentPrice: 4.15,
    currency: 'EUR',
    sector: 'Financials',
  },
  {
    customerId: 'CUST-1001',
    ticker: 'NVDA',
    name: 'NVIDIA Corp.',
    isin: 'US67066G1040',
    quantity: 200,
    avgCost: 220.0,
    currentPrice: 875.4,
    currency: 'USD',
    sector: 'Technology',
  },
  {
    customerId: 'CUST-1002',
    ticker: 'SAP',
    name: 'SAP SE',
    isin: 'DE0007164600',
    quantity: 2000,
    avgCost: 95.0,
    currentPrice: 178.6,
    currency: 'EUR',
    sector: 'Technology',
  },
  {
    customerId: 'CUST-1002',
    ticker: 'ALV',
    name: 'Allianz SE',
    isin: 'DE0008404005',
    quantity: 1500,
    avgCost: 200.0,
    currentPrice: 265.3,
    currency: 'EUR',
    sector: 'Insurance',
  },
];

// ─── Market Data ────────────────────────────────────────────────────────────

export interface MarketQuote {
  ticker: string;
  name: string;
  isin: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  currency: string;
  exchange: string;
}

export const MARKET_QUOTES: MarketQuote[] = [
  {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    isin: 'US0378331005',
    price: 189.3,
    change: 1.25,
    changePct: 0.66,
    volume: 54_320_100,
    currency: 'USD',
    exchange: 'NASDAQ',
  },
  {
    ticker: 'MSFT',
    name: 'Microsoft Corp.',
    isin: 'US5949181045',
    price: 415.6,
    change: -2.1,
    changePct: -0.5,
    volume: 18_720_400,
    currency: 'USD',
    exchange: 'NASDAQ',
  },
  {
    ticker: 'NVDA',
    name: 'NVIDIA Corp.',
    isin: 'US67066G1040',
    price: 875.4,
    change: 15.3,
    changePct: 1.78,
    volume: 42_100_800,
    currency: 'USD',
    exchange: 'NASDAQ',
  },
  {
    ticker: 'SAP',
    name: 'SAP SE',
    isin: 'DE0007164600',
    price: 178.6,
    change: 0.9,
    changePct: 0.51,
    volume: 2_340_100,
    currency: 'EUR',
    exchange: 'XETRA',
  },
  {
    ticker: 'SAN.MC',
    name: 'Banco Santander',
    isin: 'ES0113900J37',
    price: 4.15,
    change: -0.03,
    changePct: -0.72,
    volume: 87_400_200,
    currency: 'EUR',
    exchange: 'BME',
  },
  {
    ticker: 'ALV',
    name: 'Allianz SE',
    isin: 'DE0008404005',
    price: 265.3,
    change: 1.8,
    changePct: 0.68,
    volume: 1_230_500,
    currency: 'EUR',
    exchange: 'XETRA',
  },
];

// ─── Transactions ───────────────────────────────────────────────────────────

export interface Transaction {
  txId: string;
  accountId: string;
  customerId: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: 'credit' | 'debit';
  category: string;
}

export const TRANSACTIONS: Transaction[] = [
  {
    txId: 'TX-5001',
    accountId: 'ACC-2001',
    customerId: 'CUST-1001',
    date: '2024-04-22',
    description: 'SEPA Transfer from Acme Corp',
    amount: 15_000.0,
    currency: 'EUR',
    type: 'credit',
    category: 'Transfer',
  },
  {
    txId: 'TX-5002',
    accountId: 'ACC-2001',
    customerId: 'CUST-1001',
    date: '2024-04-20',
    description: 'Standing order — Mortgage',
    amount: 2_250.0,
    currency: 'EUR',
    type: 'debit',
    category: 'Mortgage',
  },
  {
    txId: 'TX-5003',
    accountId: 'ACC-2001',
    customerId: 'CUST-1001',
    date: '2024-04-18',
    description: 'Dividend — Banco Santander',
    amount: 415.0,
    currency: 'EUR',
    type: 'credit',
    category: 'Dividend',
  },
  {
    txId: 'TX-5004',
    accountId: 'ACC-2001',
    customerId: 'CUST-1001',
    date: '2024-04-15',
    description: 'Wire transfer to Broker XYZ',
    amount: 5_000.0,
    currency: 'EUR',
    type: 'debit',
    category: 'Investment',
  },
];

// ─── Funds Workflow ────────────────────────────────────────────────────────

export interface FundAllocation {
  fundId: string;
  ticker: string;
  name: string;
  isin: string;
  strategy: 'Global Equity' | 'Fixed Income' | 'Multi Asset' | 'Alternatives';
  manager: string;
  nav: number;
  aum: number;
  currency: string;
  targetWeight: number;
  actualWeight: number;
  drift: number;
  risk: 'Low' | 'Medium' | 'High';
}

export const FUND_ALLOCATIONS: FundAllocation[] = [
  {
    fundId: 'FUND-3001',
    ticker: 'GEQX',
    name: 'Global Equity Alpha',
    isin: 'IE00GEQALPHA',
    strategy: 'Global Equity',
    manager: 'Amelia Stone',
    nav: 128.42,
    aum: 1_240_000_000,
    currency: 'USD',
    targetWeight: 32,
    actualWeight: 34.7,
    drift: 2.7,
    risk: 'High',
  },
  {
    fundId: 'FUND-3002',
    ticker: 'EUIG',
    name: 'Euro Investment Grade',
    isin: 'IE00EUIGBOND',
    strategy: 'Fixed Income',
    manager: 'Nicolas Meyer',
    nav: 102.18,
    aum: 940_000_000,
    currency: 'EUR',
    targetWeight: 26,
    actualWeight: 24.1,
    drift: -1.9,
    risk: 'Low',
  },
  {
    fundId: 'FUND-3003',
    ticker: 'MALT',
    name: 'Managed Alternatives',
    isin: 'IE00MALTCORE',
    strategy: 'Alternatives',
    manager: 'Priya Raman',
    nav: 87.66,
    aum: 515_000_000,
    currency: 'USD',
    targetWeight: 18,
    actualWeight: 16.8,
    drift: -1.2,
    risk: 'Medium',
  },
  {
    fundId: 'FUND-3004',
    ticker: 'BALC',
    name: 'Balanced Core Allocation',
    isin: 'IE00BALCORE',
    strategy: 'Multi Asset',
    manager: 'Lucas OBrien',
    nav: 115.04,
    aum: 1_710_000_000,
    currency: 'EUR',
    targetWeight: 24,
    actualWeight: 24.4,
    drift: 0.4,
    risk: 'Medium',
  },
];

export interface IncomingOrder {
  orderId: string;
  fundId: string;
  fundName: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  notional: number;
  currency: string;
  receivedAt: string;
  status: 'New' | 'Validated' | 'Queued' | 'Exception';
  source: 'OMS' | 'Client Portal' | 'FIX' | 'Email Capture';
  trader: string;
}

export const INCOMING_ORDERS: IncomingOrder[] = [
  {
    orderId: 'ORD-9001',
    fundId: 'FUND-3001',
    fundName: 'Global Equity Alpha',
    side: 'Buy',
    quantity: 12500,
    notional: 1_605_250,
    currency: 'USD',
    receivedAt: '09:12:44',
    status: 'New',
    source: 'FIX',
    trader: 'Lena Ford',
  },
  {
    orderId: 'ORD-9002',
    fundId: 'FUND-3002',
    fundName: 'Euro Investment Grade',
    side: 'Sell',
    quantity: 8400,
    notional: 858_312,
    currency: 'EUR',
    receivedAt: '09:15:09',
    status: 'Validated',
    source: 'OMS',
    trader: 'Marco Bell',
  },
  {
    orderId: 'ORD-9003',
    fundId: 'FUND-3004',
    fundName: 'Balanced Core Allocation',
    side: 'Buy',
    quantity: 4600,
    notional: 529_184,
    currency: 'EUR',
    receivedAt: '09:21:33',
    status: 'Queued',
    source: 'Client Portal',
    trader: 'Aoife Byrne',
  },
  {
    orderId: 'ORD-9004',
    fundId: 'FUND-3003',
    fundName: 'Managed Alternatives',
    side: 'Sell',
    quantity: 2200,
    notional: 192_852,
    currency: 'USD',
    receivedAt: '09:27:18',
    status: 'Exception',
    source: 'Email Capture',
    trader: 'Samir Patel',
  },
  {
    orderId: 'ORD-9005',
    fundId: 'FUND-3001',
    fundName: 'Global Equity Alpha',
    side: 'Sell',
    quantity: 3100,
    notional: 398_102,
    currency: 'USD',
    receivedAt: '09:34:02',
    status: 'Validated',
    source: 'OMS',
    trader: 'Lena Ford',
  },
];

export interface AuditEvent {
  auditId: string;
  fundId: string;
  timestamp: string;
  actor: string;
  action: string;
  severity: 'Info' | 'Warning' | 'Critical';
  details: string;
}

export const AUDIT_EVENTS: AuditEvent[] = [
  {
    auditId: 'AUD-7001',
    fundId: 'FUND-3001',
    timestamp: '09:10:02',
    actor: 'Risk Engine',
    action: 'Drift Check',
    severity: 'Warning',
    details: 'Actual weight is 2.7% above target.',
  },
  {
    auditId: 'AUD-7002',
    fundId: 'FUND-3001',
    timestamp: '09:12:46',
    actor: 'FIX Gateway',
    action: 'Order Accepted',
    severity: 'Info',
    details: 'ORD-9001 accepted for pre-trade validation.',
  },
  {
    auditId: 'AUD-7003',
    fundId: 'FUND-3002',
    timestamp: '09:15:11',
    actor: 'Compliance',
    action: 'Limit Passed',
    severity: 'Info',
    details: 'Sell order remained inside desk limits.',
  },
  {
    auditId: 'AUD-7004',
    fundId: 'FUND-3003',
    timestamp: '09:27:21',
    actor: 'Email Capture',
    action: 'Manual Review',
    severity: 'Critical',
    details: 'Instruction requires source confirmation before release.',
  },
  {
    auditId: 'AUD-7005',
    fundId: 'FUND-3004',
    timestamp: '09:21:35',
    actor: 'OMS',
    action: 'Queued',
    severity: 'Info',
    details: 'Order queued for trader review.',
  },
];

// ─── Helper lookups ──────────────────────────────────────────────────────────

export function getCustomerById(id: string): Customer | undefined {
  return CUSTOMERS.find((c) => c.customerId === id);
}

export function getAccountsByCustomer(customerId: string): Account[] {
  return ACCOUNTS.filter((a) => a.customerId === customerId);
}

export function getPortfolioByCustomer(customerId: string): PortfolioPosition[] {
  return PORTFOLIO_POSITIONS.filter((p) => p.customerId === customerId);
}

export function getTransactionsByCustomer(customerId: string): Transaction[] {
  return TRANSACTIONS.filter((t) => t.customerId === customerId);
}

export function getQuoteByTicker(ticker: string): MarketQuote | undefined {
  return MARKET_QUOTES.find((q) => q.ticker === ticker);
}

export function getFundById(fundId: string): FundAllocation | undefined {
  return FUND_ALLOCATIONS.find((fund) => fund.fundId === fundId);
}

export function getOrdersByFund(fundId: string): IncomingOrder[] {
  return INCOMING_ORDERS.filter((order) => order.fundId === fundId);
}

export function getAuditEventsByFund(fundId: string): AuditEvent[] {
  return AUDIT_EVENTS.filter((event) => event.fundId === fundId);
}
