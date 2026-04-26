/**
 * MarketWatch — FDC3 Demo App
 *
 * Demonstrates:
 *   - fdc3.addContextListener('fdc3.instrument') — highlights instrument when broadcast
 *   - fdc3.addIntentListener('ViewInstrument') — handles ViewInstrument intent
 *   - fdc3.broadcast('fdc3.instrument') — clicking a row broadcasts instrument context
 *
 * Dark terminal-style UI to contrast with the lighter apps.
 */
import React, { useEffect, useState, useCallback } from 'react';
import type { InstrumentContext } from '@fdc3-poc/fdc3-core';
import { MARKET_QUOTES } from '@fdc3-poc/shared-domain';
import type { MarketQuote } from '@fdc3-poc/shared-domain';

// Simulate live price ticks
function useTicker(quotes: MarketQuote[]) {
  const [ticked, setTicked] = useState(quotes);
  useEffect(() => {
    const id = setInterval(() => {
      setTicked((prev) =>
        prev.map((q) => {
          const delta = (Math.random() - 0.5) * q.price * 0.003;
          const newPrice = Math.max(q.price + delta, 0.01);
          return { ...q, price: +newPrice.toFixed(2), change: +(q.change + delta).toFixed(2), changePct: +((q.changePct + (delta / q.price) * 100)).toFixed(2) };
        }),
      );
    }, 2000);
    return () => clearInterval(id);
  }, []);
  return ticked;
}

export function MarketWatch() {
  const quotes = useTicker(MARKET_QUOTES);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [intentStatus, setIntentStatus] = useState('');

  useEffect(() => {
    if (!window.fdc3) return;

    const handleInstrument = (ctx: InstrumentContext) => {
      if (ctx.id?.ticker) setHighlighted(ctx.id.ticker);
    };

    const unsub1 = window.fdc3.addContextListener('fdc3.instrument', handleInstrument);
    const unsub2 = window.fdc3.addIntentListener('ViewInstrument', handleInstrument);

    return () => { unsub1(); unsub2(); };
  }, []);

  const handleRowClick = useCallback(async (q: MarketQuote) => {
    if (!window.fdc3) return;
    setHighlighted(q.ticker);
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: q.name,
      id: { ticker: q.ticker, ISIN: q.isin },
    };
    setIntentStatus('Broadcasting…');
    await window.fdc3.broadcast(ctx);
    setIntentStatus('');
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: '#c9d1d9' }}>
      {/* Dark header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 48, background: '#0a0e14', borderBottom: '1px solid #21262d', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>📈</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#f0f6fc', letterSpacing: 0.3 }}>Market Watch</span>
          <span style={{ fontSize: 10, color: '#238636', background: '#12261e', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>LIVE SIM</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          {intentStatus && <span style={{ color: '#58a6ff' }}>{intentStatus}</span>}
          <ChannelPickerMini />
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#0d1117', zIndex: 1 }}>
            <tr>
              {['Ticker', 'Name', 'Last', 'Change', '%', 'Volume', 'Exchange'].map((h) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Ticker' || h === 'Name' || h === 'Exchange' ? 'left' : 'right', color: '#8b949e', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #21262d' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => {
              const isHighlighted = highlighted === q.ticker;
              const up = q.change >= 0;
              return (
                <tr
                  key={q.ticker}
                  onClick={() => void handleRowClick(q)}
                  style={{
                    cursor: 'pointer',
                    background: isHighlighted ? '#1a3a5e' : 'transparent',
                    borderBottom: '1px solid #161b22',
                    transition: 'background 0.15s',
                  }}
                >
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: isHighlighted ? '#58a6ff' : '#f0f6fc' }}>
                    {q.ticker}
                    {isHighlighted && ' ←'}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#8b949e' }}>{q.name}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: up ? '#3fb950' : '#f85149' }}>
                    {q.price.toFixed(2)}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace', color: up ? '#3fb950' : '#f85149' }}>
                    {up ? '+' : ''}{q.change.toFixed(2)}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: up ? '#3fb950' : '#f85149' }}>
                    {up ? '+' : ''}{q.changePct.toFixed(2)}%
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#8b949e', fontSize: 12 }}>
                    {(q.volume / 1_000_000).toFixed(1)}M
                  </td>
                  <td style={{ padding: '9px 12px', color: '#8b949e', fontSize: 11 }}>{q.exchange}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid #21262d', fontSize: 10, color: '#484f58', background: '#0a0e14' }}>
        Prices simulated · Tick every 2s · Click row to broadcast fdc3.instrument context
      </div>
    </div>
  );
}

// Inline channel picker for the dark theme
function ChannelPickerMini() {
  const [channels, setChannels] = useState<Array<{ id: string; displayMetadata: { name: string; color: string } }>>([]);
  const [current, setCurrent] = useState<{ id: string; displayMetadata: { name: string; color: string } } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!window.fdc3) return;
    void window.fdc3.getUserChannels().then((chs) => setChannels(chs as typeof channels));
    void window.fdc3.getCurrentChannel().then((ch) => setCurrent(ch as typeof current));
    const unsub = window.fdc3.onChannelChanged((ch) => setCurrent(ch as typeof current));
    return unsub;
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'transparent', border: `1px solid ${current?.displayMetadata.color ?? '#444'}`, borderRadius: 5, color: '#c9d1d9', cursor: 'pointer', fontSize: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: current?.displayMetadata.color ?? '#444', display: 'inline-block' }} />
        {current?.displayMetadata.name ?? 'No Channel'}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', right: 0, background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 6, zIndex: 100, minWidth: 140 }}>
          {channels.map((ch) => (
            <button key={ch.id} onClick={() => { void window.fdc3.joinUserChannel(ch.id); setCurrent(ch); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: current?.id === ch.id ? '#1d2d44' : 'transparent', border: 'none', color: '#c9d1d9', padding: '6px 8px', cursor: 'pointer', borderRadius: 4, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: ch.displayMetadata.color, display: 'inline-block' }} />
              {ch.displayMetadata.name}
            </button>
          ))}
          {current && <button onClick={() => { void window.fdc3.leaveCurrentChannel(); setCurrent(null); setOpen(false); }} style={{ width: '100%', background: 'transparent', border: 'none', color: '#8b949e', padding: '5px 8px', cursor: 'pointer', borderRadius: 4, fontSize: 11, textAlign: 'left' }}>Leave</button>}
        </div>
      )}
    </div>
  );
}
