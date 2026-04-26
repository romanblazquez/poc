/**
 * CustomerSearch — FDC3 Demo App
 *
 * Demonstrates: fdc3.broadcast() with fdc3.contact context.
 * When the user clicks a customer row, all apps on the same channel
 * that listen for fdc3.contact will receive the context update.
 */
import React, { useState, useCallback } from 'react';
import type { ContactContext } from '@fdc3-poc/fdc3-core';
import { CUSTOMERS } from '@fdc3-poc/shared-domain';
import type { Customer } from '@fdc3-poc/shared-domain';
import { AppHeader } from '@fdc3-poc/shared-ui';

const SEGMENT_COLORS: Record<string, string> = {
  'Private Banking': '#9040e8',
  Institutional: '#4080e8',
  Corporate: '#40c080',
  Retail: '#e87040',
};

export function CustomerSearch() {
  const [query, setQuery] = useState('');
  const [lastBroadcast, setLastBroadcast] = useState<string | null>(null);

  const filtered = CUSTOMERS.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.customerId.toLowerCase().includes(query.toLowerCase()) ||
      c.segment.toLowerCase().includes(query.toLowerCase()),
  );

  const handleSelect = useCallback(async (customer: Customer) => {
    if (!window.fdc3) {
      alert('window.fdc3 is not available — are you running inside the Electron shell?');
      return;
    }

    const context: ContactContext = {
      type: 'fdc3.contact',
      name: customer.name,
      id: {
        customerId: customer.customerId,
        email: customer.email,
      },
    };

    await window.fdc3.broadcast(context);
    setLastBroadcast(customer.name);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f9fc' }}>
      <AppHeader title="Customer Search" icon="🔍" />

      <div style={{ padding: '16px 16px 8px' }}>
        <input
          type="text"
          placeholder="Search by name, ID, or segment…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            fontSize: 14,
            border: '1.5px solid #d0d0e0',
            borderRadius: 8,
            outline: 'none',
            background: '#fff',
            color: '#1a1a2e',
          }}
        />
      </div>

      {lastBroadcast && (
        <div
          style={{
            margin: '0 16px 8px',
            padding: '8px 12px',
            background: '#e8f5e9',
            borderRadius: 6,
            fontSize: 12,
            color: '#2e7d32',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>📡</span>
          <span>
            Broadcast sent: <strong>{lastBroadcast}</strong> — all apps on your channel will update.
          </span>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9090a0', padding: 40, fontSize: 14 }}>
            No customers match your search.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f0f0f8' }}>
                {['Customer', 'ID', 'Segment', 'RM', 'Country', 'Status'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      color: '#6060a0',
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      borderBottom: '1px solid #e0e0ee',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <CustomerRow
                  key={customer.customerId}
                  customer={customer}
                  onSelect={handleSelect}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div
        style={{
          padding: '8px 16px',
          borderTop: '1px solid #e0e0ee',
          fontSize: 11,
          color: '#9090b0',
          background: '#f8f9fc',
        }}
      >
        {filtered.length} customer{filtered.length !== 1 ? 's' : ''} · Click a row to broadcast
        fdc3.contact context
      </div>
    </div>
  );
}

function CustomerRow({
  customer,
  onSelect,
}: {
  customer: Customer;
  onSelect: (c: Customer) => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <tr
      onClick={() => void onSelect(customer)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        background: hover ? '#f0f0ff' : 'transparent',
        transition: 'background 0.1s',
        borderBottom: '1px solid #f0f0f8',
      }}
    >
      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1a1a3e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: '#4080e822',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {customer.name.charAt(0)}
          </div>
          {customer.name}
        </div>
      </td>
      <td style={{ padding: '10px 12px', color: '#6060a0', fontFamily: 'monospace' }}>
        {customer.customerId}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span
          style={{
            background: (SEGMENT_COLORS[customer.segment] ?? '#888') + '22',
            color: SEGMENT_COLORS[customer.segment] ?? '#888',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {customer.segment}
        </span>
      </td>
      <td style={{ padding: '10px 12px', color: '#404060' }}>{customer.relationship_manager}</td>
      <td style={{ padding: '10px 12px', color: '#404060' }}>{customer.country}</td>
      <td style={{ padding: '10px 12px' }}>
        <span
          style={{
            background: customer.relationship === 'Active' ? '#e8f5e9' : '#f5f5f5',
            color: customer.relationship === 'Active' ? '#2e7d32' : '#757575',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {customer.relationship}
        </span>
      </td>
    </tr>
  );
}
