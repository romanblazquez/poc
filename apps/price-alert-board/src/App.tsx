/**
 * Price Alert Board — app business logic.
 * This file has zero knowledge of FDC3 or the bridge protocol.
 * Context sharing is handled entirely by bridge-adapter.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BridgeAdapter } from './bridge-adapter.js';
import type { BridgeInfo, BridgeState, Instrument } from './types.js';
import './styles.css';

// ── Static instrument list ────────────────────────────────────────────────────

const SEED: Omit<Instrument, 'prevPrice' | 'change' | 'changePct'>[] = [
  { ticker: 'AAPL',  name: 'Apple Inc.',        sector: 'Technology',  price: 189.25 },
  { ticker: 'MSFT',  name: 'Microsoft Corp.',    sector: 'Technology',  price: 415.80 },
  { ticker: 'GOOGL', name: 'Alphabet Inc.',      sector: 'Technology',  price: 173.40 },
  { ticker: 'AMZN',  name: 'Amazon.com Inc.',    sector: 'Consumer',    price: 198.75 },
  { ticker: 'TSLA',  name: 'Tesla Inc.',         sector: 'Automotive',  price: 248.50 },
  { ticker: 'JPM',   name: 'JPMorgan Chase',     sector: 'Finance',     price: 215.30 },
  { ticker: 'GS',    name: 'Goldman Sachs',      sector: 'Finance',     price: 498.20 },
  { ticker: 'BLK',   name: 'BlackRock Inc.',     sector: 'Finance',     price: 789.45 },
  { ticker: 'MS',    name: 'Morgan Stanley',     sector: 'Finance',     price: 102.60 },
  { ticker: 'BAC',   name: 'Bank of America',    sector: 'Finance',     price: 43.75  },
];

function seedInstruments(): Instrument[] {
  return SEED.map((s) => ({ ...s, prevPrice: s.price, change: 0, changePct: 0 }));
}

// ── Price simulation ──────────────────────────────────────────────────────────

function tickPrices(prev: Instrument[]): Instrument[] {
  return prev.map((inst) => {
    const delta = inst.price * (Math.random() * 0.006 - 0.003);
    const price = Math.max(0.01, +(inst.price + delta).toFixed(2));
    const change = +(price - inst.prevPrice).toFixed(2);
    const changePct = +((change / inst.prevPrice) * 100).toFixed(2);
    return { ...inst, prevPrice: inst.price, price, change, changePct };
  });
}

// ── Bridge endpoint ───────────────────────────────────────────────────────────

const BRIDGE_ENDPOINT = 'ws://127.0.0.1:4475';

// ── Component ─────────────────────────────────────────────────────────────────

export function App(): JSX.Element {
  const [instruments, setInstruments] = useState<Instrument[]>(seedInstruments);
  const [selected, setSelected] = useState<string | null>(null);
  const [bridgeInfo, setBridgeInfo] = useState<BridgeInfo>({
    state: 'connecting',
    endpoint: BRIDGE_ENDPOINT,
    lastContextAt: null,
    lastContextTicker: null,
    error: null,
  });

  const adapterRef = useRef<BridgeAdapter | null>(null);

  // Wire up the bridge adapter once.
  useEffect(() => {
    const adapter = new BridgeAdapter(
      BRIDGE_ENDPOINT,
      // Called when another app broadcasts an fdc3.instrument over the bridge.
      (ticker, _name) => {
        setSelected(ticker);
        setBridgeInfo((prev) => ({
          ...prev,
          lastContextAt: Date.now(),
          lastContextTicker: ticker,
        }));
      },
      ({ state, error }) => {
        setBridgeInfo((prev) => ({ ...prev, state: state as BridgeState, error: error ?? null }));
      },
    );
    adapterRef.current = adapter;
    adapter.connect();
    return () => adapter.disconnect();
  }, []);

  // Simulate live price updates every 1.5 s.
  useEffect(() => {
    const id = setInterval(() => setInstruments(tickPrices), 1500);
    return () => clearInterval(id);
  }, []);

  // When the user clicks a row, select it locally AND broadcast to the bridge.
  const handleSelect = useCallback((inst: Instrument) => {
    setSelected(inst.ticker);
    adapterRef.current?.broadcastInstrument(inst.ticker, inst.name);
  }, []);

  return (
    <div className="app">
      <Header bridgeInfo={bridgeInfo} />
      <main className="board">
        <table className="quote-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Name</th>
              <th>Sector</th>
              <th className="num">Price</th>
              <th className="num">Change</th>
              <th className="num">Change %</th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((inst) => (
              <QuoteRow
                key={inst.ticker}
                inst={inst}
                isSelected={selected === inst.ticker}
                onClick={handleSelect}
              />
            ))}
          </tbody>
        </table>
      </main>
      <BridgeStatusBar bridgeInfo={bridgeInfo} />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Header({ bridgeInfo }: { bridgeInfo: BridgeInfo }): JSX.Element {
  const dot = bridgeInfo.state === 'connected' ? 'dot green'
    : bridgeInfo.state === 'connecting' ? 'dot amber'
    : 'dot red';

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="app-title">Price Alert Board</span>
        <span className="app-subtitle">Standalone · Non-FDC3-Native</span>
      </div>
      <div className="bridge-badge">
        <span className={dot} />
        <span className="bridge-label">
          {bridgeInfo.state === 'connected' ? 'Bridge connected'
            : bridgeInfo.state === 'connecting' ? 'Connecting…'
            : bridgeInfo.state === 'error' ? 'Bridge error'
            : 'Bridge disconnected'}
        </span>
      </div>
    </header>
  );
}

interface QuoteRowProps {
  inst: Instrument;
  isSelected: boolean;
  onClick: (inst: Instrument) => void;
}

function QuoteRow({ inst, isSelected, onClick }: QuoteRowProps): JSX.Element {
  const up = inst.change >= 0;
  return (
    <tr
      className={`quote-row${isSelected ? ' selected' : ''}`}
      onClick={() => onClick(inst)}
      title="Click to broadcast this instrument via the FDC3 Bridge"
    >
      <td className="ticker">{inst.ticker}</td>
      <td className="name">{inst.name}</td>
      <td className="sector">{inst.sector}</td>
      <td className="num price">{inst.price.toFixed(2)}</td>
      <td className={`num change ${up ? 'pos' : 'neg'}`}>
        {up ? '+' : ''}{inst.change.toFixed(2)}
      </td>
      <td className={`num change ${up ? 'pos' : 'neg'}`}>
        {up ? '▲' : '▼'} {Math.abs(inst.changePct).toFixed(2)}%
      </td>
    </tr>
  );
}

function BridgeStatusBar({ bridgeInfo }: { bridgeInfo: BridgeInfo }): JSX.Element {
  const fmt = (ts: number | null) =>
    ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—';

  return (
    <footer className="bridge-bar">
      <span className="bridge-bar-label">FDC3 Bridge</span>
      <span className="bridge-bar-endpoint">{bridgeInfo.endpoint}</span>
      {bridgeInfo.state === 'connected' ? (
        <>
          <span className="bridge-bar-sep">·</span>
          <span className="bridge-bar-hint">Click any row to broadcast <code>fdc3.instrument</code> to connected agents</span>
          {bridgeInfo.lastContextTicker && (
            <>
              <span className="bridge-bar-sep">·</span>
              <span className="bridge-bar-received">
                Last received: <strong>{bridgeInfo.lastContextTicker}</strong> at {fmt(bridgeInfo.lastContextAt)}
              </span>
            </>
          )}
        </>
      ) : bridgeInfo.state === 'error' ? (
        <>
          <span className="bridge-bar-sep">·</span>
          <span className="bridge-bar-error">{bridgeInfo.error}</span>
        </>
      ) : bridgeInfo.state === 'connecting' ? (
        <>
          <span className="bridge-bar-sep">·</span>
          <span className="bridge-bar-hint">Connecting… start <code>nx serve backplane-stub</code> if not running</span>
        </>
      ) : (
        <>
          <span className="bridge-bar-sep">·</span>
          <span className="bridge-bar-hint">Reconnecting in 5 s — start <code>nx serve backplane-stub</code></span>
        </>
      )}
    </footer>
  );
}
