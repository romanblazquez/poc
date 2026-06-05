import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppEntry } from '../App.js';

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

export function AppLauncher({ apps, onOpen }: AppLauncherProps) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
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
}) {
  return (
    <section>
      <div
        style={{
          alignItems: 'center',
          color,
          display: 'flex',
          fontSize: 11,
          fontWeight: 800,
          gap: 8,
          letterSpacing: 1.2,
          marginBottom: 12,
          textTransform: 'uppercase',
        }}
      >
        <div style={{ background: color, height: 1, opacity: 0.5, width: 20 }} />
        {title}
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
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
}) {
  const [hover, setHover] = React.useState(false);
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
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        alignItems: 'flex-start',
        background: hover ? 'var(--shell-panel)' : 'var(--shell-panel-2)',
        border: `1px solid ${hover ? 'var(--shell-accent-border)' : 'var(--shell-border)'}`,
        borderRadius: 8,
        boxShadow: hover ? '0 4px 20px rgba(64, 128, 232, 0.15)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 178,
        padding: '13px 14px',
        textAlign: 'left',
        transform: hover ? 'translateY(-1px)' : 'none',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: 10, width: '100%' }}>
        <div
          style={{
            alignItems: 'center',
            background: `${categoryColor}20`,
            border: `1px solid ${categoryColor}55`,
            borderRadius: 8,
            color: categoryColor,
            display: 'flex',
            fontSize: 24,
            height: 40,
            justifyContent: 'center',
            width: 40,
          }}
        >
          {app.icon ?? app.title.slice(0, 1)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--shell-text)', fontSize: 13, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {app.title}
          </div>
          <div style={{ color: 'var(--shell-muted)', fontSize: 10, fontWeight: 750, marginTop: 2 }}>
            {app.category ?? 'Other'} / {transport}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onTogglePin(app.appId)}
          title={pinned ? 'Unpin app' : 'Pin app'}
          style={{
            background: pinned ? 'var(--shell-accent-soft)' : 'transparent',
            border: `1px solid ${pinned ? 'var(--shell-accent-border)' : 'var(--shell-border)'}`,
            borderRadius: 6,
            color: pinned ? 'var(--shell-accent-text)' : 'var(--shell-muted)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 900,
            height: 24,
            marginLeft: 'auto',
            width: 28,
          }}
        >
          {pinned ? 'Pin' : '+'}
        </button>
      </div>

      {app.description && (
        <div style={{ color: 'var(--shell-muted)', fontSize: 11, lineHeight: 1.4, marginTop: 10, minHeight: 46 }}>
          {app.description}
        </div>
      )}

      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto', paddingTop: 12 }}>
        <StatusPill
          color={running ? 'var(--shell-positive)' : 'var(--shell-muted)'}
          label={running ? (minimized ? 'Minimized' : 'Running') : 'Available'}
        />
        {capabilityCount > 0 && <StatusPill color="var(--shell-accent)" label={`${capabilityCount} caps`} />}
        {app.intents && app.intents.length > 0 && <StatusPill color="#f59e0b" label={`${app.intents.length} intents`} />}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, width: '100%' }}>
        <button
          type="button"
          onClick={() => onOpen(app.appId)}
          style={{
            background: 'var(--shell-accent-soft)',
            border: '1px solid var(--shell-accent-border)',
            borderRadius: 6,
            color: 'var(--shell-accent-text)',
            cursor: 'pointer',
            flex: 1,
            fontSize: 11,
            fontWeight: 850,
            height: 28,
          }}
        >
          {running ? 'Focus' : 'Open'}
        </button>
        <button
          type="button"
          onClick={() => onRestart(app.appId)}
          title={running ? 'Close and reopen this app' : 'Open this app'}
          style={{
            background: 'transparent',
            border: '1px solid var(--shell-border)',
            borderRadius: 6,
            color: 'var(--shell-muted)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 850,
            height: 28,
            padding: '0 10px',
          }}
        >
          {running ? 'Restart' : 'Start'}
        </button>
      </div>
    </div>
  );
}

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        alignItems: 'center',
        border: `1px solid ${color}55`,
        borderRadius: 999,
        color,
        display: 'inline-flex',
        fontSize: 10,
        fontWeight: 850,
        gap: 5,
        padding: '2px 7px',
      }}
    >
      <span style={{ background: color, borderRadius: 999, height: 6, width: 6 }} />
      {label}
    </span>
  );
}
