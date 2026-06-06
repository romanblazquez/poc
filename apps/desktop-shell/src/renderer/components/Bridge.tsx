import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Input } from './ui/input.js';
import { Switch } from './ui/switch.js';

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

const DEFAULT_SETTINGS: BridgeSettings = {
  enabled: false,
  provider: 'finos-backplane',
  host: '127.0.0.1',
  portStart: 4475,
  portEnd: 4575,
  endpointUrl: '',
};

function getBridgeApi(): BridgeApi | undefined {
  const api = (window as unknown as { shellChrome?: { bridge?: BridgeApi } }).shellChrome?.bridge;
  if (!api || typeof api.getStatus !== 'function') return undefined;
  return api;
}

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

function stateBadge(state: BridgeStatusState): 'secondary' | 'success' | 'warning' | 'destructive' | 'default' {
  switch (state) {
    case 'available': return 'success';
    case 'scanning': return 'default';
    case 'error': return 'destructive';
    case 'unavailable': return 'warning';
    case 'disabled':
    default: return 'secondary';
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
      <Card className="p-5 text-sm font-bold text-muted-foreground">
        Bridge API unavailable in this renderer.
      </Card>
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
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
      <div className="grid shrink-0 gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 border-b">
            <CardTitle>FINOS Bridge Status</CardTitle>
            <Badge variant={stateBadge(current.state)}>{stateLabel(current.state)}</Badge>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4">
            <div className="grid gap-2 md:grid-cols-4">
              <Metric label="Provider" value="FINOS Backplane" />
              <Metric label="Selected endpoint" value={current.selected?.endpointUrl ?? '-'} />
              <Metric label="Candidates" value={String(current.candidates.length)} />
              <Metric label="Last checked" value={formatTime(current.lastCheckedAt)} />
            </div>
            {current.lastError ? (
              <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--shell-negative)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--shell-negative)_12%,transparent)] p-3 text-xs font-bold text-[color:var(--shell-negative)]">
                {current.lastError}
              </div>
            ) : null}
            <div className="grid gap-1 rounded-lg border border-[color:var(--shell-accent-border)] bg-[color:rgba(64,128,232,0.08)] p-3 text-xs font-bold leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Non-experimental scope</strong>
              <span>This console detects readiness for an official FINOS-style local Backplane service. It does not route FDC3 traffic through Desktop Agent Bridging.</span>
              <span>DesktopAgentBridging remains false in fdc3.getInfo(); the experimental DAB protocol is documented for a future standards-track pass.</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 border-b">
            <CardTitle>Discovery Settings</CardTitle>
            <Badge variant={dirty ? 'warning' : 'secondary'}>{dirty ? 'Unsaved' : 'Saved'}</Badge>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4">
            <label className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs font-black text-foreground">
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => {
                  setForm((f) => ({ ...f, enabled }));
                }}
                aria-label="Toggle FINOS Backplane discovery"
              />
              Enable FINOS Backplane discovery
            </label>
            <Field label="Host">
              <Input
                value={form.host}
                onChange={(event) => {
                  const host = event.currentTarget.value;
                  setForm((f) => ({ ...f, host }));
                }}
              />
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Port start">
                <Input
                  type="number"
                  value={form.portStart}
                  onChange={(event) => {
                    const portStart = Number(event.currentTarget.value);
                    setForm((f) => ({ ...f, portStart }));
                  }}
                />
              </Field>
              <Field label="Port end">
                <Input
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
              <Input
                placeholder="ws://127.0.0.1:4475"
                value={form.endpointUrl}
                onChange={(event) => {
                  const endpointUrl = event.currentTarget.value;
                  setForm((f) => ({ ...f, endpointUrl }));
                }}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button disabled={busy || !dirty} onClick={save} type="button" variant="outline">Save</Button>
              <Button disabled={busy} onClick={scan} type="button">{busy ? 'Working...' : 'Scan'}</Button>
            </div>
            {message ? <div className="text-xs font-bold text-muted-foreground">{message}</div> : null}
          </CardContent>
        </Card>
      </div>

      <Card className="flex min-h-0 flex-col">
        <CardHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b">
          <CardTitle>Detected Candidates</CardTitle>
          <Badge variant="outline">{current.candidates.length} endpoint{current.candidates.length === 1 ? '' : 's'}</Badge>
        </CardHeader>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                {['Endpoint', 'Host', 'Port', 'Latency', 'Role'].map((heading) => (
                  <th key={heading} className="border-b px-3 py-2 text-xs font-black uppercase tracking-[0.06em]">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {current.candidates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm font-bold text-muted-foreground">
                    No local Backplane service detected yet.
                  </td>
                </tr>
              ) : current.candidates.map((candidate) => (
                <tr key={`${candidate.host}:${candidate.port}`} className="border-t">
                  <td className="px-3 py-2 font-bold text-foreground">{candidate.endpointUrl}</td>
                  <td className="px-3 py-2 font-bold text-foreground">{candidate.host}</td>
                  <td className="px-3 py-2 font-bold text-foreground">{candidate.port}</td>
                  <td className="px-3 py-2 font-bold text-foreground">{candidate.latencyMs} ms</td>
                  <td className="px-3 py-2">
                    {current.selected?.port === candidate.port && current.selected.host === candidate.host
                      ? <Badge variant="success">selected</Badge>
                      : <Badge variant="secondary">standby</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-[color:rgba(255,255,255,0.025)] p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-black text-foreground">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-black text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
