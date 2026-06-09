import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Input } from './ui/input.js';
import { Switch } from './ui/switch.js';
import { Pencil, Trash2 } from 'lucide-react';

// ─── Local type aliases (avoid importing from fdc3-core in renderer directly) ─

type BridgeProvider = 'finos-backplane';
type BridgeStatusState = 'disabled' | 'scanning' | 'available' | 'unavailable' | 'error';

interface BridgeProfile {
  id: string;
  name: string;
  host: string;
  portStart: number;
  portEnd: number;
  endpointUrl: string;
}

interface BridgeSettings {
  enabled: boolean;
  provider: BridgeProvider;
  host: string;
  portStart: number;
  portEnd: number;
  endpointUrl: string;
  profiles?: BridgeProfile[];
  activeProfileId?: string | null;
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
  getProfiles(): Promise<BridgeProfile[]>;
  addProfile(data: Omit<BridgeProfile, 'id'>): Promise<BridgeProfile>;
  updateProfile(id: string, patch: Partial<Omit<BridgeProfile, 'id'>>): Promise<BridgeProfile | null>;
  deleteProfile(id: string): Promise<boolean>;
  activateProfile(id: string): Promise<BridgeSettings | null>;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: BridgeSettings = {
  enabled: false,
  provider: 'finos-backplane',
  host: '127.0.0.1',
  portStart: 4475,
  portEnd: 4575,
  endpointUrl: '',
};

const EMPTY_PROFILE_FORM: Omit<BridgeProfile, 'id'> = {
  name: '',
  host: '127.0.0.1',
  portStart: 4475,
  portEnd: 4575,
  endpointUrl: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function profileEndpoint(p: BridgeProfile): string {
  if (p.endpointUrl.trim()) return p.endpointUrl.trim();
  if (p.portStart === p.portEnd) return `${p.host}:${p.portStart}`;
  return `${p.host}:${p.portStart}-${p.portEnd}`;
}

// ─── Profile form ─────────────────────────────────────────────────────────────

interface ProfileFormProps {
  initial: Omit<BridgeProfile, 'id'>;
  onSave: (data: Omit<BridgeProfile, 'id'>) => void;
  onCancel: () => void;
  saving: boolean;
}

function ProfileForm({ initial, onSave, onCancel, saving }: ProfileFormProps): JSX.Element {
  const [form, setForm] = useState<Omit<BridgeProfile, 'id'>>(initial);

  const valid = form.name.trim() && form.host.trim();

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Profile Name *">
          <Input
            value={form.name}
            placeholder="e.g. Local Dev"
            onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
          />
        </Field>
        <Field label="Host *">
          <Input
            value={form.host}
            placeholder="127.0.0.1"
            onChange={(e) => setForm((f) => ({ ...f, host: e.currentTarget.value }))}
          />
        </Field>
        <Field label="Port Start">
          <Input
            type="number"
            value={form.portStart}
            onChange={(e) => setForm((f) => ({ ...f, portStart: Number(e.currentTarget.value) }))}
          />
        </Field>
        <Field label="Port End">
          <Input
            type="number"
            value={form.portEnd}
            onChange={(e) => setForm((f) => ({ ...f, portEnd: Number(e.currentTarget.value) }))}
          />
        </Field>
        <Field label="Explicit Endpoint URL (optional)" className="sm:col-span-2">
          <Input
            value={form.endpointUrl}
            placeholder="ws://127.0.0.1:4475"
            onChange={(e) => setForm((f) => ({ ...f, endpointUrl: e.currentTarget.value }))}
          />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!valid || saving}
          onClick={() => onSave(form)}
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Bridge(): JSX.Element {
  const api = getBridgeApi();
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [form, setForm] = useState<BridgeSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Profiles state
  const [profiles, setProfiles] = useState<BridgeProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [showProfileForm, setShowProfileForm] = useState<'new' | string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!api) return;
    const next = await api.getStatus();
    if (next) {
      setStatus(next);
      setForm(next.settings);
      setActiveProfileId(next.settings.activeProfileId ?? null);
    }
  }, [api]);

  const refreshProfiles = useCallback(async () => {
    if (!api || typeof api.getProfiles !== 'function') return;
    const list = await api.getProfiles();
    setProfiles(list);
  }, [api]);

  useEffect(() => {
    void refresh();
    void refreshProfiles();
    if (!api) return undefined;
    return api.onStatusChanged((next) => {
      setStatus(next);
      setForm(next.settings);
      setActiveProfileId(next.settings.activeProfileId ?? null);
    });
  }, [api, refresh, refreshProfiles]);

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

  // ─── Profile handlers ─────────────────────────────────────────────────────

  const handleAddProfile = useCallback(async (data: Omit<BridgeProfile, 'id'>) => {
    if (!api || typeof api.addProfile !== 'function') return;
    setProfileSaving(true);
    try {
      await api.addProfile(data);
      await refreshProfiles();
      setShowProfileForm(null);
    } finally {
      setProfileSaving(false);
    }
  }, [api, refreshProfiles]);

  const handleUpdateProfile = useCallback(async (id: string, data: Omit<BridgeProfile, 'id'>) => {
    if (!api || typeof api.updateProfile !== 'function') return;
    setProfileSaving(true);
    try {
      await api.updateProfile(id, data);
      await refreshProfiles();
      setShowProfileForm(null);
    } finally {
      setProfileSaving(false);
    }
  }, [api, refreshProfiles]);

  const handleDeleteProfile = useCallback(async (id: string) => {
    if (!api || typeof api.deleteProfile !== 'function') return;
    await api.deleteProfile(id);
    await refreshProfiles();
    setShowProfileForm(null);
  }, [api, refreshProfiles]);

  const handleActivateProfile = useCallback(async (id: string) => {
    if (!api || typeof api.activateProfile !== 'function') return;
    const next = await api.activateProfile(id);
    if (next) {
      setActiveProfileId(id);
      await refresh();
      await refreshProfiles();
    }
  }, [api, refresh, refreshProfiles]);

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

  const editingProfile = typeof showProfileForm === 'string' && showProfileForm !== 'new'
    ? profiles.find((p) => p.id === showProfileForm)
    : null;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">

      {/* ── Top half: Status + Discovery Settings ─────────────────────────── */}
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

      {/* ── Bottom half: Connection Profiles + Detected Candidates ────────── */}
      <div className="scrollbar-thin min-h-0 overflow-auto">
        <div className="grid gap-3">

          {/* Connection Profiles card */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 border-b">
              <CardTitle>Connection Profiles</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setShowProfileForm((v) => (v === 'new' ? null : 'new'))}
              >
                + New Profile
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    {['Name', 'Endpoint', 'Status', 'Actions'].map((heading) => (
                      <th key={heading} className="border-b px-3 py-2 text-xs font-black uppercase tracking-[0.06em]">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profiles.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm font-bold text-muted-foreground">
                        No profiles saved. Add one to quickly switch bridge configurations.
                      </td>
                    </tr>
                  ) : profiles.map((profile) => {
                    const isActive = profile.id === activeProfileId;
                    return (
                      <tr key={profile.id} className="border-t transition-colors hover:bg-muted/20">
                        <td className="px-3 py-2 font-bold text-foreground">{profile.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{profileEndpoint(profile)}</td>
                        <td className="px-3 py-2">
                          {isActive
                            ? <Badge variant="success">Active</Badge>
                            : <Badge variant="secondary">Saved</Badge>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="default"
                              disabled={isActive}
                              onClick={() => void handleActivateProfile(profile.id)}
                              className="h-7 text-[11px]"
                            >
                              Activate
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Edit profile"
                              onClick={() => setShowProfileForm((v) => (v === profile.id ? null : profile.id))}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              title="Delete profile"
                              disabled={profiles.length <= 1}
                              onClick={() => void handleDeleteProfile(profile.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Inline form — new or edit */}
              {showProfileForm === 'new' && (
                <div className="px-3 pb-3">
                  <ProfileForm
                    initial={EMPTY_PROFILE_FORM}
                    onSave={(data) => void handleAddProfile(data)}
                    onCancel={() => setShowProfileForm(null)}
                    saving={profileSaving}
                  />
                </div>
              )}
              {editingProfile && (
                <div className="px-3 pb-3">
                  <ProfileForm
                    initial={{
                      name: editingProfile.name,
                      host: editingProfile.host,
                      portStart: editingProfile.portStart,
                      portEnd: editingProfile.portEnd,
                      endpointUrl: editingProfile.endpointUrl,
                    }}
                    onSave={(data) => void handleUpdateProfile(editingProfile.id, data)}
                    onCancel={() => setShowProfileForm(null)}
                    saving={profileSaving}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detected Candidates (collapsed) */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 border-b">
              <CardTitle>Detected Candidates</CardTitle>
              <Badge variant="outline">{current.candidates.length} endpoint{current.candidates.length === 1 ? '' : 's'}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    {['Endpoint', 'Latency', 'Role'].map((heading) => (
                      <th key={heading} className="border-b px-3 py-2 text-xs font-black uppercase tracking-[0.06em]">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.candidates.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-sm font-bold text-muted-foreground">
                        No local Backplane service detected yet.
                      </td>
                    </tr>
                  ) : current.candidates.map((candidate) => (
                    <tr key={`${candidate.host}:${candidate.port}`} className="border-t">
                      <td className="px-3 py-2 font-bold text-foreground">{candidate.endpointUrl}</td>
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-[color:rgba(255,255,255,0.025)] p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-black text-foreground">{value}</div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: JSX.Element; className?: string }): JSX.Element {
  return (
    <label className={['grid gap-1', className ?? ''].join(' ').trim()}>
      <span className="text-[11px] font-black text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
