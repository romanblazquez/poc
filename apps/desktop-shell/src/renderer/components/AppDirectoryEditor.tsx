import { useCallback, useState } from 'react';
import type { AppEntry } from '../App.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent } from './ui/card.js';
import { Input } from './ui/input.js';
import { cn } from '../lib/utils.js';

interface AppDirectoryEditorProps {
  apps: AppEntry[];
  onAppsChanged: (apps: AppEntry[]) => void;
}

interface AppDirectoryApi {
  save(apps: unknown[]): Promise<{ ok: boolean; count: number }>;
}

function getApi(): AppDirectoryApi | undefined {
  return (window as unknown as { shellChrome?: { appDirectory?: AppDirectoryApi } }).shellChrome?.appDirectory;
}

const CATEGORIES = ['CRM', 'Investments', 'Markets', 'Payments', 'Trading', 'Operations', 'Analytics'];

const BLANK_APP: AppEntry = {
  appId: '',
  title: '',
  description: '',
  icon: '',
  category: '',
  url: '',
  devPort: 0,
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

  const set = (key: keyof AppEntry, value: string | number) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

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
          <Input
            value={draft.icon ?? ''}
            onChange={(e) => set('icon', e.target.value)}
            placeholder="📊"
            className="h-7 text-xs"
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
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" disabled={!valid} onClick={() => onSave(draft)}>
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

  const applyDraft = useCallback((next: AppEntry[]) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const handleEdit = useCallback((updated: AppEntry) => {
    applyDraft(draft.map((a) => (a.appId === updated.appId ? updated : a)));
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
              onSave={handleEdit}
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
          {app.icon ?? app.title.slice(0, 1)}
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
