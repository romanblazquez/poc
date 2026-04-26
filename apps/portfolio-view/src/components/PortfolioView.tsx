/**
 * PortfolioView — FDC3 Demo App
 *
 * Demonstrates:
 *   - fdc3.addContextListener('fdc3.contact') — loads portfolio when customer changes
 *   - fdc3.broadcast('fdc3.instrument') — click a position to highlight in Market Watch
 *   - fdc3.addIntentListener('ViewPortfolio') — handles ViewPortfolio intent
 */
import React, { useEffect, useState, useCallback } from 'react';
import type { ContactContext, InstrumentContext } from '@fdc3-poc/fdc3-core';
import { getPortfolioByCustomer, getCustomerById } from '@fdc3-poc/shared-domain';
import type { PortfolioPosition } from '@fdc3-poc/shared-domain';
import { AppHeader } from '@fdc3-poc/shared-ui';

export function PortfolioView() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  useEffect(() => {
    if (!window.fdc3) return;

    const loadPortfolio = (customerId: string) => {
      const ps = getPortfolioByCustomer(customerId);
      const cust = getCustomerById(customerId);
      setPositions(ps);
      setCustomerName(cust?.name ?? customerId);
    };

    const unsub1 = window.fdc3.addContextListener('fdc3.contact', (ctx: ContactContext) => {
      if (ctx.id?.customerId) loadPortfolio(ctx.id.customerId);
    });

    const unsub2 = window.fdc3.addIntentListener('ViewPortfolio', (ctx?: ContactContext) => {
      if (ctx?.id?.customerId) loadPortfolio(ctx.id.customerId);
    });

    return () => { unsub1(); unsub2(); };
  }, []);

  const handlePositionClick = useCallback(async (pos: PortfolioPosition) => {
    if (!window.fdc3) return;
    const ctx: InstrumentContext = {
      type: 'fdc3.instrument',
      name: pos.name,
      id: { ticker: pos.ticker, ISIN: pos.isin },
    };
    setSelectedTicker(pos.ticker);
    await window.fdc3.broadcast(ctx);
  }, []);

  const totalValue = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
  const totalPnL = positions.reduce(
    (sum, p) => sum + p.quantity * (p.currentPrice - p.avgCost),
    0,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f9fc' }}>
      <AppHeader title="Portfolio View" icon="📊" />

      {positions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 16, padding: '12px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
            <SummaryCard label="Portfolio" value={customerName} />
            <SummaryCard label="Total Value" value={`USD ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} highlight />
            <SummaryCard label="Total P&L" value={`${totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} pnl={totalPnL} />
            <SummaryCard label="Positions" value={String(positions.length)} />
          </div>

          {/* Positions table */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
            <div style={{ marginTop: 12, marginBottom: 8, fontSize: 11, color: '#9090b0' }}>
              Click a row to broadcast fdc3.instrument context to Market Watch.
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f0f0f8' }}>
                  {['Instrument', 'Ticker', 'Qty', 'Avg Cost', 'Last', 'P&L', 'P&L %'].map((h) => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Instrument' || h === 'Ticker' ? 'left' : 'right', color: '#6060a0', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e0e0ee' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => {
                  const pnl = pos.quantity * (pos.currentPrice - pos.avgCost);
                  const pnlPct = ((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100;
                  const isSelected = selectedTicker === pos.ticker;
                  return (
                    <tr
                      key={pos.ticker}
                      onClick={() => void handlePositionClick(pos)}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? '#e8f0ff' : 'transparent',
                        borderBottom: '1px solid #f0f0f8',
                        transition: 'background 0.1s',
                      }}
                    >
                      <td style={{ padding: '9px 10px', fontWeight: 600, color: '#1a1a3e' }}>{pos.name}</td>
                      <td style={{ padding: '9px 10px', fontFamily: 'monospace', color: '#4060a0', fontWeight: 700 }}>{pos.ticker}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#404060' }}>{pos.quantity.toLocaleString()}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#606080' }}>{pos.avgCost.toFixed(2)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#1a1a3e' }}>{pos.currentPrice.toFixed(2)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: pnl >= 0 ? '#2e7d32' : '#c62828' }}>
                        {pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: pnlPct >= 0 ? '#2e7d32' : '#c62828' }}>
                        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, highlight, pnl }: { label: string; value: string; highlight?: boolean; pnl?: number }) {
  const color = pnl !== undefined ? (pnl >= 0 ? '#2e7d32' : '#c62828') : (highlight ? '#1a1a3e' : '#404060');
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: '#9090b0', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9090b0', gap: 12 }}>
      <div style={{ fontSize: 48 }}>📊</div>
      <div style={{ fontWeight: 600, fontSize: 15 }}>No portfolio loaded</div>
      <div style={{ fontSize: 13, maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
        Join a channel, then select a customer in <strong>Customer Search</strong> to load their portfolio.
      </div>
    </div>
  );
}
