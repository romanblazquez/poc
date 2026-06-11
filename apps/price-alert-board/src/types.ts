// Pure app domain types — no FDC3 knowledge here.

export interface Instrument {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  prevPrice: number;
  change: number;   // absolute
  changePct: number;
}

export type BridgeState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface BridgeInfo {
  state: BridgeState;
  endpoint: string;
  lastContextAt: number | null;
  lastContextTicker: string | null;
  error: string | null;
}
