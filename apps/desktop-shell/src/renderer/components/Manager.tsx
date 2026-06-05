import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AppEntry } from '../App.js';

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

// ─── Styles (kept inline, consistent with Insights/CommandCenter) ──────────

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
const KV: CSSProperties = { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px 10px', fontSize: 12 };
const INPUT: CSSProperties = {
  padding: '6px 9px', fontSize: 13,
  background: 'var(--shell-panel-2)', border: '1px solid var(--shell-border)',
  borderRadius: 6, color: 'var(--shell-text)', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const BUTTON_PRIMARY: CSSProperties = {
  padding: '7px 14px', fontSize: 12, fontWeight: 800,
  background: 'var(--shell-accent-soft)', border: '1px solid var(--shell-accent-border)',
  borderRadius: 6, cursor: 'pointer', color: 'var(--shell-text)',
};
const BUTTON_GHOST: CSSProperties = {
  padding: '7px 14px', fontSize: 12, fontWeight: 800,
  background: 'transparent', border: '1px solid var(--shell-border)',
  borderRadius: 6, cursor: 'pointer', color: 'var(--shell-muted)',
};
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
        ? { text: 'Update applied. Windows opened from here on use the new directory.', kind: 'ok' }
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
      <div style={{ padding: 24, color: 'var(--shell-muted)' }}>
        Manager Console bridge (<code>window.shellChrome.manager</code>) is not available.
      </div>
    );
  }

  if (!status) {
    return (
      <div style={{ padding: 24, color: 'var(--shell-muted)' }}>
        Loading Manager Console status…
      </div>
    );
  }

  const isRemote = status.source === 'remote' || status.source === 'cached';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, height: '100%', overflow: 'auto' }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--shell-text)', letterSpacing: 0.4 }}>Manager Console</span>
        <span style={{ fontSize: 11, color: 'var(--shell-muted)' }}>
          io.Manager-class central distribution · {status.identity.user}@{status.identity.host} · shell v{status.identity.appVersion}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={handleCheck} disabled={busy === 'check'} style={BUTTON_PRIMARY}>
          {busy === 'check' ? 'Checking…' : '🔄 Check for updates'}
        </button>
      </div>

      {actionMessage && (
        <div
          style={{
            ...SECTION,
            padding: '8px 12px',
            color: actionMessage.kind === 'ok' ? 'var(--shell-positive)' : '#ef4444',
            fontSize: 12, fontWeight: 700,
            borderColor: actionMessage.kind === 'ok' ? 'var(--shell-positive)' : '#b42318',
          }}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Status banner */}
      <div style={SECTION}>
        <div style={SECTION_HEADER}>
          <span>Applied directory</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: sourceAccent(status.source) }} />
            {sourceLabel(status.source)}
          </span>
        </div>
        <div style={SECTION_BODY}>
          <dl style={KV}>
            <dt style={{ color: 'var(--shell-muted)' }}>Source</dt>
            <dd style={{ margin: 0, fontWeight: 700, color: 'var(--shell-text)' }}>{sourceLabel(status.source)}</dd>
            <dt style={{ color: 'var(--shell-muted)' }}>Directory URL</dt>
            <dd style={{ margin: 0, fontWeight: 700, color: 'var(--shell-text)', wordBreak: 'break-all' }}>{status.directoryUrl || '(local bundle)'}</dd>
            <dt style={{ color: 'var(--shell-muted)' }}>Version</dt>
            <dd style={{ margin: 0, fontWeight: 700, color: 'var(--shell-text)' }}>{status.currentVersion ?? '—'}{status.directoryLabel ? ` · ${status.directoryLabel}` : ''}</dd>
            <dt style={{ color: 'var(--shell-muted)' }}>App count</dt>
            <dd style={{ margin: 0, fontWeight: 700, color: 'var(--shell-text)', fontVariantNumeric: 'tabular-nums' }}>{status.currentAppCount}</dd>
            <dt style={{ color: 'var(--shell-muted)' }}>ETag</dt>
            <dd style={{ margin: 0, fontWeight: 700, color: 'var(--shell-text)', fontFamily: 'ui-monospace, Menlo, monospace' }}>{shortEtag(status.currentEtag)}</dd>
            <dt style={{ color: 'var(--shell-muted)' }}>Last fetched</dt>
            <dd style={{ margin: 0, fontWeight: 700, color: 'var(--shell-text)' }}>{formatTime(status.lastFetchedAt)}</dd>
            <dt style={{ color: 'var(--shell-muted)' }}>Last checked</dt>
            <dd style={{ margin: 0, fontWeight: 700, color: 'var(--shell-text)' }}>{formatTime(status.lastCheckedAt)}</dd>
            {status.lastFetchError && (
              <>
                <dt style={{ color: 'var(--shell-muted)' }}>Last error</dt>
                <dd style={{ margin: 0, fontWeight: 700, color: '#ef4444' }}>{status.lastFetchError}</dd>
              </>
            )}
          </dl>
          {!isRemote && !status.directoryUrl && (
            <div style={{ marginTop: 12, padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: 11, color: 'var(--shell-muted)', lineHeight: 1.5 }}>
              Running the bundled local directory. Configure a <strong>Directory URL</strong> below to start centrally
              distributing your app catalogue. The shell will fetch it over HTTPS, validate it against the schema,
              cache a copy on disk for offline use, and surface any change as a pending update.
            </div>
          )}
        </div>
      </div>

      {/* Pending update banner — only when a fetched version differs */}
      {status.available && (
        <div style={{ ...SECTION, borderColor: 'var(--shell-accent)' }}>
          <div style={{ ...SECTION_HEADER, color: 'var(--shell-accent)' }}>
            <span>📦 Update available</span>
            <span>{status.available.version ?? 'no version tag'}{status.available.label ? ` · ${status.available.label}` : ''}</span>
          </div>
          <div style={SECTION_BODY}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
              <DiffTile color="var(--shell-positive)" label="Added"   ids={status.available.diff.addedApps} />
              <DiffTile color="#ef4444"               label="Removed" ids={status.available.diff.removedApps} />
              <DiffTile color="#f59e0b"               label="Changed" ids={status.available.diff.changedApps} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--shell-muted)' }}>
                Fetched {formatTime(status.available.fetchedAt)} · {status.available.appCount} apps · etag {shortEtag(status.available.etag)}
              </span>
              <div style={{ flex: 1 }} />
              <button onClick={handleDismiss} disabled={busy === 'dismiss'} style={BUTTON_GHOST}>
                Dismiss
              </button>
              <button onClick={handleApply} disabled={busy === 'apply'} style={BUTTON_PRIMARY}>
                {busy === 'apply' ? 'Applying…' : 'Apply update'}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--shell-muted)' }}>
              Applying swaps the in-memory directory used for new launches. Windows opened from this point on use the
              new catalogue; in-flight windows reflect the previous version until reopened.
            </div>
          </div>
        </div>
      )}

      {/* Settings form */}
      <div style={SECTION}>
        <div style={SECTION_HEADER}>
          <span>Settings</span>
          <span>{settingsDirty ? 'Unsaved changes' : 'In sync'}</span>
        </div>
        <div style={{ ...SECTION_BODY, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Directory URL" description="HTTPS endpoint returning a JSON app-directory file. Leave empty to use the local bundle.">
            <input
              type="text"
              placeholder="https://directory.example.com/app-directory.json"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              style={INPUT}
            />
          </Field>

          <Field label="Refresh interval" description="How often to poll the remote. 'Off' = manual only.">
            <select
              value={draftInterval}
              onChange={(e) => setDraftInterval(Number(e.target.value))}
              style={INPUT}
            >
              {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Current user role" description="Drives the entitlement filter. Apps with no roles[] are visible to everyone.">
            <select value={draftRole} onChange={(e) => setDraftRole(e.target.value)} style={INPUT}>
              {ROLE_OPTIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
          </Field>

          <Field label="Telemetry endpoint" description="Reserved — Insights export target for future SaaS rollups.">
            <input
              type="text"
              placeholder="https://telemetry.example.com/v1/events"
              value={draftTelemetry}
              onChange={(e) => setDraftTelemetry(e.target.value)}
              style={INPUT}
            />
          </Field>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                if (!status) return;
                setDraftUrl(status.settings.directoryUrl);
                setDraftInterval(status.settings.refreshIntervalMs);
                setDraftRole(status.settings.currentRole);
                setDraftTelemetry(status.settings.telemetryEndpoint);
              }}
              disabled={!settingsDirty || busy === 'save'}
              style={BUTTON_GHOST}
            >
              Reset
            </button>
            <button onClick={handleSave} disabled={!settingsDirty || busy === 'save'} style={BUTTON_PRIMARY}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Entitlements summary */}
      <div style={SECTION}>
        <div style={SECTION_HEADER}>
          <span>Entitlements ({entitlementsSummary.role})</span>
          <span>
            {entitlementsSummary.visible} visible · {entitlementsSummary.restricted} restricted
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ background: 'var(--shell-panel-2)' }}>
              <tr>
                {['App', 'Roles allowed', 'Effective'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--shell-muted)', fontWeight: 800, borderBottom: '1px solid var(--shell-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => {
                const roles = (app as unknown as { roles?: string[] }).roles ?? [];
                const allowed = isAllowedForRole(roles, entitlementsSummary.role);
                return (
                  <tr key={app.appId} style={{ borderBottom: '1px solid var(--shell-border)' }}>
                    <td style={{ padding: '6px 12px', fontWeight: 800, color: 'var(--shell-text)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: allowed ? 'var(--shell-positive)' : 'var(--shell-muted)' }} />
                        {app.title}
                        <span style={{ color: 'var(--shell-muted)', fontWeight: 500, fontSize: 11 }}>{app.appId}</span>
                      </div>
                    </td>
                    <td style={{ padding: '6px 12px', color: 'var(--shell-muted)' }}>
                      {roles.length === 0 ? (
                        <span style={{ fontStyle: 'italic' }}>everyone</span>
                      ) : (
                        roles.map((r) => (
                          <span key={r} style={{
                            display: 'inline-block', marginRight: 4, padding: '1px 7px',
                            background: r === entitlementsSummary.role ? 'var(--shell-accent-soft)' : 'rgba(255,255,255,0.04)',
                            border: '1px solid var(--shell-border)', borderRadius: 999,
                            fontSize: 10, fontWeight: 700, color: 'var(--shell-text)',
                          }}>{r}</span>
                        ))
                      )}
                    </td>
                    <td style={{ padding: '6px 12px', fontWeight: 800, color: allowed ? 'var(--shell-positive)' : '#ef4444' }}>
                      {allowed ? 'Visible' : 'Restricted'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--shell-muted)', borderTop: '1px solid var(--shell-border)' }}>
          Roles are a <strong>UI surface</strong> only — FDC3 routing, contexts and intents are unaffected.
          Apps with no <code>roles[]</code> are visible to every role.
        </div>
      </div>
    </div>
  );
}

// ─── Tiny presentational helpers ────────────────────────────────────────────

function Field({ label, description, children }: { label: string; description: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--shell-muted)', fontWeight: 800 }}>{label}</div>
      {children}
      <div style={{ fontSize: 10, color: 'var(--shell-muted)' }}>{description}</div>
    </div>
  );
}

function DiffTile({ label, ids, color }: { label: string; ids: string[]; color: string }): React.JSX.Element {
  return (
    <div style={{ border: '1px solid var(--shell-border)', borderRadius: 8, padding: 10, background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color, fontWeight: 800 }}>{label}</span>
        <span style={{ fontSize: 18, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>{ids.length}</span>
      </div>
      {ids.length === 0 ? (
        <span style={{ fontSize: 11, color: 'var(--shell-muted)' }}>—</span>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--shell-text)', lineHeight: 1.5 }}>
          {ids.slice(0, 4).map((id) => (
            <div key={id} style={{ fontFamily: 'ui-monospace, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</div>
          ))}
          {ids.length > 4 && <div style={{ color: 'var(--shell-muted)' }}>+{ids.length - 4} more</div>}
        </div>
      )}
    </div>
  );
}
