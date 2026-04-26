/**
 * PaymentAction — FDC3 Demo App
 *
 * Demonstrates:
 *   - fdc3.addIntentListener('StartPayment') — receives intent from Customer Profile
 *   - Pre-fills form from com.demo.paymentRequest context
 *   - Shows approve / reject workflow
 *
 * This is the TARGET of the intent routing demo.
 * Customer Profile raises 'StartPayment' → this app opens and handles it.
 */
import React, { useEffect, useState } from 'react';
import type { PaymentRequestContext } from '@fdc3-poc/fdc3-core';
import { getCustomerById } from '@fdc3-poc/shared-domain';
import { AppHeader, StatusBadge } from '@fdc3-poc/shared-ui';

interface PaymentForm {
  customerId: string;
  customerName: string;
  amount: string;
  currency: string;
  reference: string;
  description: string;
  recipientName: string;
  recipientIban: string;
}

type PaymentStatus = 'idle' | 'pending' | 'approved' | 'rejected';

const EMPTY_FORM: PaymentForm = {
  customerId: '',
  customerName: '',
  amount: '',
  currency: 'EUR',
  reference: '',
  description: '',
  recipientName: '',
  recipientIban: '',
};

export function PaymentAction() {
  const [form, setForm] = useState<PaymentForm>(EMPTY_FORM);
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [fromIntent, setFromIntent] = useState(false);

  useEffect(() => {
    if (!window.fdc3) return;

    const unsub = window.fdc3.addIntentListener('StartPayment', (ctx?: PaymentRequestContext) => {
      if (!ctx) return;
      const customer = ctx.customerId ? getCustomerById(ctx.customerId) : null;
      setForm({
        customerId: ctx.customerId ?? '',
        customerName: customer?.name ?? ctx.customerId ?? '',
        amount: String(ctx.amount ?? ''),
        currency: ctx.currency ?? 'EUR',
        reference: ctx.reference ?? `PAY-${Date.now()}`,
        description: ctx.description ?? '',
        recipientName: customer?.name ?? '',
        recipientIban: '',
      });
      setFromIntent(true);
      setStatus('pending');
    });

    return () => unsub();
  }, []);

  const handleField = (key: keyof PaymentForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleApprove = () => {
    setStatus('approved');
    setTimeout(() => { setStatus('idle'); setForm(EMPTY_FORM); setFromIntent(false); }, 3000);
  };

  const handleReject = () => {
    setStatus('rejected');
    setTimeout(() => { setStatus('idle'); setForm(EMPTY_FORM); setFromIntent(false); }, 2000);
  };

  const handleNew = () => {
    setForm({ ...EMPTY_FORM, currency: 'EUR' });
    setStatus('pending');
    setFromIntent(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f9fc' }}>
      <AppHeader title="Payment Action" icon="💳">
        {fromIntent && (
          <span style={{ fontSize: 11, background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
            Via intent
          </span>
        )}
      </AppHeader>

      {status === 'approved' && (
        <Banner color="#e8f5e9" textColor="#2e7d32" icon="✅" message={`Payment ${form.reference} APPROVED`} />
      )}
      {status === 'rejected' && (
        <Banner color="#fce8e8" textColor="#c62828" icon="❌" message="Payment REJECTED" />
      )}

      {status === 'idle' ? (
        <IdleState onNew={handleNew} />
      ) : status !== 'approved' && status !== 'rejected' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 20, border: '1px solid #e0e0ee', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1a3e' }}>New Payment Instruction</div>
                <div style={{ fontSize: 12, color: '#8080a0', marginTop: 2 }}>
                  {fromIntent ? 'Pre-filled from StartPayment intent · ' : ''}{form.reference}
                </div>
              </div>
              <StatusBadge label="Pending Review" variant="warning" />
            </div>

            {/* Form */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <FormField label="Customer" value={form.customerName} onChange={(v) => handleField('customerName', v)} readOnly={fromIntent} />
              <FormField label="Customer ID" value={form.customerId} onChange={(v) => handleField('customerId', v)} readOnly={fromIntent} mono />
              <FormField label="Amount" value={form.amount} onChange={(v) => handleField('amount', v)} type="number" />
              <FormField label="Currency" value={form.currency} onChange={(v) => handleField('currency', v)} />
              <FormField label="Recipient Name" value={form.recipientName} onChange={(v) => handleField('recipientName', v)} />
              <FormField label="Recipient IBAN" value={form.recipientIban} onChange={(v) => handleField('recipientIban', v)} mono />
              <div style={{ gridColumn: '1 / -1' }}>
                <FormField label="Description" value={form.description} onChange={(v) => handleField('description', v)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <FormField label="Reference" value={form.reference} onChange={(v) => handleField('reference', v)} mono />
              </div>
            </div>

            {/* Summary */}
            <div style={{ background: '#f8f8ff', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, color: '#6060a0' }}>Payment Total</div>
              <div style={{ fontWeight: 800, fontSize: 22, color: '#1a1a3e' }}>
                {form.currency} {Number(form.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleApprove} style={{ flex: 1, padding: '11px', background: '#2e7d32', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                ✓ Approve Payment
              </button>
              <button onClick={handleReject} style={{ padding: '11px 20px', background: '#fff', border: '1.5px solid #c62828', borderRadius: 8, color: '#c62828', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                ✗ Reject
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Banner({ color, textColor, icon, message }: { color: string; textColor: string; icon: string; message: string }) {
  return (
    <div style={{ padding: '12px 16px', background: color, borderBottom: `1px solid ${textColor}44`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: textColor }}>
      {icon} {message}
    </div>
  );
}

function IdleState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9090b0', gap: 16 }}>
      <div style={{ fontSize: 56 }}>💳</div>
      <div style={{ fontWeight: 600, fontSize: 15 }}>No payment in progress</div>
      <div style={{ fontSize: 13, maxWidth: 280, textAlign: 'center', lineHeight: 1.6 }}>
        Waiting for a <strong>StartPayment</strong> intent.<br />
        In <strong>Customer Profile</strong>, click <em>"Start Payment"</em> to trigger this app via FDC3 intent routing.
      </div>
      <button onClick={onNew} style={{ padding: '8px 20px', background: '#4080e8', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
        + New Payment (manual)
      </button>
    </div>
  );
}

function FormField({ label, value, onChange, readOnly, mono, type }: { label: string; value: string; onChange: (v: string) => void; readOnly?: boolean; mono?: boolean; type?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, color: '#9090b0', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: mono ? 'monospace' : 'inherit', border: '1px solid #d0d0e0', borderRadius: 6, outline: 'none', background: readOnly ? '#f8f8ff' : '#fff', color: '#1a1a3e' }}
      />
    </div>
  );
}
