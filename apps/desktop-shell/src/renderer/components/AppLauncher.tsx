import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as React from 'react';
import { Search, X } from 'lucide-react';
import type { AppEntry } from '../App.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent } from './ui/card.js';
import { Input } from './ui/input.js';
import { cn } from '../lib/utils.js';
import { AppIcon } from './AppIcon.js';

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

const PIN_STORAGE_KEY = 'fdc3.shell.launcher.pinned.v1';

interface AppLauncherProps {
  apps: AppEntry[];
  onOpen: (appId: string) => void;
}

interface AppLifecycleSnapshot {
  appId: string;
  running: boolean;
  isMinimized: boolean;
  webContentsId: number | null;
}

interface ShellAppsLifecycleApi {
  getLifecycle(): Promise<AppLifecycleSnapshot[]>;
  restart(appId: string): Promise<boolean>;
}

function getLifecycleApi(): ShellAppsLifecycleApi | undefined {
  return (window as unknown as { shellChrome?: { apps?: ShellAppsLifecycleApi } }).shellChrome?.apps;
}

function readPinned(): string[] {
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function AppLauncher({ apps, onOpen }: AppLauncherProps): JSX.Element {
  const lifecycleApi = getLifecycleApi();
  const [pinnedIds, setPinnedIds] = useState<string[]>(readPinned);
  const [lifecycle, setLifecycle] = useState<AppLifecycleSnapshot[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const clearFilters = useCallback(() => { setSearch(''); setCategoryFilter(null); }, []);

  useEffect(() => {
    window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  const refreshLifecycle = useCallback(() => {
    if (!lifecycleApi) return;
    void lifecycleApi.getLifecycle().then(setLifecycle).catch(() => undefined);
  }, [lifecycleApi]);

  useEffect(() => {
    refreshLifecycle();
    const id = window.setInterval(refreshLifecycle, 2_000);
    return () => window.clearInterval(id);
  }, [refreshLifecycle]);

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const lifecycleByApp = useMemo(() => new Map(lifecycle.map((item) => [item.appId, item])), [lifecycle]);

  const allCategories = useMemo(
    () => [...new Set(apps.map((a) => a.category ?? 'Other'))].sort(),
    [apps],
  );

  const query = search.toLowerCase().trim();
  const isFiltering = query.length > 0 || categoryFilter !== null;

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const matchesSearch =
        !query ||
        app.title.toLowerCase().includes(query) ||
        app.description?.toLowerCase().includes(query) ||
        app.category?.toLowerCase().includes(query) ||
        app.appId.toLowerCase().includes(query);
      const matchesCategory = !categoryFilter || (app.category ?? 'Other') === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [apps, query, categoryFilter]);

  const pinnedApps = isFiltering ? filteredApps.filter((app) => pinnedSet.has(app.appId)) : apps.filter((app) => pinnedSet.has(app.appId));
  const regularApps = filteredApps.filter((app) => !pinnedSet.has(app.appId));
  const categories = [...new Set(regularApps.map((a) => a.category ?? 'Other'))];

  const togglePin = (appId: string): void => {
    setPinnedIds((prev) => (
      prev.includes(appId)
        ? prev.filter((id) => id !== appId)
        : [...prev, appId]
    ));
  };

  const openApp = (appId: string): void => {
    onOpen(appId);
    window.setTimeout(refreshLifecycle, 350);
  };

  const restartApp = (appId: string): void => {
    if (lifecycleApi) {
      void lifecycleApi.restart(appId).then(() => {
        window.setTimeout(refreshLifecycle, 650);
      });
      return;
    }
    onOpen(appId);
    window.setTimeout(refreshLifecycle, 350);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filter bar */}
      <div className="flex flex-col gap-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps by name, category, or description…"
            className="pl-8 pr-8 text-sm"
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

        {/* Category filter pills */}
        <div className="flex flex-wrap gap-1.5">
          <CategoryPill
            label="All"
            count={apps.length}
            active={categoryFilter === null}
            color="var(--shell-accent)"
            onClick={() => setCategoryFilter(null)}
          />
          <CategoryPill
            label="Pinned"
            count={pinnedIds.length}
            active={categoryFilter === '__pinned__'}
            color="#f59e0b"
            onClick={() => setCategoryFilter(categoryFilter === '__pinned__' ? null : '__pinned__')}
          />
          {allCategories.map((cat) => (
            <CategoryPill
              key={cat}
              label={cat}
              count={apps.filter((a) => (a.category ?? 'Other') === cat).length}
              active={categoryFilter === cat}
              color={CATEGORY_COLORS[cat] ?? '#8080a0'}
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
            />
          ))}
        </div>

        {/* Result count when filtering */}
        {isFiltering && categoryFilter !== '__pinned__' && (
          <p className="text-[11px] text-muted-foreground">
            {filteredApps.length === 0
              ? 'No apps match your search'
              : `${filteredApps.length} app${filteredApps.length === 1 ? '' : 's'} found`}
            {(search || categoryFilter) && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-2 font-semibold text-foreground hover:underline"
              >
                Clear
              </button>
            )}
          </p>
        )}
      </div>

      {/* App grid */}
      <div className="flex flex-col gap-6 pb-6">
        {/* Pinned — only show when not filtering by category */}
        {categoryFilter !== '__pinned__' && pinnedApps.length > 0 && (
          <AppSection title="Pinned" color="var(--shell-accent)">
            {pinnedApps.map((app) => (
              <AppCard
                key={app.appId}
                app={app}
                lifecycle={lifecycleByApp.get(app.appId)}
                pinned
                onOpen={openApp}
                onRestart={restartApp}
                onTogglePin={togglePin}
              />
            ))}
          </AppSection>
        )}

        {/* Pinned-only filter */}
        {categoryFilter === '__pinned__' && (
          pinnedIds.length === 0 ? (
            <EmptyState
              message="No pinned apps. Click the Pin button on any app card."
              onClear={clearFilters}
            />
          ) : (
            <AppSection title="Pinned" color="#f59e0b">
              {apps.filter((app) => pinnedSet.has(app.appId)).map((app) => (
                <AppCard
                  key={app.appId}
                  app={app}
                  lifecycle={lifecycleByApp.get(app.appId)}
                  pinned
                  onOpen={openApp}
                  onRestart={restartApp}
                  onTogglePin={togglePin}
                />
              ))}
            </AppSection>
          )
        )}

        {/* Grouped by category */}
        {categoryFilter !== '__pinned__' && categories.map((cat) => (
          <AppSection key={cat} title={cat} color={CATEGORY_COLORS[cat] ?? '#8080a0'}>
            {regularApps
              .filter((a) => (a.category ?? 'Other') === cat)
              .map((app) => (
                <AppCard
                  key={app.appId}
                  app={app}
                  lifecycle={lifecycleByApp.get(app.appId)}
                  pinned={false}
                  onOpen={openApp}
                  onRestart={restartApp}
                  onTogglePin={togglePin}
                />
              ))}
          </AppSection>
        ))}

        {isFiltering && filteredApps.length === 0 && categoryFilter !== '__pinned__' && (
          <EmptyState
            message={search ? `No apps match "${search}"` : `No apps in this category`}
            onClear={clearFilters}
          />
        )}
      </div>
    </div>
  );
}

function CategoryPill({
  label,
  count,
  active,
  color,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors',
        active
          ? 'border-transparent text-background'
          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      )}
      style={active ? { background: color, borderColor: color } : undefined}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-1 text-[10px] font-black tabular-nums',
          active ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ message, onClear }: { message: string; onClear?: () => void }): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
      <Search className="size-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-sm font-semibold text-foreground hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function AppSection({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em]" style={{ color }}>
        <div className="h-px w-5 opacity-60" style={{ background: color }} />
        {title}
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {children}
      </div>
    </section>
  );
}

function AppCard({
  app,
  lifecycle,
  pinned,
  onOpen,
  onRestart,
  onTogglePin,
}: {
  app: AppEntry;
  lifecycle?: AppLifecycleSnapshot;
  pinned: boolean;
  onOpen: (id: string) => void;
  onRestart: (id: string) => void;
  onTogglePin: (id: string) => void;
}): JSX.Element {
  const categoryColor = CATEGORY_COLORS[app.category ?? 'Other'] ?? '#8080a0';
  const transport = app.devPort > 0 ? `dev:${app.devPort}` : app.url.startsWith('http') ? 'remote' : 'bundled';
  const capabilityCount =
    (app.capabilities?.broadcasts?.length ?? 0) +
    (app.capabilities?.listensTo?.length ?? 0) +
    (app.capabilities?.raisesIntents?.length ?? 0) +
    (app.capabilities?.handlesIntents?.length ?? 0);
  const running = !!lifecycle?.running;
  const minimized = !!lifecycle?.isMinimized;

  return (
    <Card className="group flex min-h-44 flex-col rounded-lg transition-transform hover:-translate-y-px hover:border-[color:var(--shell-accent-border)] hover:shadow-[0_4px_20px_rgba(64,128,232,0.15)]">
      <CardContent className="flex h-full flex-col gap-3 pt-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-2xl"
            style={{ background: `${categoryColor}20`, borderColor: `${categoryColor}55`, color: categoryColor }}
          >
            <AppIcon icon={app.icon} fallback={app.title.slice(0, 1)} size={24} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="truncate text-sm font-black text-foreground">{app.title}</div>
            <div className="text-[10px] font-bold text-muted-foreground">
              {app.category ?? 'Other'} / {transport}
            </div>
          </div>
          <Button
            type="button"
            onClick={() => onTogglePin(app.appId)}
            title={pinned ? 'Unpin app' : 'Pin app'}
            className="ml-auto"
            size="xs"
            variant={pinned ? 'default' : 'outline'}
          >
            {pinned ? 'Pin' : '+'}
          </Button>
        </div>

        {app.description && (
          <div className="line-clamp-3 min-h-11 text-xs font-bold leading-snug text-muted-foreground">
            {app.description}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <StatusPill
            variant={running ? 'success' : 'secondary'}
            label={running ? (minimized ? 'Minimized' : 'Running') : 'Available'}
          />
          {capabilityCount > 0 && <StatusPill variant="default" label={`${capabilityCount} caps`} />}
          {app.intents && app.intents.length > 0 && <StatusPill variant="warning" label={`${app.intents.length} intents`} />}
        </div>

        <div className="flex w-full gap-2">
          <Button className="flex-1" onClick={() => onOpen(app.appId)} size="sm" type="button">
            {running ? 'Focus' : 'Open'}
          </Button>
          <Button
            type="button"
            onClick={() => onRestart(app.appId)}
            title={running ? 'Close and reopen this app' : 'Open this app'}
            size="sm"
            variant="outline"
          >
            {running ? 'Restart' : 'Start'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ variant, label }: { variant: 'default' | 'secondary' | 'success' | 'warning'; label: string }): JSX.Element {
  return <Badge variant={variant}>{label}</Badge>;
}
