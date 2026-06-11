import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { DashboardHeader, DashboardPage, StatusBadge } from './ui/dashboard.js';
import { Input } from './ui/input.js';
import { Switch } from './ui/switch.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.js';
import { CheckCircle2, Info, Link2, Pencil, Radio, TriangleAlert, Trash2, Zap } from 'lucide-react';
import { cn } from '../lib/utils.js';

// ─── Local types ───────────────────────────────────────────────────────────────

type BridgeProvider = 'finos-backplane';
type BridgeStatusState = 'disabled' | 'scanning' | 'available' | 'unavailable' | 'error';
type BridgeSection = 'configuration' | 'profiles';

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
  portEnd: 4475,
  endpointUrl: '',
};

const EMPTY_PROFILE_FORM: Omit<BridgeProfile, 'id'> = {
  name: '',
  host: '127.0.0.1',
  portStart: 4475,
  portEnd: 4475,
  endpointUrl: '',
};

const NAV: { id: BridgeSection; label: string }[] = [
  { id: 'configuration', label: 'Configuration' },
  { id: 'profiles',      label: 'Profiles' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBridgeApi(): BridgeApi | undefined {
  const api = (window as unknown as { shellChrome?: { bridge?: BridgeApi } }).shellChrome?.bridge;
  if (!api || typeof api.getStatus !== 'function') return undefined;
  return api;
}

function formatTime(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function profileEndpoint(p: BridgeProfile): string {
  if (p.endpointUrl.trim()) return p.endpointUrl.trim();
  if (p.portStart === p.portEnd) return `${p.host}:${p.portStart}`;
  return `${p.host}:${p.portStart}–${p.portEnd}`;
}

function latencyVariant(ms: number): 'success' | 'warning' | 'destructive' {
  if (ms < 20) return 'success';
  if (ms < 100) return 'warning';
  return 'destructive';
}

function stateLabel(state: BridgeStatusState): string {
  switch (state) {
    case 'disabled':   return 'Disabled';
    case 'scanning':   return 'Scanning';
    case 'available':  return 'Connected';
    case 'unavailable': return 'Unavailable';
    case 'error':      return 'Error';
    default:           return state;
  }
}

function stateTone(state: BridgeStatusState): 'neutral' | 'success' | 'warning' | 'destructive' | 'accent' {
  switch (state) {
    case 'available':  return 'success';
    case 'scanning':   return 'accent';
    case 'error':      return 'destructive';
    case 'unavailable': return 'warning';
    default:           return 'neutral';
  }
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function InfoTip({ tip }: { tip: string }): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help text-muted-foreground/50 hover:text-muted-foreground">
          <Info className="size-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] leading-snug">{tip}</TooltipContent>
    </Tooltip>
  );
}

function Field({
  label,
  description,
  tip,
  children,
  className,
}: {
  label: string;
  description?: string;
  tip?: string;
  children: JSX.Element;
  className?: string;
}): JSX.Element {
  return (
    <label className={cn('grid gap-1.5', className)}>
      <span className="flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.05em] text-muted-foreground">
        {label}
        {tip && <InfoTip tip={tip} />}
      </span>
      {children}
      {description && (
        <span className="text-[11px] text-muted-foreground">{description}</span>
      )}
    </label>
  );
}

function ScanningPulse(): JSX.Element {
  return (
    <span className="relative flex size-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
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
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Profile Name *">
          <Input
            value={form.name}
            placeholder="e.g. Local Dev, UAT Bridge"
            onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, name: v })); }}
          />
        </Field>
        <Field
          label="Host *"
          tip="Hostname or IP where the Backplane is running. 127.0.0.1 for local, or a LAN address for a shared team bridge."
        >
          <Input
            value={form.host}
            placeholder="127.0.0.1"
            onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, host: v })); }}
          />
        </Field>
        <Field
          label="Port Start"
          tip="First port in the scan range. FINOS Backplane default is 4475."
        >
          <Input
            type="number"
            value={form.portStart}
            onChange={(e) => { const v = Number(e.currentTarget.value); setForm((f) => ({ ...f, portStart: v })); }}
          />
        </Field>
        <Field
          label="Port End"
          tip="Last port in the scan range. Set equal to Port Start to target a single port."
        >
          <Input
            type="number"
            value={form.portEnd}
            onChange={(e) => { const v = Number(e.currentTarget.value); setForm((f) => ({ ...f, portEnd: v })); }}
          />
        </Field>
        <Field
          label="Direct WebSocket URL"
          tip="Bypass port scanning and connect directly to this URL. Useful behind a proxy or on a non-standard path."
          className="sm:col-span-2"
        >
          <Input
            value={form.endpointUrl}
            placeholder="ws://127.0.0.1:4475  (leave blank to auto-detect)"
            onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, endpointUrl: v })); }}
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="button" size="sm" disabled={!valid || saving} onClick={() => onSave(form)}>
          {saving ? 'Saving…' : 'Save Profile'}
        </Button>
      </div>
    </div>
  );
}

// ─── Section: Monitor ─────────────────────────────────────────────────────────

interface MonitorSectionProps {
  current: BridgeStatus;
  isScanning: boolean;
  busy: boolean;
  onScan: () => void;
}

function MonitorSection({ current, isScanning, busy, onScan }: MonitorSectionProps): JSX.Element {
  const state = current.state;
  const { selected, candidates, lastCheckedAt, lastError } = current;

  return (
    <>
      {/* ── Metric strip (always visible) ─────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        {/* Status chip */}
        <div className={cn(
          'flex min-w-0 flex-col gap-1 rounded-lg border p-3',
          state === 'available' ? 'border-[color:color-mix(in_srgb,var(--shell-positive)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--shell-positive)_6%,transparent)]' : 'bg-[color:rgba(255,255,255,0.025)]',
        )}>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">
            Status
            {isScanning && <ScanningPulse />}
          </div>
          <div className={cn(
            'text-sm font-black',
            state === 'available' ? 'text-[color:var(--shell-positive)]' : state === 'error' || state === 'unavailable' ? 'text-[color:var(--shell-negative)]' : 'text-foreground',
          )}>
            {stateLabel(state)}
          </div>
        </div>

        {/* Connected endpoint */}
        <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-[color:rgba(255,255,255,0.025)] p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">Endpoint</div>
          <div className="truncate text-sm font-black text-foreground">
            {selected?.endpointUrl ?? '—'}
          </div>
        </div>

        {/* Latency */}
        <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-[color:rgba(255,255,255,0.025)] p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">Latency</div>
          <div className={cn(
            'text-sm font-black',
            selected ? (selected.latencyMs < 20 ? 'text-[color:var(--shell-positive)]' : selected.latencyMs < 100 ? 'text-amber-400' : 'text-[color:var(--shell-negative)]') : 'text-foreground',
          )}>
            {selected ? `${selected.latencyMs} ms` : '—'}
          </div>
        </div>

        {/* Last scan */}
        <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-[color:rgba(255,255,255,0.025)] p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">Last scan</div>
          <div className="truncate text-sm font-black text-foreground">{formatTime(lastCheckedAt)}</div>
        </div>
      </div>

      {/* ── Connection detail / error banner ──────────────────────────── */}
      {(state === 'available' && selected) ? (
        <div className="flex shrink-0 items-center gap-3 rounded-lg border border-[color:color-mix(in_srgb,var(--shell-positive)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--shell-positive)_6%,transparent)] px-3 py-2">
          <CheckCircle2 className="size-4 shrink-0 text-[color:var(--shell-positive)]" />
          <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            Connected · <code className="font-bold text-foreground">{selected.endpointUrl}</code>
            <span className="ml-2 text-muted-foreground/60">— Bridge readiness reported via <code>fdc3.getInfo()</code></span>
          </div>
          <Badge variant="success" className="shrink-0">{candidates.length} candidate{candidates.length === 1 ? '' : 's'}</Badge>
        </div>
      ) : (state === 'error' || state === 'unavailable') ? (
        <div className="flex shrink-0 items-center gap-3 rounded-lg border border-[color:color-mix(in_srgb,var(--shell-negative)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--shell-negative)_6%,transparent)] px-3 py-2">
          <TriangleAlert className="size-4 shrink-0 text-[color:var(--shell-negative)]" />
          <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            {lastError ?? (state === 'unavailable' ? 'No FINOS Backplane found — start a local instance or check Configuration.' : 'Connection error — verify host and port range in Configuration.')}
          </div>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onScan} className="shrink-0">Retry</Button>
        </div>
      ) : state === 'scanning' || isScanning ? (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
          <Radio className="size-3.5 shrink-0 animate-pulse text-primary" />
          <span className="text-[11px] text-muted-foreground">Probing configured host and port range…</span>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">Discovery disabled — enable auto-discovery in <strong className="text-foreground">Configuration</strong> and scan to connect.</span>
        </div>
      )}

      {/* ── Detected endpoints table ───────────────────────────────────── */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-row items-center gap-3 border-b py-3">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm">Detected Endpoints</CardTitle>
            <InfoTip tip="All Backplane endpoints found during the last scan. The selected endpoint is the one this shell is actively using. Latency is the round-trip probe time." />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{candidates.length} found</span>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onScan}>
              {isScanning ? 'Scanning…' : 'Scan Now'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="scrollbar-thin min-h-0 flex-1 overflow-auto p-0">
          {candidates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <p className="text-xs text-muted-foreground">
                {state === 'disabled'
                  ? 'Enable auto-discovery in Configuration and scan to find local Backplane services.'
                  : 'No endpoints found in the last scan. Ensure a FINOS Backplane instance is running on the configured host and port.'}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['Endpoint', 'Response time', 'Role'].map((h) => (
                    <th key={h} className="border-b px-4 py-2 text-left text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const isSelected = current.selected?.port === c.port && current.selected?.host === c.host;
                  return (
                    <tr key={`${c.host}:${c.port}`} className={cn('border-t transition-colors', isSelected ? 'bg-[color:rgba(64,232,128,0.04)]' : 'hover:bg-muted/20')}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={cn('size-1.5 shrink-0 rounded-full', isSelected ? 'bg-[color:var(--shell-positive)]' : 'bg-muted-foreground/30')} />
                          <code className="text-xs font-bold text-foreground">{c.endpointUrl}</code>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={latencyVariant(c.latencyMs)}>{c.latencyMs} ms</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {isSelected ? <Badge variant="success">In use</Badge> : <Badge variant="secondary">Standby</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ─── Section: Configuration ───────────────────────────────────────────────────

interface ConfigSectionProps {
  form: BridgeSettings;
  setForm: React.Dispatch<React.SetStateAction<BridgeSettings>>;
  dirty: boolean;
  busy: boolean;
  message: { text: string; ok: boolean } | null;
  onSave: () => void;
  onScan: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  isScanning: boolean;
}

function ConfigSection({
  form, setForm, dirty, busy, message, onSave, onScan, onToggleEnabled, isScanning,
}: ConfigSectionProps): JSX.Element {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">Auto-Discovery</CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            The scanner probes the configured host and port range to locate a running FINOS Backplane service. Only local loopback traffic is generated unless you specify a remote host.
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/50">
            <Switch
              checked={form.enabled}
              onCheckedChange={onToggleEnabled}
              aria-label="Toggle FINOS Backplane discovery"
            />
            <div className="flex-1">
              <div className="text-xs font-black text-foreground">Enable auto-discovery</div>
              <div className="text-[11px] text-muted-foreground">Scans on startup and after settings changes. Turning this off stops all probe traffic immediately.</div>
            </div>
            <InfoTip tip="When enabled, the shell automatically probes the configured port range on startup and whenever settings are saved. Safe to leave on — only lightweight WebSocket handshakes are sent." />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 border-b py-3">
          <div>
            <CardTitle className="text-sm">Host &amp; Port Range</CardTitle>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Where to look for the Backplane service</p>
          </div>
          {dirty && <Badge variant="warning">Unsaved changes</Badge>}
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Host"
              tip="Hostname or IP to probe. Use 127.0.0.1 for a local Backplane, or a LAN address for a shared team bridge."
              className="sm:col-span-1"
            >
              <Input
                value={form.host}
                placeholder="127.0.0.1"
                onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, host: v })); }}
              />
            </Field>
            <Field
              label="Port start"
              tip="First port of the scan range. The FINOS Backplane default is 4475."
            >
              <Input
                type="number"
                value={form.portStart}
                onChange={(e) => { const v = Number(e.currentTarget.value); setForm((f) => ({ ...f, portStart: v })); }}
              />
            </Field>
            <Field
              label="Port end"
              tip="Last port in the range. Equal to Port Start = single port only."
            >
              <Input
                type="number"
                value={form.portEnd}
                onChange={(e) => { const v = Number(e.currentTarget.value); setForm((f) => ({ ...f, portEnd: v })); }}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">Direct Connection Override</CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Provide a full WebSocket URL to bypass port-range scanning entirely — useful when the Backplane is behind a reverse proxy, load balancer, or on a non-standard path. Leave blank to use auto-detection.
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <Field label="WebSocket endpoint URL" tip="If set, the scanner is skipped and this URL is used directly.">
            <Input
              placeholder="ws://127.0.0.1:4475  —  leave blank to auto-detect"
              value={form.endpointUrl}
              onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, endpointUrl: v })); }}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        {message ? (
          <span className={cn('text-xs font-bold', message.ok ? 'text-[color:var(--shell-positive)]' : 'text-muted-foreground')}>
            {message.text}
          </span>
        ) : <span />}
        <div className="flex gap-2">
          <Button disabled={busy || !dirty} onClick={onSave} type="button" size="sm" variant="outline">Save</Button>
          <Button disabled={busy} onClick={onScan} type="button" size="sm" className="gap-1.5">
            {isScanning
              ? <><Radio className="size-3.5 animate-pulse" /> Scanning…</>
              : <><Zap className="size-3.5" /> Save &amp; Scan</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Profiles ────────────────────────────────────────────────────────

interface ProfilesSectionProps {
  profiles: BridgeProfile[];
  activeProfileId: string | null;
  busy: boolean;
  onActivate: (id: string) => void;
  onAdd: (data: Omit<BridgeProfile, 'id'>) => void;
  onUpdate: (id: string, data: Omit<BridgeProfile, 'id'>) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}

function ProfilesSection({
  profiles, activeProfileId, busy, onActivate, onAdd, onUpdate, onDelete, saving,
}: ProfilesSectionProps): JSX.Element {
  const [showForm, setShowForm] = useState<'new' | string | null>(null);
  const editingProfile = typeof showForm === 'string' && showForm !== 'new'
    ? profiles.find((p) => p.id === showForm)
    : null;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row items-center gap-3 border-b py-3">
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm">Connection Profiles</CardTitle>
              <InfoTip tip="Profiles are saved snapshots of host, port range, and endpoint settings. Activating a profile applies its settings and triggers an immediate scan. Use profiles to switch between local dev, staging, and production bridge environments without re-entering settings." />
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Save multiple bridge environments and switch between them in one click.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowForm((v) => (v === 'new' ? null : 'new'))}
          >
            + New Profile
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {profiles.length === 0 && showForm !== 'new' ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/30">
                <Link2 className="size-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">No profiles saved</div>
                <div className="mt-0.5 max-w-[320px] text-xs text-muted-foreground">
                  Create profiles for different bridge environments — local dev, UAT, production — and switch between them instantly without re-entering settings.
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowForm('new')}>
                Create first profile
              </Button>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['Profile', 'Endpoint', 'Status', ''].map((h, i) => (
                    <th key={i} className="border-b px-4 py-2 text-left text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => {
                  const isActive = profile.id === activeProfileId;
                  return (
                    <tr key={profile.id} className={cn('border-t transition-colors', isActive ? 'bg-[color:rgba(64,232,128,0.04)]' : 'hover:bg-muted/20')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('size-1.5 shrink-0 rounded-full', isActive ? 'bg-[color:var(--shell-positive)]' : 'bg-muted-foreground/30')} />
                          <span className="font-bold text-foreground">{profile.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{profileEndpoint(profile)}</td>
                      <td className="px-4 py-3">
                        {isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Saved</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant={isActive ? 'secondary' : 'default'}
                                disabled={isActive || busy}
                                onClick={() => onActivate(profile.id)}
                                className="h-7 text-[11px]"
                              >
                                {isActive ? 'Active' : 'Activate'}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isActive ? 'This profile is currently active' : 'Apply settings and scan immediately'}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setShowForm((v) => (v === profile.id ? null : profile.id))}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit profile</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                disabled={profiles.length <= 1}
                                onClick={() => onDelete(profile.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {profiles.length <= 1 ? 'Cannot delete the only profile' : 'Delete profile'}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {showForm === 'new' && (
            <div className="px-4 pb-4">
              <ProfileForm
                initial={EMPTY_PROFILE_FORM}
                onSave={(data) => { onAdd(data); setShowForm(null); }}
                onCancel={() => setShowForm(null)}
                saving={saving}
              />
            </div>
          )}
          {editingProfile && (
            <div className="px-4 pb-4">
              <ProfileForm
                initial={{ name: editingProfile.name, host: editingProfile.host, portStart: editingProfile.portStart, portEnd: editingProfile.portEnd, endpointUrl: editingProfile.endpointUrl }}
                onSave={(data) => { onUpdate(editingProfile.id, data); setShowForm(null); }}
                onCancel={() => setShowForm(null)}
                saving={saving}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Bridge(): JSX.Element {
  const api = getBridgeApi();
  const [section, setSection] = useState<BridgeSection>('configuration');
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [form, setForm] = useState<BridgeSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [profiles, setProfiles] = useState<BridgeProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!api) return;
    const next = await api.getStatus();
    if (next) { setStatus(next); setForm(next.settings); setActiveProfileId(next.settings.activeProfileId ?? null); }
  }, [api]);

  const refreshProfiles = useCallback(async () => {
    if (!api || typeof api.getProfiles !== 'function') return;
    setProfiles(await api.getProfiles());
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
      const next = await api.updateSettings({ ...form, portStart: Number(form.portStart), portEnd: Number(form.portEnd) });
      if (next) { setStatus(next); setForm(next.settings); }
      setMessage({ text: 'Settings saved.', ok: true });
    } catch (err) {
      setMessage({ text: (err as Error).message, ok: false });
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
      if (next) { setStatus(next); setForm(next.settings); }
      setMessage(next?.state === 'available'
        ? { text: `Found ${next.candidates.length} service${next.candidates.length === 1 ? '' : 's'}.`, ok: true }
        : { text: 'No Backplane service found.', ok: false });
    } catch (err) {
      setMessage({ text: (err as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  }, [api, dirty, save]);

  const handleToggleEnabled = useCallback((enabled: boolean) => {
    setForm((f) => ({ ...f, enabled }));
    if (enabled && api) setTimeout(() => void scan(), 50);
  }, [api, scan]);

  const handleAddProfile = useCallback(async (data: Omit<BridgeProfile, 'id'>) => {
    if (!api || typeof api.addProfile !== 'function') return;
    setProfileSaving(true);
    try { await api.addProfile(data); await refreshProfiles(); }
    finally { setProfileSaving(false); }
  }, [api, refreshProfiles]);

  const handleUpdateProfile = useCallback(async (id: string, data: Omit<BridgeProfile, 'id'>) => {
    if (!api || typeof api.updateProfile !== 'function') return;
    setProfileSaving(true);
    try { await api.updateProfile(id, data); await refreshProfiles(); }
    finally { setProfileSaving(false); }
  }, [api, refreshProfiles]);

  const handleDeleteProfile = useCallback(async (id: string) => {
    if (!api || typeof api.deleteProfile !== 'function') return;
    await api.deleteProfile(id);
    await refreshProfiles();
  }, [api, refreshProfiles]);

  const handleActivateProfile = useCallback(async (id: string) => {
    if (!api || typeof api.activateProfile !== 'function') return;
    const next = await api.activateProfile(id);
    if (next) {
      setActiveProfileId(id);
      await refresh();
      await refreshProfiles();
      void scan();
    }
  }, [api, refresh, refreshProfiles, scan]);

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

  const isScanning = current.state === 'scanning' || busy;

  return (
    <TooltipProvider>
      <DashboardPage>
        <DashboardHeader
          eyebrow="FDC3 interoperability"
          title="Desktop Agent Bridge"
          description={
            <>
              Detects and connects to a <strong>FINOS Backplane</strong> service — a local WebSocket hub that lets
              multiple FDC3-enabled applications share context and intents across different desktop agents on the same machine or network.
            </>
          }
          meta={<StatusBadge label={stateLabel(current.state)} tone={stateTone(current.state)} />}
          actions={
            <Button type="button" size="sm" disabled={busy} onClick={scan} className="gap-1.5">
              {isScanning
                ? <><Radio className="size-3.5 animate-pulse" /> Scanning…</>
                : <><Zap className="size-3.5" /> Scan Now</>}
            </Button>
          }
        />

        {/* ── Monitor strip (always visible at top) ──────────────────────── */}
        <div className="flex shrink-0 flex-col gap-2">
          <MonitorSection
            current={current}
            isScanning={isScanning}
            busy={busy}
            onScan={scan}
          />
        </div>

        {/* ── Sidebar + section content below ────────────────────────────── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left sidebar */}
          <nav className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-card p-1.5">
            <div className="px-2 pb-1 pt-2">
              <div className="text-xs font-black text-foreground">Settings</div>
            </div>
            {NAV.map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                variant={section === id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSection(id)}
                className={cn('w-full justify-start gap-2', section !== id && 'text-muted-foreground')}
              >
                <span className="flex-1 text-left">{label}</span>
                {id === 'configuration' && dirty && (
                  <span className={cn('size-1.5 shrink-0 rounded-full', section === id ? 'bg-white/70' : 'bg-amber-400')} />
                )}
                {id === 'profiles' && profiles.length > 0 && (
                  <span className={cn('tabular-nums text-[10px] font-bold', section === id ? 'opacity-70' : 'text-muted-foreground')}>
                    {profiles.length}
                  </span>
                )}
              </Button>
            ))}
          </nav>

          {/* Section content */}
          <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
            {section === 'configuration' && (
              <ConfigSection
                form={form}
                setForm={setForm}
                dirty={dirty}
                busy={busy}
                message={message}
                onSave={save}
                onScan={scan}
                onToggleEnabled={handleToggleEnabled}
                isScanning={isScanning}
              />
            )}
            {section === 'profiles' && (
              <ProfilesSection
                profiles={profiles}
                activeProfileId={activeProfileId}
                busy={busy}
                onActivate={(id) => void handleActivateProfile(id)}
                onAdd={(data) => void handleAddProfile(data)}
                onUpdate={(id, data) => void handleUpdateProfile(id, data)}
                onDelete={(id) => void handleDeleteProfile(id)}
                saving={profileSaving}
              />
            )}
          </div>
        </div>
      </DashboardPage>
    </TooltipProvider>
  );
}
