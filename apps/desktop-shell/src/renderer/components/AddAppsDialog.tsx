import { useMemo, useState } from 'react';
import { AppIcon } from './AppIcon.js';
import { Search, X, CheckCircle2, Plus, Minus } from 'lucide-react';
import type { AppEntry } from '../App.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog.js';
import { Input } from './ui/input.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

const CATEGORY_COLORS: Record<string, string> = {
  CRM: '#4080e8',
  Investments: '#40c080',
  Markets: '#e8d840',
  Payments: '#e84080',
  Trading: '#91b4ff',
  Collaboration: '#c084fc',
  Developer: '#34d399',
  Cloud: '#60a5fa',
};

interface AddAppsDialogProps {
  open: boolean;
  onClose: () => void;
  apps: AppEntry[];
  currentWorkspaceAppIds: string[];
  onAddToWorkspace: (appId: string) => void;
  onRemoveFromWorkspace: (appId: string) => void;
}

export function AddAppsDialog({ open, onClose, apps, currentWorkspaceAppIds, onAddToWorkspace, onRemoveFromWorkspace }: AddAppsDialogProps): JSX.Element {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const workspaceSet = useMemo(() => new Set(currentWorkspaceAppIds), [currentWorkspaceAppIds]);

  const allCategories = useMemo(
    () => ['All', ...new Set(apps.map((a) => a.category ?? 'Other'))].filter(Boolean),
    [apps],
  );

  const query = search.toLowerCase().trim();

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const matchesSearch =
        !query ||
        app.title.toLowerCase().includes(query) ||
        app.description?.toLowerCase().includes(query) ||
        app.category?.toLowerCase().includes(query) ||
        app.appId.toLowerCase().includes(query);
      const matchesCategory =
        !activeCategory || activeCategory === 'All' || (app.category ?? 'Other') === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [apps, query, activeCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: apps.length };
    for (const app of apps) {
      const cat = app.category ?? 'Other';
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [apps]);

  const handleAdd = (appId: string) => {
    onAddToWorkspace(appId);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex h-[80vh] max-h-[720px] w-[min(900px,95vw)] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>Add Apps to Workspace</DialogTitle>
          <DialogDescription>Search the app catalog and add apps to your current workspace.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: Category sidebar */}
          <aside className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-card p-2">
            {allCategories.map((cat) => {
              const color = cat === 'All' ? 'var(--shell-accent)' : (CATEGORY_COLORS[cat] ?? '#8080a0');
              const isActive = (activeCategory === null && cat === 'All') || activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat === 'All' ? null : cat)}
                  className={cn(
                    'flex h-8 w-full items-center justify-between rounded px-2.5 text-left text-[12px] font-semibold transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: isActive ? color : 'currentColor', opacity: isActive ? 1 : 0.4 }}
                    />
                    {cat}
                  </span>
                  <span className="text-[10px] font-black tabular-nums opacity-50">{categoryCounts[cat] ?? 0}</span>
                </button>
              );
            })}
          </aside>

          {/* Right: Search + grid */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Search bar */}
            <div className="shrink-0 border-b p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, description, intent…"
                  className="pl-8 pr-8 text-sm"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {query && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {filteredApps.length === 0
                    ? 'No apps match your search'
                    : `${filteredApps.length} result${filteredApps.length === 1 ? '' : 's'}`}
                </p>
              )}
            </div>

            {/* App grid */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filteredApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <Search className="size-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No apps found</p>
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="text-sm font-semibold text-foreground hover:underline"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
                  {filteredApps.map((app) => (
                    <MegaMenuAppCard
                      key={app.appId}
                      app={app}
                      inWorkspace={workspaceSet.has(app.appId)}
                      onAdd={handleAdd}
                      onRemove={onRemoveFromWorkspace}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MegaMenuAppCard({
  app,
  inWorkspace,
  onAdd,
  onRemove,
}: {
  app: AppEntry;
  inWorkspace: boolean;
  onAdd: (appId: string) => void;
  onRemove: (appId: string) => void;
}): JSX.Element {
  const categoryColor = CATEGORY_COLORS[app.category ?? 'Other'] ?? '#8080a0';
  const transport = app.devPort > 0 ? `dev:${app.devPort}` : app.url.startsWith('http') ? 'remote' : 'bundled';

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-lg border p-3 transition-colors',
        inWorkspace
          ? 'border-[color:var(--shell-positive)]/30 bg-[color:var(--shell-positive)]/5'
          : 'border-border hover:border-[color:var(--shell-accent-border)] hover:bg-muted/30',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xl"
          style={{ background: `${categoryColor}20`, borderColor: `${categoryColor}55` }}
        >
          <AppIcon icon={app.icon} fallback={app.title.slice(0, 1)} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-black text-foreground">{app.title}</div>
          <div className="text-[10px] font-semibold text-muted-foreground">
            <span style={{ color: categoryColor }}>{app.category ?? 'Other'}</span>
            {' · '}
            {transport}
          </div>
        </div>
      </div>

      {/* Description */}
      {app.description && (
        <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {app.description}
        </p>
      )}

      {/* Intents */}
      {app.intents && app.intents.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {app.intents.slice(0, 3).map((intent) => (
            <Badge key={intent.intent} variant="outline" className="h-4 px-1.5 text-[9px] font-bold">
              {intent.intent}
            </Badge>
          ))}
          {app.intents.length > 3 && (
            <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-bold">
              +{app.intents.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Action */}
      {inWorkspace ? (
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 flex-1 gap-1 text-[11px]"
            onClick={() => onAdd(app.appId)}
          >
            <CheckCircle2 className="size-3.5" />
            Open / Focus
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRemove(app.appId)}
            title="Remove from workspace"
          >
            <Minus className="size-3.5" />
            Remove
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7 w-full gap-1.5 text-[11px]"
          onClick={() => onAdd(app.appId)}
        >
          <Plus className="size-3.5" />
          Add to Workspace
        </Button>
      )}
    </div>
  );
}
