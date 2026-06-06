import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as React from 'react';
import type { AppEntry } from '../App.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent } from './ui/card.js';

const CATEGORY_COLORS: Record<string, string> = {
  CRM: '#4080e8',
  Investments: '#40c080',
  Markets: '#e8d840',
  Payments: '#e84080',
  Trading: '#91b4ff',
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
  const pinnedApps = apps.filter((app) => pinnedSet.has(app.appId));
  const regularApps = apps.filter((app) => !pinnedSet.has(app.appId));
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
    <div className="flex flex-col gap-6 pb-6">
      {pinnedApps.length > 0 && (
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

      {categories.map((cat) => (
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
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-2xl"
            style={{ background: `${categoryColor}20`, borderColor: `${categoryColor}55`, color: categoryColor }}
          >
            {app.icon ?? app.title.slice(0, 1)}
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
