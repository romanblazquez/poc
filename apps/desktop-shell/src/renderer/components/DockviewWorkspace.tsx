import React, { useCallback, useContext, useEffect, useRef, useState, createContext } from 'react';
import type { DetailedHTMLProps, HTMLAttributes, CSSProperties } from 'react';
import { DockviewReact, type IDockviewPanelProps, type DockviewApi, type DockviewReadyEvent } from 'dockview';
import type { AppEntry } from '../App.js';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { ThemeName } from '@fdc3-poc/fdc3-core';
import 'dockview/dist/styles/dockview.css';
import '../styles/dockview-override.css';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        preload?: string;
        partition?: string;
        ref?: React.Ref<HTMLElement>;
        onDomReady?: (event: { currentTarget: EmbeddedWebview }) => void;
      };
    }
  }
}

type ThemeMode = ThemeName;

type EmbeddedWebview = HTMLElement & {
  executeJavaScript(script: string): Promise<unknown>;
};

interface DockviewWorkspaceProps {
  apps: AppEntry[];
  currentChannel: UserChannel | null;
  preloadPath: string;
  initialPanelIds?: string[];
  initialLayout?: unknown;
  onLayoutChange?: (layout: unknown) => void;
  onOpenPanelsChange?: (panelIds: string[]) => void;
  onDetachWorkspace?: (payload: DetachedWorkspacePayload) => Promise<void>;
  workspaceName?: string;
  theme: ThemeMode;
  detached?: boolean;
}

export interface DetachedWorkspacePayload {
  id: string;
  name: string;
  panelIds: string[];
  layout: unknown | null;
  channelId: string | null;
  theme: ThemeMode;
  sourceWorkspaceId?: string;
}

interface AppPanelParams {
  appId: string;
  appUrl: string;
  preloadPath: string;
  channelId: string | null;
  theme: ThemeMode;
  // NOTE: registerWebview is intentionally NOT in params — functions cannot be
  // JSON-serialised by Dockview's fromJSON/toJSON.  It is delivered via context.
}

type RegisterWebviewFn = (appId: string, node: EmbeddedWebview | null) => void;
type MarkReadyFn = (appId: string, channelId: string | null, theme: ThemeMode) => void;

interface WebviewContextValue {
  registerWebview: RegisterWebviewFn;
  markReady: MarkReadyFn;
}

const WebviewContext = createContext<WebviewContextValue>({
  registerWebview: () => undefined,
  markReady: () => undefined,
});

function resolveEmbeddedAppUrl(app: AppEntry): string {
  if (window.location.protocol.startsWith('http')) {
    return `http://localhost:${app.devPort}`;
  }
  return app.url;
}

function syncEmbeddedApp(webview: EmbeddedWebview, channelId: string | null, theme: ThemeMode): void {
  const dataTheme = THEMES[theme].dataTheme;
  const script = [
    `document.documentElement.dataset.theme = ${JSON.stringify(dataTheme)};`,
    channelId
      ? `window.fdc3?.joinUserChannel(${JSON.stringify(channelId)});`
      : 'window.fdc3?.leaveCurrentChannel?.();',
  ].join(' ');
  void webview.executeJavaScript(script);
}

function AppPanelComponent({ params }: IDockviewPanelProps<AppPanelParams>) {
  const { registerWebview, markReady } = useContext(WebviewContext);
  return (
    <div style={{ height: '100%', width: '100%', background: 'var(--shell-bg)' }}>
      <webview
        ref={(node) => registerWebview(params.appId, node as EmbeddedWebview | null)}
        src={params.appUrl}
        preload={`file://${params.preloadPath}`}
        partition={`persist:workspace-${params.appId}`}
        style={{ height: '100%', width: '100%', border: 'none' } as CSSProperties}
        onDomReady={() => {
          // dom-ready fired — now safe to call executeJavaScript
          markReady(params.appId, params.channelId, params.theme);
        }}
      />
    </div>
  );
}

function populatePanels(
  api: DockviewApi,
  panelApps: AppEntry[],
  preloadPath: string,
  channelId: string | null,
  theme: ThemeMode,
): void {
  if (panelApps.length === 0) return;

  api.addPanel<AppPanelParams>({
    id: panelApps[0].appId,
    component: 'app-panel',
    title: panelApps[0].title,
    params: {
      appId: panelApps[0].appId,
      appUrl: resolveEmbeddedAppUrl(panelApps[0]),
      preloadPath,
      channelId,
      theme,
    },
  });

  if (panelApps[1]) {
    api.addPanel<AppPanelParams>({
      id: panelApps[1].appId,
      component: 'app-panel',
      title: panelApps[1].title,
      params: {
        appId: panelApps[1].appId,
        appUrl: resolveEmbeddedAppUrl(panelApps[1]),
        preloadPath,
        channelId,
        theme,
      },
      position: { referencePanel: panelApps[0].appId, direction: 'right' },
    });
  }

  if (panelApps[2]) {
    api.addPanel<AppPanelParams>({
      id: panelApps[2].appId,
      component: 'app-panel',
      title: panelApps[2].title,
      params: {
        appId: panelApps[2].appId,
        appUrl: resolveEmbeddedAppUrl(panelApps[2]),
        preloadPath,
        channelId,
        theme,
      },
      position: { referencePanel: panelApps[1]?.appId ?? panelApps[0].appId, direction: 'below' },
    });
  }

  for (let index = 3; index < panelApps.length; index += 1) {
    const app = panelApps[index];
    api.addPanel<AppPanelParams>({
      id: app.appId,
      component: 'app-panel',
      title: app.title,
      params: {
        appId: app.appId,
        appUrl: resolveEmbeddedAppUrl(app),
        preloadPath,
        channelId,
        theme,
      },
    });
  }
}

export function DockviewWorkspace({
  apps,
  currentChannel,
  preloadPath,
  initialPanelIds,
  initialLayout,
  onLayoutChange,
  onOpenPanelsChange,
  onDetachWorkspace,
  workspaceName,
  theme,
  detached = false,
}: DockviewWorkspaceProps) {
  const channelId = currentChannel?.id ?? null;
  const dockApiRef = useRef<DockviewApi | null>(null);
  const listenersRef = useRef<Array<{ dispose: () => void }>>([]);
  const webviewsRef = useRef(new Map<string, EmbeddedWebview>());
  const readyIdsRef = useRef(new Set<string>());
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [openPanelIds, setOpenPanelIds] = useState<Set<string>>(new Set());

  const registerWebview = useCallback((appId: string, node: EmbeddedWebview | null) => {
    if (node) {
      webviewsRef.current.set(appId, node);
      // Do NOT call syncEmbeddedApp here — dom-ready has not fired yet.
      return;
    }
    webviewsRef.current.delete(appId);
    readyIdsRef.current.delete(appId);
  }, []);

  const markReady = useCallback((appId: string, channelId: string | null, theme: ThemeMode) => {
    readyIdsRef.current.add(appId);
    const webview = webviewsRef.current.get(appId);
    if (webview) syncEmbeddedApp(webview, channelId, theme);
  }, []);

  const syncOpenPanels = useCallback((api: DockviewApi) => {
    const knownIds = new Set(apps.map((app) => app.appId));
    const panelIds = api.panels.map((panel) => panel.id).filter((id) => knownIds.has(id));
    setOpenPanelIds(new Set(panelIds));
    onOpenPanelsChange?.(panelIds);
  }, [apps, onOpenPanelsChange]);

  const clearListeners = useCallback(() => {
    for (const disposable of listenersRef.current) {
      disposable.dispose();
    }
    listenersRef.current = [];
  }, []);

  const resolveInitialApps = useCallback((): AppEntry[] => {
    if (initialPanelIds && initialPanelIds.length > 0) {
      return initialPanelIds
        .map((id) => apps.find((app) => app.appId === id))
        .filter((app): app is AppEntry => Boolean(app));
    }
    return apps;
  }, [apps, initialPanelIds]);

  const resetLayout = useCallback(() => {
    const api = dockApiRef.current;
    if (!api) return;

    const panelApps = resolveInitialApps();
    api.clear();
    populatePanels(api, panelApps, preloadPath, channelId, theme);
    syncOpenPanels(api);
    setShowAddMenu(false);
  }, [resolveInitialApps, preloadPath, channelId, theme, syncOpenPanels]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    dockApiRef.current = api;

    if (initialLayout) {
      try {
        api.fromJSON(initialLayout as never);
      } catch {
        resetLayout();
      }
    } else {
      resetLayout();
    }

    clearListeners();
    listenersRef.current.push(api.onDidAddPanel(() => syncOpenPanels(api)));
    listenersRef.current.push(api.onDidRemovePanel(() => syncOpenPanels(api)));
    listenersRef.current.push(api.onDidLayoutFromJSON(() => syncOpenPanels(api)));
    listenersRef.current.push(api.onDidLayoutChange(() => onLayoutChange?.(api.toJSON())));
    syncOpenPanels(api);
  }, [clearListeners, initialLayout, onLayoutChange, resetLayout, syncOpenPanels]);

  useEffect(() => clearListeners, [clearListeners]);

  // If onReady fired before apps were available (e.g. apps loaded async after mount),
  // populate panels once the app list arrives.
  useEffect(() => {
    if (apps.length === 0) return;
    const api = dockApiRef.current;
    if (!api) return;
    if (api.panels.length === 0) {
      resetLayout();
    }
  }, [apps, resetLayout]);

  useEffect(() => {
    for (const [appId, webview] of webviewsRef.current) {
      if (readyIdsRef.current.has(appId)) {
        syncEmbeddedApp(webview, channelId, theme);
      }
    }
  }, [channelId, theme]);

  const addPanel = useCallback((app: AppEntry) => {
    const api = dockApiRef.current;
    if (!api) return;

    const existing = api.getPanel(app.appId);
    if (existing) {
      existing.focus();
      setShowAddMenu(false);
      return;
    }

    api.addPanel<AppPanelParams>({
      id: app.appId,
      component: 'app-panel',
      title: app.title,
      params: {
        appId: app.appId,
        appUrl: resolveEmbeddedAppUrl(app),
        preloadPath,
        channelId,
        theme,
      },
    });
    setShowAddMenu(false);
  }, [channelId, preloadPath, theme]);

  const detachWorkspace = useCallback(async () => {
    if (!onDetachWorkspace) return;
    const api = dockApiRef.current;
    const ids = Array.from(openPanelIds);
    if (!api || ids.length === 0) return;

    const payload: DetachedWorkspacePayload = {
      id: `workspace-${Date.now()}`,
      name: workspaceName ?? 'Workspace',
      panelIds: ids,
      layout: api.toJSON(),
      channelId,
      theme,
    };
    await onDetachWorkspace(payload);
    api.clear();
    syncOpenPanels(api);
  }, [channelId, onDetachWorkspace, openPanelIds, syncOpenPanels, theme, workspaceName]);

  const closedApps = apps.filter((app) => !openPanelIds.has(app.appId));

  return (
    <div style={rootStyle}>
      {!detached && (
        <div style={toolbarStyle}>
          <button onClick={resetLayout} style={secondaryButtonStyle}>
            Reset Layout
          </button>
          {onDetachWorkspace && openPanelIds.size > 0 && (
            <button onClick={() => void detachWorkspace()} style={detachButtonStyle} title="Detach this workspace as one window">
              Detach Workspace
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowAddMenu((value) => !value)} style={primaryButtonStyle}>
              Add App
            </button>
            {showAddMenu && (
              <div style={addMenuStyle}>
                {closedApps.length === 0 && (
                  <div style={{ padding: '8px 12px', color: 'var(--shell-muted)', fontSize: 11 }}>All apps open</div>
                )}
                {closedApps.map((app) => (
                  <button
                    key={app.appId}
                    onClick={() => addPanel(app)}
                    style={addMenuItemStyle}
                  >
                    {app.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ color: 'var(--shell-muted)', fontSize: 11, fontWeight: 800, letterSpacing: 0 }}>
            {workspaceName ?? 'Workspace'}
          </span>
          <span style={{ color: 'var(--shell-subtle)', fontSize: 11 }}>
            Single-window Dockview workspace
          </span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <WebviewContext.Provider value={{ registerWebview, markReady }}>
          <DockviewReact
            onReady={onReady}
            components={{ 'app-panel': AppPanelComponent }}
            className={THEMES[theme].dockview}
            style={{ height: '100%', width: '100%' }}
          />
        </WebviewContext.Provider>
      </div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  minHeight: 0,
  width: '100%',
};

const toolbarStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--shell-panel)',
  borderBottom: '1px solid var(--shell-border)',
  display: 'flex',
  flexShrink: 0,
  gap: 8,
  padding: '5px 10px',
};

const primaryButtonStyle: CSSProperties = {
  background: 'var(--shell-accent-soft)',
  border: '1px solid var(--shell-accent-border)',
  borderRadius: 6,
  color: 'var(--shell-accent-text)',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 800,
  height: 24,
  padding: '0 10px',
  textTransform: 'uppercase',
};

const secondaryButtonStyle: CSSProperties = {
  background: 'var(--shell-panel-2)',
  border: '1px solid var(--shell-border)',
  borderRadius: 6,
  color: 'var(--shell-text)',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 800,
  height: 24,
  padding: '0 10px',
  textTransform: 'uppercase',
};

const detachButtonStyle: CSSProperties = {
  background: 'var(--shell-accent-soft)',
  border: '1px solid var(--shell-accent-border)',
  borderRadius: 6,
  color: 'var(--shell-accent-text)',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 800,
  height: 24,
  padding: '0 10px',
  textTransform: 'uppercase',
};

const addMenuStyle: CSSProperties = {
  background: 'var(--shell-panel)',
  border: '1px solid var(--shell-border)',
  borderRadius: 8,
  boxShadow: '0 10px 24px rgba(0,0,0,0.45)',
  display: 'flex',
  flexDirection: 'column',
  left: 0,
  marginTop: 4,
  minWidth: 180,
  position: 'absolute',
  top: '100%',
  zIndex: 20,
};

const addMenuItemStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--shell-text)',
  cursor: 'pointer',
  fontSize: 12,
  padding: '8px 12px',
  textAlign: 'left',
};
