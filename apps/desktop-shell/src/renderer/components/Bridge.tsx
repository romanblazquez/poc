import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

type BridgeProvider = 'finos-backplane';
type BridgeStatusState = 'disabled' | 'scanning' | 'available' | 'unavailable' | 'error';

interface BridgeSettings {
  enabled: boolean;
  provider: BridgeProvider;
  host: string;
  portStart: number;
  portEnd: number;
  endpointUrl: string;
}

interface BridgeCandidate {
  host: string;
  port: number;
  endpointUrl: string;
  latencyMs: number;
}

interface BridgeStatus {
  state: BridgeStatusState;
  provider: BridgeProvider;
  settings: BridgeSettings;
  candidates: BridgeCandidate[];
  selected: BridgeCandidate | null;
  lastCheckedAt: number | null;
  lastError: string | null;
  notes: string[];
}

interface BridgeApi {
  getStatus(): Promise<BridgeStatus | null>;
  scan(): Promise<BridgeStatus | null>;
  updateSettings(patch: Partial<BridgeSettings>): Promise<BridgeStatus | null>;
  onStatusChanged(handler: (status: BridgeStatus) => void): () => void;
}

function getBridgeApi(): BridgeApi | undefined {
  const api = (window as unknown as { shellChrome?: { bridge?: BridgeApi } }).shellChrome?.bridge;
  if (!api || typeof api.getStatus !== 'function') return undefined;
  return api;
}

const SECTION: CSSProperties = {
  background: 'linear-gradient(180deg, var(--shell-panel), var(--shell-panel-2))',
  border: '1px solid var(--shell-border)',
  borderRadius: 12,
  boxShadow: 'var(--shell-shadow)',
  overflow: 'hidden',
};
const SECTION_HEADER: CSSProperties = {
  alignItems: 'center',
  borderBottom: '1px solid var(--shell-border)',
  color: 'var(--shell-muted)',
  display: 'flex',
  fontSize: 11,
  fontWeight: 900,
  justifyContent: 'space-between',
  letterSpacing: 0.7,
  padding: '10px 12px',
  textTransform: 'uppercase',
};
const SECTION_BODY: CSSProperties = { padding: 12 };
const INPUT: CSSProperties = {
  background: 'var(--shell-panel-2)',
  border: '1px solid var(--shell-border)',
  borderRadius: 6,
  boxSizing: 'border-box',
  color: 'var(--shell-text)',
  fontSize: 13,
  outline: 'none',
  padding: '6px 9px',
  width: '100%',
};
const BUTTON_PRIMARY: CSSProperties = {
  background: 'var(--shell-accent-soft)',
  border: '1px solid var(--shell-accent-border)',
  borderRadius: 6,
  color: 'var(--shell-text)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 800,
  padding: '7px 14px',
};
const BUTTON_GHOST: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--shell-border)',
  borderRadius: 6,
  color: 'var(--shell-muted)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 800,
  padding: '7px 14px',
};

const DEFAULT_SETTINGS: BridgeSettings = {
  enabled: false,
  provider: 'finos-backplane',
  host: '127.0.0.1',
  portStart: 4475,
  portEnd: 4575,
  endpointUrl: '',
};

function formatTime(ts: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function stateLabel(state: BridgeStatusState): string {
  switch (state) {
    case 'disabled': return 'Disabled';
    case 'scanning': return 'Scanning';
    case 'available': return 'Available';
    case 'unavailable': return 'Unavailable';
    case 'error': return 'Error';
    default: return state;
  }
}

function stateColor(state: BridgeStatusState): string {
  switch (state) {
    case 'available': return 'var(--shell-positive)';
    case 'scanning': return 'var(--shell-accent)';
    case 'error': return 'var(--shell-negative)';
    case 'unavailable': return '#f59e0b';
    case 'disabled':
    default: return 'var(--shell-muted)';
  }
}

export function Bridge(): JSX.Element {
  const api = getBridgeApi();
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [form, setForm] = useState<BridgeSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!api) return;
    const next = await api.getStatus();
    if (next) {
      setStatus(next);
      setForm(next.settings);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    if (!api) return undefined;
    return api.onStatusChanged((next) => {
      setStatus(next);
      setForm(next.settings);
    });
  }, [api, refresh]);

  const dirty = useMemo(() => {
    if (!status) return false;
    return JSON.stringify(status.settings) !== JSON.stringify(form);
  }, [form, status]);

  const save = useCallback(async () => {
    if (!api) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.updateSettings({
        ...form,
        portStart: Number(form.portStart),
        portEnd: Number(form.portEnd),
      });
      if (next) {
        setStatus(next);
        setForm(next.settings);
      }
      setMessage('Bridge settings saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [api, form]);

  const scan = useCallback(async () => {
    if (!api) return;
    setBusy(true);
    setMessage(null);
    try {
      if (dirty) await save();
      const next = await api.scan();
      if (next) {
        setStatus(next);
        setForm(next.settings);
      }
      setMessage(next?.state === 'available'
        ? `Detected ${next.candidates.length} FINOS Backplane candidate${next.candidates.length === 1 ? '' : 's'}.`
        : 'Scan complete.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [api, dirty, save]);

  if (!api) {
    return (
      <div style={{ color: 'var(--shell-muted)', fontSize: 13, padding: 20 }}>
        Bridge API unavailable in this renderer.
      </div>
    );
  }

  const current = status ?? {
    state: 'disabled' as BridgeStatusState,
    provider: 'finos-backplane' as BridgeProvider,
    settings: form,
    candidates: [],
    selected: null,
    lastCheckedAt: null,
    lastError: null,
    notes: [],
  };

  return (
    <div style={{ color: 'var(--shell-text)', display: 'grid', gap: 12, gridTemplateRows: 'auto 1fr', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1.25fr 1fr' }}>
        <section style={SECTION}>
          <div style={SECTION_HEADER}>
            <span>FINOS Bridge Status</span>
            <span style={{ alignItems: 'center', display: 'inline-flex', gap: 6 }}>
              <span style={{ background: stateColor(current.state), borderRadius: '50%', height: 8, width: 8 }} />
              {stateLabel(current.state)}
            </span>
          </div>
          <div style={{ ...SECTION_BODY, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <Metric label="Provider" value="FINOS Backplane" />
              <Metric label="Selected endpoint" value={current.selected?.endpointUrl ?? '-'} />
              <Metric label="Candidates" value={String(current.candidates.length)} />
              <Metric label="Last checked" value={formatTime(current.lastCheckedAt)} />
            </div>
            {current.lastError ? (
              <div style={{ background: 'rgba(180, 35, 24, 0.10)', border: '1px solid rgba(180, 35, 24, 0.35)', borderRadius: 8, color: '#fca5a5', fontSize: 12, fontWeight: 750, padding: 10 }}>
                {current.lastError}
              </div>
            ) : null}
            <div style={{ background: 'rgba(64, 128, 232, 0.08)', border: '1px solid var(--shell-accent-border)', borderRadius: 8, color: 'var(--shell-muted)', display: 'grid', gap: 6, fontSize: 12, lineHeight: 1.45, padding: 10 }}>
              <strong style={{ color: 'var(--shell-text)' }}>Non-experimental scope</strong>
              <span>This console detects readiness for an official FINOS-style local Backplane service. It does not route FDC3 traffic through Desktop Agent Bridging.</span>
              <span>DesktopAgentBridging remains false in fdc3.getInfo(); the experimental DAB protocol is documented for a future standards-track pass.</span>
            </div>
          </div>
        </section>

        <section style={SECTION}>
          <div style={SECTION_HEADER}>
            <span>Discovery Settings</span>
            <span>{dirty ? 'Unsaved' : 'Saved'}</span>
          </div>
          <div style={{ ...SECTION_BODY, display: 'grid', gap: 10 }}>
            <label style={{ alignItems: 'center', display: 'flex', gap: 8, fontSize: 12, fontWeight: 800 }}>
              <input
                checked={form.enabled}
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  setForm((f) => ({ ...f, enabled }));
                }}
                type="checkbox"
              />
              Enable FINOS Backplane discovery
            </label>
            <Field label="Host">
              <input
                style={INPUT}
                value={form.host}
                onChange={(event) => {
                  const host = event.currentTarget.value;
                  setForm((f) => ({ ...f, host }));
                }}
              />
            </Field>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Port start">
                <input
                  style={INPUT}
                  type="number"
                  value={form.portStart}
                  onChange={(event) => {
                    const portStart = Number(event.currentTarget.value);
                    setForm((f) => ({ ...f, portStart }));
                  }}
                />
              </Field>
              <Field label="Port end">
                <input
                  style={INPUT}
                  type="number"
                  value={form.portEnd}
                  onChange={(event) => {
                    const portEnd = Number(event.currentTarget.value);
                    setForm((f) => ({ ...f, portEnd }));
                  }}
                />
              </Field>
            </div>
            <Field label="Explicit endpoint">
              <input
                placeholder="ws://127.0.0.1:4475"
                style={INPUT}
                value={form.endpointUrl}
                onChange={(event) => {
                  const endpointUrl = event.currentTarget.value;
                  setForm((f) => ({ ...f, endpointUrl }));
                }}
              />
            </Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button disabled={busy || !dirty} onClick={save} style={{ ...BUTTON_GHOST, opacity: busy || !dirty ? 0.55 : 1 }} type="button">Save</button>
              <button disabled={busy} onClick={scan} style={{ ...BUTTON_PRIMARY, opacity: busy ? 0.55 : 1 }} type="button">{busy ? 'Working...' : 'Scan'}</button>
            </div>
            {message ? <div style={{ color: 'var(--shell-muted)', fontSize: 12, fontWeight: 750 }}>{message}</div> : null}
          </div>
        </section>
      </div>

      <section style={{ ...SECTION, minHeight: 0 }}>
        <div style={SECTION_HEADER}>
          <span>Detected Candidates</span>
          <span>{current.candidates.length} endpoint{current.candidates.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{ overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr style={{ color: 'var(--shell-muted)', textAlign: 'left' }}>
                <th style={TH}>Endpoint</th>
                <th style={TH}>Host</th>
                <th style={TH}>Port</th>
                <th style={TH}>Latency</th>
                <th style={TH}>Role</th>
              </tr>
            </thead>
            <tbody>
              {current.candidates.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--shell-muted)', padding: 16, textAlign: 'center' }}>
                    No local Backplane service detected yet.
                  </td>
                </tr>
              ) : current.candidates.map((candidate) => (
                <tr key={`${candidate.host}:${candidate.port}`} style={{ borderTop: '1px solid var(--shell-border)' }}>
                  <td style={TD}>{candidate.endpointUrl}</td>
                  <td style={TD}>{candidate.host}</td>
                  <td style={TD}>{candidate.port}</td>
                  <td style={TD}>{candidate.latencyMs} ms</td>
                  <td style={TD}>{current.selected?.port === candidate.port && current.selected.host === candidate.host ? 'selected' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const TH: CSSProperties = { borderBottom: '1px solid var(--shell-border)', fontWeight: 900, padding: '9px 12px' };
const TD: CSSProperties = { color: 'var(--shell-text)', fontWeight: 700, padding: '9px 12px' };

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--shell-border)', borderRadius: 8, minWidth: 0, padding: 10 }}>
      <div style={{ color: 'var(--shell-muted)', fontSize: 10, fontWeight: 900, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: 'var(--shell-text)', fontSize: 13, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ color: 'var(--shell-muted)', fontSize: 11, fontWeight: 850 }}>{label}</span>
      {children}
    </label>
  );
}
