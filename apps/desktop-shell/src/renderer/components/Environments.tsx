import { useCallback, useEffect, useState } from 'react';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Input } from './ui/input.js';
import { Pencil, Trash2, CheckCircle2, RefreshCw, Lock, AlertTriangle, Settings2 } from 'lucide-react';
import { SetupWizard } from './SetupWizard.js';
import { EnvSwitchConfirm } from './EnvSwitchConfirm.js';
import { JsonSampleButton } from './JsonSampleButton.js';
import { SAMPLES } from '../samples.js';

interface EnvironmentProfile {
  id: string;
  name: string;
  color?: string;
  description?: string;
  appDirectoryUrl?: string;
}

type ShellEnvApi = typeof window extends { shellChrome: { environment: infer T } } ? T : {
  list(): Promise<EnvironmentProfile[]>;
  getActiveId(): Promise<string | null>;
  add(data: Omit<EnvironmentProfile, 'id'>): Promise<EnvironmentProfile | null>;
  update(id: string, patch: Partial<Omit<EnvironmentProfile, 'id'>>): Promise<EnvironmentProfile | null>;
  delete(id: string): Promise<boolean>;
  activate(id: string): Promise<{ profile: EnvironmentProfile; appCount: number | null } | null>;
};

function envApi(): ShellEnvApi {
  return (window as unknown as { shellChrome: { environment: ShellEnvApi } }).shellChrome.environment;
}

const EMPTY_FORM: Omit<EnvironmentProfile, 'id'> = {
  name: '',
  color: '#4CAF50',
  description: '',
  appDirectoryUrl: '',
};

const COLOR_PRESETS = ['#4CAF50', '#FF9800', '#F44336', '#2196F3', '#9C27B0', '#00BCD4'];

function urlSecurity(url: string): 'secure' | 'insecure' | 'local' | 'empty' {
  if (!url?.trim()) return 'empty';
  if (url.includes('localhost') || url.includes('127.0.0.1')) return 'local';
  return url.trim().startsWith('https://') ? 'secure' : 'insecure';
}

export function Environments() {
  const [profiles, setProfiles] = useState<EnvironmentProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Omit<EnvironmentProfile, 'id'>>(EMPTY_FORM);
  const [toast, setToast] = useState<string | null>(null);
  const [wizardEnv, setWizardEnv] = useState<EnvironmentProfile | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState<{ from: EnvironmentProfile; to: EnvironmentProfile } | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, id] = await Promise.all([envApi().list(), envApi().getActiveId()]);
      setProfiles(list);
      setActiveId(id);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const doActivate = useCallback(async (id: string) => {
    setActivating(id);
    try {
      const result = await envApi().activate(id);
      if (result) {
        setActiveId(result.profile.id);
        window.localStorage.setItem('fdc3.active-env-id', id);
        window.dispatchEvent(new CustomEvent('fdc3-env-changed', {
          detail: { id: result.profile.id, name: result.profile.name, color: result.profile.color },
        }));
        const extra = (result as { fetchedFromUrl?: boolean }).fetchedFromUrl ? ' (fetched from URL)' : '';
        const msg = result.appCount != null
          ? `Switched to ${result.profile.name} — ${result.appCount} apps loaded${extra}`
          : `Switched to ${result.profile.name} (using current app directory)`;
        showToast(msg);
      }
    } finally {
      setActivating(null);
    }
  }, []);

  const activate = useCallback(async (profile: EnvironmentProfile) => {
    const isDevLike = profile.id === 'dev' || urlSecurity(profile.appDirectoryUrl ?? '') === 'local';
    if (!isDevLike && !profile.appDirectoryUrl?.trim()) {
      setWizardEnv(profile);
      return;
    }
    if (!isDevLike) {
      const fromProfile = profiles.find((p) => p.id === activeId) ?? { id: activeId ?? 'dev', name: activeId ?? 'Dev', color: undefined };
      setConfirmSwitch({ from: fromProfile as EnvironmentProfile, to: profile });
      return;
    }
    await doActivate(profile.id);
  }, [doActivate, profiles, activeId]);

  const handleAdd = useCallback(async () => {
    if (!form.name.trim()) return;
    const added = await envApi().add({ ...form, name: form.name.trim() });
    if (added) {
      setProfiles((prev) => [...prev, added]);
      setShowAdd(false);
      setForm(EMPTY_FORM);
    }
  }, [form]);

  const startEdit = (p: EnvironmentProfile) => {
    setEditingId(p.id);
    setForm({ name: p.name, color: p.color ?? '#4CAF50', description: p.description ?? '', appDirectoryUrl: p.appDirectoryUrl ?? '' });
    setShowAdd(false);
  };

  const commitEdit = useCallback(async () => {
    if (!editingId || !form.name.trim()) return;
    const updated = await envApi().update(editingId, { ...form, name: form.name.trim() });
    if (updated) {
      setProfiles((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, [editingId, form]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this environment? The persisted app directory file will remain in userData.')) return;
    const ok = await envApi().delete(id);
    if (ok) {
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (activeId === id) setActiveId(null);
    }
  }, [activeId]);

  const formPanel = (
    <div style={{ background: 'var(--shell-panel-2)', border: '1px solid var(--shell-border)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--shell-muted)', display: 'block', marginBottom: 4 }}>NAME *</label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Production" className="h-8 text-sm" />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--shell-muted)', display: 'block', marginBottom: 4 }}>COLOR</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, border: form.color === c ? '2px solid white' : '2px solid transparent',
                  cursor: 'pointer', outline: 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--shell-muted)', display: 'block', marginBottom: 4 }}>DESCRIPTION</label>
        <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Live production environment" className="h-8 text-sm" />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--shell-muted)', display: 'block', marginBottom: 4 }}>APP DIRECTORY URL <span style={{ color: 'var(--shell-subtle)', fontWeight: 400 }}>(optional — leave blank to use local saved copy)</span></label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Input value={form.appDirectoryUrl} onChange={(e) => setForm((f) => ({ ...f, appDirectoryUrl: e.target.value }))} placeholder="https://uat.firm.com/app-directory.json" className="h-8 text-sm" />
          <JsonSampleButton {...SAMPLES.appDirectory} />
        </div>
        {(() => {
          const sec = urlSecurity(form.appDirectoryUrl ?? '');
          if (sec === 'insecure') return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: 'var(--shell-negative, #f74f4f)', fontWeight: 600 }}>
              <AlertTriangle size={12} /> HTTP is not allowed for cloud environments — use https://
            </div>
          );
          if (sec === 'secure') return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: 'var(--shell-positive, #40e880)', fontWeight: 600 }}>
              <Lock size={12} /> Secure HTTPS URL
            </div>
          );
          return null;
        })()}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="sm" onClick={editingId ? commitEdit : handleAdd} disabled={!form.name.trim() || urlSecurity(form.appDirectoryUrl ?? '') === 'insecure'}>
          {editingId ? 'Save' : 'Add Environment'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760, position: 'relative' }}>
      {/* Env switch countdown overlay */}
      {confirmSwitch && (
        <EnvSwitchConfirm
          fromName={confirmSwitch.from.name}
          toName={confirmSwitch.to.name}
          toColor={confirmSwitch.to.color}
          onConfirm={async () => {
            const toId = confirmSwitch.to.id;
            setConfirmSwitch(null);
            await doActivate(toId);
          }}
          onCancel={() => setConfirmSwitch(null)}
        />
      )}

      {/* Wizard overlay */}
      {wizardEnv && (
        <SetupWizard
          env={wizardEnv}
          onComplete={async (_updates) => {
            setWizardEnv(null);
            await doActivate(wizardEnv.id);
            await reload();
          }}
          onSkip={async () => {
            setWizardEnv(null);
            await doActivate(wizardEnv.id);
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: 'var(--shell-positive, #3fb950)', color: '#06210f', padding: '10px 20px',
          borderRadius: 8, fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>{toast}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--shell-text)', margin: 0 }}>Environments</h2>
          <p style={{ fontSize: 12, color: 'var(--shell-muted)', margin: '2px 0 0' }}>
            Switch between named environments. Each env persists its own app directory in Electron userData.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />{loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Button size="sm" onClick={() => { setShowAdd(true); setEditingId(null); setForm(EMPTY_FORM); }}>
            + New Environment
          </Button>
        </div>
      </div>

      {showAdd && !editingId && <div style={{ marginBottom: 16 }}>{formPanel}</div>}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Environment Profiles</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {profiles.length === 0 && !loading && (
            <p style={{ color: 'var(--shell-muted)', fontSize: 12 }}>No environments defined.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {profiles.map((p) => {
              const isActive = p.id === activeId;
              const isEditing = editingId === p.id;
              return (
                <div key={p.id}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8,
                    background: isActive ? 'var(--shell-accent-soft, rgba(59,130,246,0.08))' : 'var(--shell-panel-2)',
                    border: `1px solid ${isActive ? 'var(--shell-accent-border, rgba(59,130,246,0.3))' : 'var(--shell-border)'}`,
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color ?? '#888', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--shell-text)' }}>{p.name}</span>
                        {isActive && <Badge variant="default" className="text-[10px] px-1.5 py-0">Active</Badge>}
                      </div>
                      {p.description && <div style={{ fontSize: 11, color: 'var(--shell-muted)', marginTop: 1 }}>{p.description}</div>}
                      {p.appDirectoryUrl && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--shell-subtle)', fontFamily: 'monospace', marginTop: 2 }}>
                          {urlSecurity(p.appDirectoryUrl) === 'secure'   && <Lock size={9} style={{ color: 'var(--shell-positive)' }} />}
                          {urlSecurity(p.appDirectoryUrl) === 'insecure' && <AlertTriangle size={9} style={{ color: 'var(--shell-negative)' }} />}
                          {p.appDirectoryUrl}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {!isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void activate(p)}
                          disabled={activating === p.id}
                          className="h-7 text-xs"
                        >
                          {activating === p.id
                            ? <RefreshCw className="h-3 w-3 animate-spin" />
                            : !p.appDirectoryUrl && p.id !== 'dev'
                              ? <><Settings2 className="h-3 w-3 mr-1" />Setup</>
                              : <><CheckCircle2 className="h-3 w-3 mr-1" />Switch</>}
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => void handleDelete(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {isEditing && <div style={{ marginTop: 6, marginBottom: 6 }}>{formPanel}</div>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div style={{ marginTop: 20, padding: 14, background: 'var(--shell-panel-2)', borderRadius: 8, border: '1px solid var(--shell-border)' }}>
        <p style={{ fontSize: 11, color: 'var(--shell-muted)', margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--shell-subtle)' }}>How it works:</strong> Each environment stores its app directory in{' '}
          <code style={{ fontSize: 10, background: 'var(--shell-panel)', padding: '1px 4px', borderRadius: 3 }}>userData/app-directory-{'{envId}'}.json</code>.
          Edits made in the App Directory panel are automatically saved to the active env's file.
          Switching environments hot-swaps the runtime app directory — no restart needed.
        </p>
      </div>
    </div>
  );
}
