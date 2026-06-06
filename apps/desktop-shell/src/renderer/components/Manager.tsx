import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as React from 'react';
import type { AppEntry } from '../App.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Input } from './ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';

/**
 * Manager Console — the io.Manager-class central distribution + admin layer.
 *
 * Reads / writes via the `window.shellChrome.manager` bridge wired in the
 * preload. The Manager Service (main process) owns:
 *   - Remote app-directory fetching over HTTPS (with ETag conditional GET)
 *   - Disk-cached fallback when the remote is unreachable
 *   - Validation through the shared validator
 *   - Versioned "pending update" + structural diff
 *   - Persisted settings (directoryUrl, refreshIntervalMs, currentRole,
 *     telemetryEndpoint) in userData/manager-settings.json
 *
 * The Manager renderer is purely a control surface — every mutation lands
 * through IPC, and status pushes come back via `onStatusChanged` so the UI
 * stays accurate without polling.
 */

// ─── Shared status shape — mirrors libs/fdc3-core/src/types/manager.ts ─────

interface ManagerDirectoryDiff {
  addedApps: string[];
  removedApps: string[];
  changedApps: string[];
}

interface ManagerStatus {
  source: 'remote' | 'cached' | 'local' | 'embedded';
  directoryUrl: string | null;
  directoryLabel: string | null;
  currentVersion: string | null;
  currentEtag: string | null;
  currentAppCount: number;
  lastFetchedAt: number | null;
  lastCheckedAt: number | null;
  lastFetchError: string | null;
  available: {
    version: string | null;
    label: string | null;
    etag: string | null;
    fetchedAt: number;
    appCount: number;
    diff: ManagerDirectoryDiff;
  } | null;
  settings: {
    directoryUrl: string;
    refreshIntervalMs: number;
    currentRole: string;
    telemetryEndpoint: string;
  };
  identity: {
    user: string;
    host: string;
    appVersion: string;
  };
}

interface ManagerApi {
  getStatus(): Promise<ManagerStatus | null>;
  checkUpdates(): Promise<{ ok: boolean; etag?: string | null; fetchedAt: number; appCount?: number; error?: string }>;
  applyUpdate(): Promise<{ applied: boolean; reason?: string }>;
  dismissUpdate(): Promise<boolean>;
  updateSettings(patch: Partial<ManagerStatus['settings']>): Promise<ManagerStatus['settings'] | null>;
  onStatusChanged(handler: (status: ManagerStatus) => void): () => void;
}

function getManagerApi(): ManagerApi | undefined {
  const api = (window as unknown as { shellChrome?: { manager?: ManagerApi } }).shellChrome?.manager;
  if (!api || typeof api.getStatus !== 'function') return undefined;
  return api;
}

const REFRESH_INTERVAL_OPTIONS = [
  { value: 0,        label: 'Off' },
  { value: 30_000,   label: '30 sec' },
  { value: 60_000,   label: '1 min' },
  { value: 300_000,  label: '5 min' },
  { value: 900_000,  label: '15 min' },
  { value: 3_600_000, label: '1 hour' },
];

const ROLE_OPTIONS = ['default', 'trader', 'pm', 'ops', 'admin'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function sourceLabel(source: ManagerStatus['source']): string {
  switch (source) {
    case 'remote':   return 'Remote (live)';
    case 'cached':   return 'Cached (offline)';
    case 'local':    return 'Local bundle';
    case 'embedded': return 'Embedded fallback';
    default:         return source;
  }
}

function sourceAccent(source: ManagerStatus['source']): string {
  if (source === 'remote') return 'var(--shell-positive)';
  if (source === 'cached') return '#f59e0b';
  if (source === 'embedded') return '#ef4444';
  return 'var(--shell-muted)';
}

function shortEtag(etag: string | null): string {
  if (!etag) return '—';
  if (etag.length <= 14) return etag;
  return `${etag.slice(0, 12)}…`;
}

function isAllowedForRole(appRoles: string[] | undefined, role: string): boolean {
  if (!appRoles || appRoles.length === 0) return true;
  return appRoles.includes(role);
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ManagerProps {
  apps: AppEntry[];
}

export function Manager({ apps }: ManagerProps): React.JSX.Element {
  const api = getManagerApi();
  const [status, setStatus] = useState<ManagerStatus | null>(null);
  const [busy, setBusy] = useState<'check' | 'apply' | 'dismiss' | 'save' | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);

  // Local draft state for the settings form so edits don't roundtrip on every keystroke.
  const [draftUrl, setDraftUrl] = useState('');
  const [draftInterval, setDraftInterval] = useState(0);
  const [draftRole, setDraftRole] = useState('default');
  const [draftTelemetry, setDraftTelemetry] = useState('');

  // Initial fetch + live push subscription.
  useEffect(() => {
    if (!api) return;
    let alive = true;
    void api.getStatus().then((s) => {
      if (alive && s) setStatus(s);
    });
    const unsub = api.onStatusChanged((s) => {
      if (alive && s) setStatus(s);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [api]);

  // Whenever the server-side status arrives, reset the draft form to match.
  useEffect(() => {
    if (!status) return;
    setDraftUrl(status.settings.directoryUrl);
    setDraftInterval(status.settings.refreshIntervalMs);
    setDraftRole(status.settings.currentRole);
    setDraftTelemetry(status.settings.telemetryEndpoint);
  }, [status]);

  const settingsDirty = useMemo(() => {
    if (!status) return false;
    return (
      draftUrl !== status.settings.directoryUrl ||
      draftInterval !== status.settings.refreshIntervalMs ||
      draftRole !== status.settings.currentRole ||
      draftTelemetry !== status.settings.telemetryEndpoint
    );
  }, [draftUrl, draftInterval, draftRole, draftTelemetry, status]);

  const handleCheck = useCallback(async () => {
    if (!api) return;
    setBusy('check');
    setActionMessage(null);
    const result = await api.checkUpdates();
    setBusy(null);
    setActionMessage(
      result.ok
        ? { text: `Fetched ${result.appCount ?? '?'} apps · etag ${shortEtag(result.etag ?? null)}`, kind: 'ok' }
        : { text: result.error ?? 'Fetch failed', kind: 'error' },
    );
  }, [api]);

  const handleApply = useCallback(async () => {
    if (!api) return;
    setBusy('apply');
    setActionMessage(null);
    const result = await api.applyUpdate();
    setBusy(null);
    setActionMessage(
      result.applied
        ? { text: 'Update applied. Runtime app directory refreshed live.', kind: 'ok' }
        : { text: result.reason ?? 'No update to apply', kind: 'error' },
    );
  }, [api]);

  const handleDismiss = useCallback(async () => {
    if (!api) return;
    setBusy('dismiss');
    setActionMessage(null);
    await api.dismissUpdate();
    setBusy(null);
    setActionMessage({ text: 'Pending update dismissed.', kind: 'ok' });
  }, [api]);

  const handleSave = useCallback(async () => {
    if (!api) return;
    setBusy('save');
    setActionMessage(null);
    const next = await api.updateSettings({
      directoryUrl: draftUrl.trim(),
      refreshIntervalMs: Number(draftInterval) || 0,
      currentRole: draftRole,
      telemetryEndpoint: draftTelemetry.trim(),
    });
    setBusy(null);
    setActionMessage(
      next ? { text: 'Settings saved.', kind: 'ok' } : { text: 'Manager not initialised.', kind: 'error' },
    );
  }, [api, draftUrl, draftInterval, draftRole, draftTelemetry]);

  // Effective-visibility roll-up for the entitlements table.
  const entitlementsSummary = useMemo(() => {
    const role = status?.settings.currentRole ?? 'default';
    let visible = 0;
    let restricted = 0;
    for (const app of apps) {
      const roles = (app as unknown as { roles?: string[] }).roles;
      if (isAllowedForRole(roles, role)) visible++;
      else restricted++;
    }
    return { visible, restricted, role };
  }, [apps, status?.settings.currentRole]);

  if (!api) {
    return (
      <Card className="p-6 text-sm font-bold text-muted-foreground">
        Manager Console bridge (<code>window.shellChrome.manager</code>) is not available.
      </Card>
    );
  }

  if (!status) {
    return (
      <Card className="p-6 text-sm font-bold text-muted-foreground">
        Loading Manager Console status…
      </Card>
    );
  }

  const isRemote = status.source === 'remote' || status.source === 'cached';

  return (
    <div className="scrollbar-thin flex h-full flex-col gap-3 overflow-auto pr-1">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="text-base font-black text-foreground">Manager Console</div>
          <div className="text-xs font-bold text-muted-foreground">
          io.Manager-class central distribution · {status.identity.user}@{status.identity.host} · shell v{status.identity.appVersion}
          </div>
        </div>
        <div className="flex-1" />
        <Button onClick={handleCheck} disabled={busy === 'check'} type="button" variant="outline" size="sm">
          {busy === 'check' ? 'Checking…' : 'Check for updates'}
        </Button>
      </div>

      {actionMessage && (
        <Card className={actionMessage.kind === 'ok'
          ? 'border-[color:var(--shell-positive)] p-3 text-sm font-bold text-[color:var(--shell-positive)]'
          : 'border-[color:var(--shell-negative)] p-3 text-sm font-bold text-[color:var(--shell-negative)]'}
        >
          {actionMessage.text}
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 border-b">
          <CardTitle>Applied directory</CardTitle>
          <Badge variant={status.source === 'remote' ? 'success' : status.source === 'cached' ? 'warning' : status.source === 'embedded' ? 'destructive' : 'secondary'}>
            <span className="mr-1.5 h-2 w-2 rounded-full" style={{ background: sourceAccent(status.source) }} />
            {sourceLabel(status.source)}
          </Badge>
        </CardHeader>
        <CardContent className="pt-4">
          <dl className="grid gap-x-3 gap-y-1 text-sm [grid-template-columns:140px_1fr]">
            <dt className="text-muted-foreground">Source</dt>
            <dd className="m-0 font-bold text-foreground">{sourceLabel(status.source)}</dd>
            <dt className="text-muted-foreground">Directory URL</dt>
            <dd className="m-0 break-all font-bold text-foreground">{status.directoryUrl || '(local bundle)'}</dd>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="m-0 font-bold text-foreground">{status.currentVersion ?? '—'}{status.directoryLabel ? ` · ${status.directoryLabel}` : ''}</dd>
            <dt className="text-muted-foreground">App count</dt>
            <dd className="m-0 font-bold tabular-nums text-foreground">{status.currentAppCount}</dd>
            <dt className="text-muted-foreground">ETag</dt>
            <dd className="m-0 font-mono font-bold text-foreground">{shortEtag(status.currentEtag)}</dd>
            <dt className="text-muted-foreground">Last fetched</dt>
            <dd className="m-0 font-bold text-foreground">{formatTime(status.lastFetchedAt)}</dd>
            <dt className="text-muted-foreground">Last checked</dt>
            <dd className="m-0 font-bold text-foreground">{formatTime(status.lastCheckedAt)}</dd>
            {status.lastFetchError && (
              <>
                <dt className="text-muted-foreground">Last error</dt>
                <dd className="m-0 font-bold text-[color:var(--shell-negative)]">{status.lastFetchError}</dd>
              </>
            )}
          </dl>
          {!isRemote && !status.directoryUrl && (
            <div className="mt-2 rounded-md border bg-[color:rgba(255,255,255,0.02)] p-3 text-xs font-bold leading-relaxed text-muted-foreground">
              Running the bundled local directory. Configure a <strong>Directory URL</strong> below to start centrally
              distributing your app catalogue. The shell will fetch it over HTTPS, validate it against the schema,
              cache a copy on disk for offline use, and surface any change as a pending update.
            </div>
          )}
        </CardContent>
      </Card>

      {status.available && (
        <Card className="border-[color:var(--shell-accent)]">
          <CardHeader className="flex-row items-center justify-between gap-3 border-b">
            <CardTitle className="text-[color:var(--shell-accent)]">Update available</CardTitle>
            <Badge variant="default">{status.available.version ?? 'no version tag'}{status.available.label ? ` · ${status.available.label}` : ''}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <div className="grid gap-3 md:grid-cols-3">
              <DiffTile tone="success" label="Added" ids={status.available.diff.addedApps} />
              <DiffTile tone="destructive" label="Removed" ids={status.available.diff.removedApps} />
              <DiffTile tone="warning" label="Changed" ids={status.available.diff.changedApps} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">
                Fetched {formatTime(status.available.fetchedAt)} · {status.available.appCount} apps · etag {shortEtag(status.available.etag)}
              </span>
              <div className="flex-1" />
              <Button onClick={handleDismiss} disabled={busy === 'dismiss'} type="button" variant="outline">
                Dismiss
              </Button>
              <Button onClick={handleApply} disabled={busy === 'apply'} type="button">
                {busy === 'apply' ? 'Applying…' : 'Apply update'}
              </Button>
            </div>
            <p className="text-xs font-bold text-muted-foreground">
              Applying swaps the in-memory directory used for new launches. Windows opened from this point on use the
              new catalogue; in-flight windows reflect the previous version until reopened.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 border-b">
          <CardTitle>Settings</CardTitle>
          <Badge variant={settingsDirty ? 'warning' : 'secondary'}>{settingsDirty ? 'Unsaved changes' : 'In sync'}</Badge>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 md:grid-cols-2">
          <Field label="Directory URL" description="HTTPS endpoint returning a JSON app-directory file. Leave empty to use the local bundle.">
            <Input
              type="text"
              placeholder="https://directory.example.com/app-directory.json"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
            />
          </Field>

          <Field label="Refresh interval" description="How often to poll the remote. 'Off' = manual only.">
            <Select
              value={String(draftInterval)}
              onValueChange={(v) => setDraftInterval(Number(v))}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Current user role" description="Drives the entitlement filter. Apps with no roles[] are visible to everyone.">
            <Select value={draftRole} onValueChange={setDraftRole}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Telemetry endpoint" description="Reserved — Control Tower export target for future SaaS rollups.">
            <Input
              type="text"
              placeholder="https://telemetry.example.com/v1/events"
              value={draftTelemetry}
              onChange={(e) => setDraftTelemetry(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button
              onClick={() => {
                if (!status) return;
                setDraftUrl(status.settings.directoryUrl);
                setDraftInterval(status.settings.refreshIntervalMs);
                setDraftRole(status.settings.currentRole);
                setDraftTelemetry(status.settings.telemetryEndpoint);
              }}
              disabled={!settingsDirty || busy === 'save'}
              type="button"
              variant="outline"
            >
              Reset
            </Button>
            <Button onClick={handleSave} disabled={!settingsDirty || busy === 'save'} type="button">
              {busy === 'save' ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-0">
        <CardHeader className="flex-row items-center justify-between gap-3 border-b">
          <CardTitle>Entitlements ({entitlementsSummary.role})</CardTitle>
          <Badge variant="outline">
            {entitlementsSummary.visible} visible · {entitlementsSummary.restricted} restricted
          </Badge>
        </CardHeader>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-secondary">
              <tr>
                {['App', 'Roles allowed', 'Effective'].map((h) => (
                  <th key={h} className="border-b px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => {
                const roles = (app as unknown as { roles?: string[] }).roles ?? [];
                const allowed = isAllowedForRole(roles, entitlementsSummary.role);
                return (
                  <tr key={app.appId} className="border-b">
                    <td className="px-3 py-2 font-black text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: allowed ? 'var(--shell-positive)' : 'var(--shell-muted)' }} />
                        {app.title}
                        <span className="text-xs font-medium text-muted-foreground">{app.appId}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {roles.length === 0 ? (
                        <span className="italic">everyone</span>
                      ) : (
                        roles.map((r) => (
                          <Badge key={r} className="mr-1" variant={r === entitlementsSummary.role ? 'default' : 'secondary'}>{r}</Badge>
                        ))
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={allowed ? 'success' : 'destructive'}>{allowed ? 'Visible' : 'Restricted'}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t px-3 py-2 text-xs font-bold text-muted-foreground">
          Roles are a <strong>UI surface</strong> only — FDC3 routing, contexts and intents are unaffected.
          Apps with no <code>roles[]</code> are visible to every role.
        </div>
      </Card>
    </div>
  );
}

// ─── Tiny presentational helpers ────────────────────────────────────────────

function Field({ label, description, children }: { label: string; description: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">{label}</div>
      {children}
      <div className="text-[10px] font-bold text-muted-foreground">{description}</div>
    </div>
  );
}

function DiffTile({ label, ids, tone }: { label: string; ids: string[]; tone: 'success' | 'warning' | 'destructive' }): React.JSX.Element {
  const color = tone === 'success' ? 'var(--shell-positive)' : tone === 'warning' ? '#f59e0b' : 'var(--shell-negative)';
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-[color:rgba(255,255,255,0.02)] p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.06em]" style={{ color }}>{label}</span>
        <span className="text-lg font-black tabular-nums" style={{ color }}>{ids.length}</span>
      </div>
      {ids.length === 0 ? (
        <span className="text-xs font-bold text-muted-foreground">—</span>
      ) : (
        <div className="text-xs font-bold leading-relaxed text-foreground">
          {ids.slice(0, 4).map((id) => (
            <div key={id} className="truncate font-mono">{id}</div>
          ))}
          {ids.length > 4 && <div className="text-muted-foreground">+{ids.length - 4} more</div>}
        </div>
      )}
    </div>
  );
}
