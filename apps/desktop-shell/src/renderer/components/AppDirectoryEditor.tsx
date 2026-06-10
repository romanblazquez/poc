import { useCallback, useEffect, useState } from 'react';
import type { AppEntry } from '../App.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent } from './ui/card.js';
import { Input } from './ui/input.js';
import { cn } from '../lib/utils.js';
import { IconPicker } from './IconPicker.js';
import { AppIcon } from './AppIcon.js';
import { CloudDownload, X } from 'lucide-react';

interface AppDirectoryEditorProps {
  apps: AppEntry[];
  onAppsChanged: (apps: AppEntry[]) => void;
}

interface AppDirectoryApi {
  save(apps: unknown[]): Promise<{ ok: boolean; count: number }>;
  fetchRemote(url: string): Promise<{ ok: boolean; apps: unknown[]; error?: string }>;
}

interface EnvApi {
  list(): Promise<Array<{ id: string; name: string; appDirectoryUrl?: string }>>;
  getActiveId(): Promise<string | null>;
}

function getApi(): AppDirectoryApi | undefined {
  return (window as unknown as { shellChrome?: { appDirectory?: AppDirectoryApi } }).shellChrome?.appDirectory;
}

function getEnvApi(): EnvApi | undefined {
  return (window as unknown as { shellChrome?: { environment?: EnvApi } }).shellChrome?.environment;
}

const CATEGORIES = ['CRM', 'Investments', 'Markets', 'Payments', 'Trading', 'Operations', 'Analytics'];

const STANDARD_INTENTS = [
  'ViewInstrument', 'ViewChart', 'ViewQuote', 'ViewNews', 'ViewAnalysis', 'ViewResearch',
  'ViewContact', 'ViewPortfolio', 'ViewAccount', 'ViewOrders', 'ViewHoldings',
  'StartPayment', 'StartChat', 'SendChatMessage', 'CreateInteraction',
];

const STANDARD_CONTEXT_TYPES = [
  'fdc3.instrument', 'fdc3.contact', 'fdc3.portfolio', 'fdc3.order',
  'fdc3.account', 'fdc3.position', 'fdc3.chart', 'fdc3.organization',
];

const BLANK_APP: AppEntry = {
  appId: '',
  title: '',
  description: '',
  icon: '',
  iconColor: '',
  category: '',
  url: '',
  devPort: 0,
};

type IntentDraft = {
  intent: string;
  customIntent: string;
  contextTypes: string;
  displayName: string;
};

const BLANK_INTENT: IntentDraft = {
  intent: '',
  customIntent: '',
  contextTypes: '',
  displayName: '',
};

function AppForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: AppEntry;
  onSave: (app: AppEntry) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<AppEntry>(initial);
  const [newIntent, setNewIntent] = useState<IntentDraft>(BLANK_INTENT);
  const [ctxInput, setCtxInput] = useState('');

  const set = (key: keyof AppEntry, value: string | number) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const resolvedIntentName = newIntent.intent === '__custom__'
    ? newIntent.customIntent.trim()
    : newIntent.intent.trim();

  const addIntent = () => {
    const name = resolvedIntentName;
    if (!name) return;
    if ((draft.intents ?? []).some((entry) => entry.intent === name)) return;

    const contextTypes = [...new Set(
      newIntent.contextTypes.split(',').map((value) => value.trim()).filter(Boolean),
    )];
    const entry = {
      intent: name,
      contextTypes: contextTypes.length > 0 ? contextTypes : null,
      appId: draft.appId,
      ...(newIntent.displayName.trim() ? { displayName: newIntent.displayName.trim() } : {}),
    };
    setDraft((prev) => ({ ...prev, intents: [...(prev.intents ?? []), entry] }));
    setNewIntent(BLANK_INTENT);
  };

  const removeIntent = (idx: number) =>
    setDraft((prev) => ({ ...prev, intents: (prev.intents ?? []).filter((_, i) => i !== idx) }));

  const commitCtxInput = (raw: string) => {
    const types = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!types.length) return;
    setDraft((prev) => ({
      ...prev,
      listensForContexts: [...new Set([...(prev.listensForContexts ?? []), ...types])],
    }));
    setCtxInput('');
  };

  const removeCtx = (type: string) =>
    setDraft((prev) => ({ ...prev, listensForContexts: (prev.listensForContexts ?? []).filter((t) => t !== type) }));

  const saveDraft = () => {
    const normalizedIntents = draft.intents?.map((intent) => ({
      ...intent,
      appId: draft.appId.trim(),
      contextTypes: intent.contextTypes?.length ? [...new Set(intent.contextTypes)] : null,
    }));

    onSave({
      ...draft,
      appId: draft.appId.trim(),
      title: draft.title.trim(),
      url: draft.url.trim(),
      intents: normalizedIntents,
      capabilities: {
        ...draft.capabilities,
        handlesIntents: normalizedIntents?.map((intent) => intent.intent) ?? [],
      },
    });
  };

  const valid = draft.appId.trim().length > 0 && draft.title.trim().length > 0 && draft.url.trim().length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">App ID *</label>
          <Input
            value={draft.appId}
            onChange={(e) => set('appId', e.target.value)}
            placeholder="my-app"
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Title *</label>
          <Input
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="My App"
            className="h-7 text-xs"
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">URL *</label>
          <Input
            value={draft.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="http://localhost:4010"
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Dev Port</label>
          <Input
            type="number"
            value={draft.devPort || ''}
            onChange={(e) => set('devPort', parseInt(e.target.value, 10) || 0)}
            placeholder="4010"
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Icon</label>
          <IconPicker
            value={draft.icon ?? ''}
            color={draft.iconColor ?? ''}
            onChange={(val, col) => setDraft((prev) => ({ ...prev, icon: val, iconColor: col }))}
            fallback={draft.title.slice(0, 1) || '?'}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Description</label>
          <Input
            value={draft.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Brief description of the app"
            className="h-7 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Category</label>
          <select
            value={draft.category ?? ''}
            onChange={(e) => set('category', e.target.value)}
            className="h-7 rounded-md border bg-background px-2 text-xs font-semibold text-foreground"
          >
            <option value="">— None —</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* ── Intents handled ─────────────────────────────────────── */}
        <div className="col-span-2 flex flex-col gap-2">
          <label className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">
            Intents handled
            <span className="ml-1 font-normal normal-case text-muted-foreground/60">(FDC3 intent routing)</span>
          </label>

          {/* Existing intent rows */}
          {(draft.intents ?? []).map((intent, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
              <span className="font-mono font-bold text-foreground">{intent.intent}</span>
              {(intent.contextTypes?.length ?? 0) > 0 && (
                <span className="text-muted-foreground">→ {intent.contextTypes?.join(', ')}</span>
              )}
              {!intent.contextTypes?.length && (
                <span className="italic text-muted-foreground/60">any context</span>
              )}
              {intent.displayName && intent.displayName !== intent.intent && (
                <span className="ml-auto mr-2 text-[10px] text-muted-foreground">"{intent.displayName}"</span>
              )}
              <button
                type="button"
                onClick={() => removeIntent(i)}
                className="ml-auto flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {/* Add new intent row */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <select
              value={newIntent.intent}
              onChange={(e) => setNewIntent((prev) => ({
                ...prev,
                intent: e.target.value,
                customIntent: e.target.value === '__custom__' ? prev.customIntent : '',
              }))}
              className="h-7 min-w-0 rounded-md border bg-background px-2 font-mono text-xs font-semibold text-foreground"
            >
              <option value="">— Select intent —</option>
              {STANDARD_INTENTS.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="__custom__">Custom…</option>
            </select>
            {newIntent.intent === '__custom__' && (
              <Input
                value={newIntent.customIntent}
                onChange={(e) => setNewIntent((prev) => ({ ...prev, customIntent: e.target.value }))}
                placeholder="MyCustomIntent"
                className="h-7 font-mono text-xs"
              />
            )}
            <Input
              value={newIntent.displayName}
              onChange={(e) => setNewIntent((prev) => ({ ...prev, displayName: e.target.value }))}
              placeholder="Display label (optional)"
              className="h-7 text-xs"
            />
            <div className="flex min-w-0 gap-2 md:col-span-2">
              <Input
                value={newIntent.contextTypes}
                onChange={(e) => setNewIntent((prev) => ({ ...prev, contextTypes: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') addIntent(); }}
                placeholder="fdc3.instrument, fdc3.contact"
                className="h-7 min-w-0 flex-1 font-mono text-xs"
                title="Comma-separated context types. Leave empty to accept any."
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-xs"
                disabled={!resolvedIntentName || (draft.intents ?? []).some((entry) => entry.intent === resolvedIntentName)}
                onClick={addIntent}
              >
                Add
              </Button>
            </div>
          </div>
          {(draft.intents ?? []).some((entry) => entry.intent === resolvedIntentName) && resolvedIntentName && (
            <span className="text-[10px] font-semibold text-destructive">
              This app already declares {resolvedIntentName}.
            </span>
          )}
        </div>

        {/* ── Listens for contexts ─────────────────────────────────── */}
        <div className="col-span-2 flex flex-col gap-2">
          <label className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">
            Listens for contexts
            <span className="ml-1 font-normal normal-case text-muted-foreground/60">(passive subscriptions)</span>
          </label>

          {/* Tag chips */}
          {(draft.listensForContexts ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(draft.listensForContexts ?? []).map((ctx) => (
                <span
                  key={ctx}
                  className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 font-mono text-[10px] text-foreground"
                >
                  {ctx}
                  <button
                    type="button"
                    onClick={() => removeCtx(ctx)}
                    className="flex h-3 w-3 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                  >
                    <X size={8} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Context type input */}
          <div className="flex items-center gap-2">
            <select
              value=""
              onChange={(e) => { if (e.target.value) { commitCtxInput(e.target.value); e.target.value = ''; } }}
              className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs text-foreground"
            >
              <option value="">— Quick add —</option>
              {STANDARD_CONTEXT_TYPES
                .filter((t) => !(draft.listensForContexts ?? []).includes(t))
                .map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Input
              value={ctxInput}
              onChange={(e) => setCtxInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitCtxInput(ctxInput); }
              }}
              placeholder="fdc3.instrument or custom.type"
              className="h-7 flex-[2] font-mono text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-xs"
              disabled={!ctxInput.trim()}
              onClick={() => commitCtxInput(ctxInput)}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" disabled={!valid} onClick={saveDraft}>
          Save App
        </Button>
      </div>
    </div>
  );
}

export function AppDirectoryEditor({ apps, onAppsChanged }: AppDirectoryEditorProps) {
  const [draft, setDraft] = useState<AppEntry[]>(apps);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [filter, setFilter] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);
  const [appDUrl, setAppDUrl] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'fetching' | 'error'>('idle');
  const [importError, setImportError] = useState('');

  // Load the active environment's appDirectoryUrl on mount.
  useEffect(() => {
    const envApi = getEnvApi();
    if (!envApi) return;
    void (async () => {
      const [profiles, activeId] = await Promise.all([envApi.list(), envApi.getActiveId()]);
      const active = profiles.find((p) => p.id === activeId);
      if (active?.appDirectoryUrl) setAppDUrl(active.appDirectoryUrl);
    })();
  }, []);

  const applyDraft = useCallback((next: AppEntry[]) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const handleEdit = useCallback((originalAppId: string, updated: AppEntry) => {
    if (updated.appId !== originalAppId && draft.some((app) => app.appId === updated.appId)) {
      alert(`App ID "${updated.appId}" already exists.`);
      return;
    }
    applyDraft(draft.map((app) => (app.appId === originalAppId ? updated : app)));
    setEditingId(null);
  }, [draft, applyDraft]);

  const handleAdd = useCallback((newApp: AppEntry) => {
    if (draft.some((a) => a.appId === newApp.appId)) {
      alert(`App ID "${newApp.appId}" already exists.`);
      return;
    }
    applyDraft([...draft, newApp]);
    setAddingNew(false);
  }, [draft, applyDraft]);

  const handleDelete = useCallback((appId: string) => {
    applyDraft(draft.filter((a) => a.appId !== appId));
  }, [draft, applyDraft]);

  const handleApply = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setSaveStatus('saving');
    try {
      await api.save(draft);
      onAppsChanged(draft);
      setSaveStatus('saved');
      setDirty(false);
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [draft, onAppsChanged]);

  const handleImportFromAppD = useCallback(async () => {
    const appDirApi = getApi();
    if (!appDirApi || !appDUrl.trim()) return;
    setImportStatus('fetching');
    setImportError('');
    try {
      const result = await appDirApi.fetchRemote(appDUrl.trim());
      if (!result.ok) { setImportStatus('error'); setImportError(result.error ?? 'Unknown error'); return; }
      const incoming = result.apps as AppEntry[];
      // Merge: update existing entries by appId, append new ones.
      const merged = [...draft];
      for (const app of incoming) {
        const idx = merged.findIndex((a) => a.appId === app.appId);
        if (idx >= 0) merged[idx] = { ...merged[idx], ...app };
        else merged.push(app);
      }
      applyDraft(merged);
      setImportStatus('idle');
    } catch (e) {
      setImportStatus('error');
      setImportError(e instanceof Error ? e.message : String(e));
    }
  }, [appDUrl, draft, applyDraft]);

  const filtered = draft.filter((a) => {
    const q = filter.toLowerCase();
    return (
      a.appId.toLowerCase().includes(q) ||
      a.title.toLowerCase().includes(q) ||
      (a.category ?? '').toLowerCase().includes(q) ||
      (a.description ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {/* AppD import row */}
      <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <CloudDownload className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">AppD URL</span>
        <Input
          value={appDUrl}
          onChange={(e) => setAppDUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleImportFromAppD(); }}
          placeholder="https://appd.firm.com/v2/apps  or  file.json"
          className="h-7 flex-1 font-mono text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 text-xs"
          disabled={!appDUrl.trim() || importStatus === 'fetching'}
          onClick={() => void handleImportFromAppD()}
        >
          {importStatus === 'fetching' ? 'Fetching…' : 'Import'}
        </Button>
        {importStatus === 'error' && (
          <span className="shrink-0 text-[11px] font-bold text-destructive" title={importError}>Import failed</span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter apps…"
          className="h-7 max-w-64 text-xs"
        />
        <Badge variant="secondary" className="shrink-0">{draft.length} apps</Badge>
        <div className="flex-1" />
        {dirty && (
          <span className="text-[11px] font-bold text-amber-500">Unsaved changes</span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-[11px] font-bold text-[color:var(--shell-positive)]">Applied to runtime ✓</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-[11px] font-bold text-destructive">Apply failed</span>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => { setAddingNew(true); setEditingId(null); }}
          disabled={addingNew}
        >
          + Add App
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saveStatus === 'saving'}
          onClick={() => void handleApply()}
        >
          {saveStatus === 'saving' ? 'Applying…' : 'Apply to Runtime'}
        </Button>
      </div>

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {/* New app form */}
        {addingNew && (
          <AppForm
            initial={BLANK_APP}
            onSave={handleAdd}
            onCancel={() => setAddingNew(false)}
          />
        )}

        {/* App rows */}
        {filtered.map((app) => (
          editingId === app.appId ? (
            <AppForm
              key={app.appId}
              initial={app}
              onSave={(updated) => handleEdit(app.appId, updated)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <AppRow
              key={app.appId}
              app={app}
              onEdit={() => { setEditingId(app.appId); setAddingNew(false); }}
              onDelete={() => handleDelete(app.appId)}
            />
          )
        ))}

        {filtered.length === 0 && !addingNew && (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {filter ? 'No apps match your filter.' : 'No apps in directory.'}
          </div>
        )}
      </div>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  CRM: '#4080e8',
  Investments: '#40c080',
  Markets: '#e8d840',
  Payments: '#e84080',
  Trading: '#91b4ff',
  Operations: '#e8a040',
  Analytics: '#a040e8',
};

function AppRow({ app, onEdit, onDelete }: { app: AppEntry; onEdit: () => void; onDelete: () => void }) {
  const color = CATEGORY_COLORS[app.category ?? ''] ?? 'var(--shell-accent)';
  return (
    <Card className="shrink-0">
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-lg"
          style={{ background: `${color}18`, borderColor: `${color}40`, color }}
        >
          <AppIcon icon={app.icon} iconColor={app.iconColor} fallback={app.title.slice(0, 1)} size={22} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black text-foreground">{app.title}</span>
            {app.category && (
              <Badge
                variant="outline"
                className="shrink-0 text-[10px] font-bold"
                style={{ color, borderColor: `${color}60` }}
              >
                {app.category}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('font-mono text-[10px] text-muted-foreground')}>{app.appId}</span>
            <span className="text-[10px] text-muted-foreground/60">·</span>
            <span className="font-mono text-[10px] text-muted-foreground truncate">{app.url}</span>
          </div>
          {app.description && (
            <span className="line-clamp-1 text-[11px] text-muted-foreground">{app.description}</span>
          )}
          <div className="flex flex-wrap gap-1 pt-1">
            {(app.intents?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                {app.intents?.length} intent{app.intents?.length === 1 ? '' : 's'}
              </Badge>
            )}
            {(app.listensForContexts?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                {app.listensForContexts?.length} context{app.listensForContexts?.length === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="xs" variant="ghost" onClick={onEdit}>Edit</Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              if (confirm(`Remove "${app.title}" from the directory?`)) onDelete();
            }}
          >
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
