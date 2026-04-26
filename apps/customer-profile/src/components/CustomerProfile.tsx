/**
 * CustomerProfile — FDC3 Demo App
 *
 * Demonstrates:
 *   - fdc3.addContextListener('fdc3.contact') — receives context from Customer Search
 *   - fdc3.raiseIntent('StartPayment') — sends intent to Payment Action
 *   - fdc3.addIntentListener('ViewContact') — handles ViewContact intent
 */
import React, { useEffect, useState, useCallback } from 'react';
import type { ContactContext, PaymentRequestContext } from '@fdc3-poc/fdc3-core';
import { getCustomerById, getAccountsByCustomer, getTransactionsByCustomer } from '@fdc3-poc/shared-domain';
import type { Customer, Account, Transaction } from '@fdc3-poc/shared-domain';
import { AppHeader, StatusBadge } from '@fdc3-poc/shared-ui';

export function CustomerProfile() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [intentStatus, setIntentStatus] = useState('');

  useEffect(() => {
    if (!window.fdc3) return;

    // Listen for fdc3.contact context (broadcast from Customer Search)
    const unsub1 = window.fdc3.addContextListener('fdc3.contact', (ctx: ContactContext) => {
      const id = ctx.id?.customerId;
      if (!id) return;
      const found = getCustomerById(id);
      if (found) {
        setCustomer(found);
        setAccounts(getAccountsByCustomer(id));
        setTransactions(getTransactionsByCustomer(id));
      }
    });

    // Register as handler for ViewContact intent
    const unsub2 = window.fdc3.addIntentListener('ViewContact', (ctx?: ContactContext) => {
      if (!ctx?.id?.customerId) return;
      const found = getCustomerById(ctx.id.customerId);
      if (found) {
        setCustomer(found);
        setAccounts(getAccountsByCustomer(found.customerId));
        setTransactions(getTransactionsByCustomer(found.customerId));
      }
    });

    return () => { unsub1(); unsub2(); };
  }, []);

  const handleStartPayment = useCallback(async () => {
    if (!customer) return;
    const ctx: PaymentRequestContext = {
      type: 'com.demo.paymentRequest',
      customerId: customer.customerId,
      amount: 1250,
      currency: 'EUR',
      description: `Payment for ${customer.name}`,
      reference: `PAY-${Date.now()}`,
    };
    setIntentStatus('Routing intent…');
    try {
      await window.fdc3.raiseIntent('StartPayment', ctx);
      setIntentStatus('Payment Action opened ✓');
    } catch {
      setIntentStatus('No handler for StartPayment');
    }
    setTimeout(() => setIntentStatus(''), 3000);
  }, [customer]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f9fc' }}>
      <AppHeader title="Customer Profile" icon="👤" />

      {!customer ? (
        <EmptyState />
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {/* Customer hero */}
          <div style={{ background: '#fff', borderRadius: 10, padding: 20, marginBottom: 14, border: '1px solid #e8e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#4080e822', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#4080e8' }}>
                  {customer.name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: '#1a1a3e' }}>{customer.name}</div>
                  <div style={{ color: '#8080a0', fontSize: 12, marginTop: 2 }}>
                    {customer.customerId} · {customer.segment}
                  </div>
                </div>
              </div>
              <StatusBadge label={customer.relationship} variant={customer.relationship === 'Active' ? 'success' : 'neutral'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <InfoField label="Email" value={customer.email} />
              <InfoField label="Phone" value={customer.phone} />
              <InfoField label="Country" value={customer.country} />
              <InfoField label="Relationship Manager" value={customer.relationship_manager} />
              <InfoField label="Onboarded" value={customer.onboardedDate} />
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => void handleStartPayment()}
                style={{ padding: '8px 16px', background: '#4080e8', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                💳 Start Payment
              </button>
              {intentStatus && (
                <span style={{ fontSize: 12, color: '#40c080', fontWeight: 500 }}>{intentStatus}</span>
              )}
            </div>
          </div>

          {/* Accounts */}
          {accounts.length > 0 && (
            <Section title="Accounts">
              {accounts.map((acc) => (
                <div key={acc.accountId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f8' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a3e' }}>{acc.type}</div>
                    <div style={{ fontSize: 11, color: '#8080a0', fontFamily: 'monospace', marginTop: 2 }}>{acc.accountNumber}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: acc.balance >= 0 ? '#2e7d32' : '#c62828', fontSize: 14 }}>
                      {acc.currency} {acc.balance.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: '#9090a0' }}>Available: {acc.availableBalance.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Recent transactions */}
          {transactions.length > 0 && (
            <Section title="Recent Transactions">
              {transactions.map((tx) => (
                <div key={tx.txId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f8' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 12, color: '#2a2a4e' }}>{tx.description}</div>
                    <div style={{ fontSize: 11, color: '#9090a0', marginTop: 2 }}>{tx.date} · {tx.category}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: tx.type === 'credit' ? '#2e7d32' : '#c62828', fontSize: 13 }}>
                    {tx.type === 'credit' ? '+' : '-'}{tx.currency} {tx.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9090b0', gap: 12 }}>
      <div style={{ fontSize: 48 }}>👤</div>
      <div style={{ fontWeight: 600, fontSize: 15 }}>No customer selected</div>
      <div style={{ fontSize: 13, maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
        Join a channel, then click a customer in the <strong>Customer Search</strong> app to see their profile here.
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: 14, border: '1px solid #e8e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: '#6060a0', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#9090b0', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#2a2a4e', fontWeight: 500 }}>{value}</div>
    </div>
  );
}
