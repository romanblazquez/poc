import { useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, createContext, forwardRef } from 'react';
import type { CSSProperties } from 'react';
import { DockviewReact, type IDockviewPanelProps, type IDockviewPanelHeaderProps, type DockviewApi, type DockviewReadyEvent } from 'dockview';
import type { AppEntry } from '../App.js';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { ThemeName } from '@fdc3-poc/fdc3-core';
import { LayoutGrid, Plus } from 'lucide-react';
import { Button } from './ui/button.js';
import { AppIcon } from './AppIcon.js';
import 'dockview/dist/styles/dockview.css';
import '../styles/dockview-override.css';

type ThemeMode = ThemeName;

type EmbeddedWebview = HTMLElement & {
  executeJavaScript(script: string): Promise<unknown>;
  loadURL(url: string): Promise<void>;
  reload(): void;
};

interface DockviewWorkspaceProps {
  apps: AppEntry[];
  currentChannel: UserChannel | null;
  /** Authoritative channel ID from workspace state — updated synchronously, used for webview sync. */
  channelId: string | null;
  preloadPath: string;
  initialPanelIds?: string[];
  initialLayout?: unknown;
  onLayoutChange?: (layout: unknown) => void;
  onOpenPanelsChange?: (panelIds: string[]) => void;
  onDetachWorkspace?: (payload: DetachedWorkspacePayload) => Promise<void>;
  onAddApp?: () => void;
  workspaceName?: string;
  theme: ThemeMode;
  detached?: boolean;
  displays?: DisplayInfo[];
  headersVisible?: boolean;
  /** When changed, forces the workspace to re-initialize from initialLayout/initialPanelIds. */
  resetKey?: string | number;
  /**
   * When true, forcibly hides all webviews in the pool regardless of slot positions.
   * Required for inactive workspace instances on Windows where Electron webviews are native
   * HWNDs that do not respect CSS display:none on ancestor elements.
   */
  hidden?: boolean;
}

export interface DetachedWorkspacePayload {
  id: string;
  name: string;
  panelIds: string[];
  layout: unknown | null;
  channelId: string | null;
  theme: ThemeMode;
  sourceWorkspaceId?: string;
  targetX?: number;
  targetY?: number;
}

export interface DisplayInfo {
  id: number;
  isPrimary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

// AppPanelComponent only needs appId — pool creates and positions the webview.
interface AppPanelParams {
  appId: string;
  appUrl: string;       // kept for backwards-compat with saved workspace JSON
  preloadPath: string;  // kept for backwards-compat with saved workspace JSON
  channelId: string | null;
  theme: ThemeMode;
  icon?: string | null;
  iconColor?: string | null;
}

// ─── Webview pool context ─────────────────────────────────────────────────────
// AppPanelComponent registers its slot div here; the pool repositions the
// already-loaded webview over it instead of creating a new one.

interface WebviewPoolContextValue {
  bindSlot: (appId: string, el: HTMLDivElement) => void;
  unbindSlot: (appId: string) => void;
}

const WebviewPoolContext = createContext<WebviewPoolContextValue>({
  bindSlot: () => undefined,
  unbindSlot: () => undefined,
});

const OnAddAppContext = createContext<(() => void) | null>(null);
const CurrentChannelContext = createContext<UserChannel | null>(null);

// ─── Tab header ───────────────────────────────────────────────────────────────

function AppTabComponent({ api, params }: IDockviewPanelHeaderProps<AppPanelParams>) {
  const channel = useContext(CurrentChannelContext);
  const color = channel?.displayMetadata.color;
  const icon = params?.icon;
  const iconColor = params?.iconColor;
  // Only render AppIcon for structured formats; emoji is already in the title string via panelTitle().
  const showIconComponent = !!icon && (icon.startsWith('lucide:') || icon.startsWith('data:'));
  const rawTitle = api.title ?? '';
  const titleText = rawTitle.trim() || api.id;

  return (
    <div
      className="group flex h-full min-w-0 items-center gap-1.5 px-2.5"
      style={color ? { borderTop: `2px solid ${color}` } : { borderTop: '2px solid transparent' }}
      title={color ? channel?.displayMetadata.name : undefined}
    >
      {showIconComponent && (
        <span className="flex shrink-0 items-center" style={{ lineHeight: 1 }}>
          <AppIcon icon={icon} iconColor={iconColor} size={13} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[12px]">{titleText}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); api.close(); }}
        className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] leading-none opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-60 hover:!opacity-100"
        title="Close panel"
      >
        ×
      </button>
    </div>
  );
}

// ─── Empty workspace watermark ────────────────────────────────────────────────

function WorkspaceWatermark() {
  const onAddApp = useContext(OnAddAppContext);
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-border bg-card px-12 py-10">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed"
          style={{ borderColor: 'var(--shell-accent)', background: 'color-mix(in srgb, var(--shell-accent) 8%, transparent)' }}
        >
          <LayoutGrid className="size-7" style={{ color: 'var(--shell-accent)' }} />
        </div>
        <div className="flex flex-col items-center gap-1.5 text-center">
          <p className="text-sm font-black text-foreground">This workspace has no apps</p>
          <p className="max-w-[260px] text-[12px] leading-relaxed text-muted-foreground">
            Add apps to build your layout. Apps share context via FDC3 channels automatically.
          </p>
        </div>
        {onAddApp && (
          <Button type="button" size="sm" onClick={onAddApp} className="gap-1.5">
            <Plus className="size-3.5" />
            Add App
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── App panel — pure slot div ────────────────────────────────────────────────
// No <webview> here. The pool layer manages the actual webview elements
// so they survive panel close/reopen without reloading.

function AppPanelComponent({ params }: IDockviewPanelProps<AppPanelParams>) {
  const { bindSlot, unbindSlot } = useContext(WebviewPoolContext);
  const slotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    bindSlot(params.appId, el);
    return () => unbindSlot(params.appId);
  }, [params.appId, bindSlot, unbindSlot]);

  return (
    <div
      ref={slotRef}
      data-webview-slot={params.appId}
      style={{ height: '100%', width: '100%' }}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function appendQuery(url: string, query: string): string {
  const hashIndex = url.indexOf('#');
  const baseUrl = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${query}${hash}`;
}

function resolveEmbeddedAppUrl(app: AppEntry): string {
  const baseUrl = app.devPort > 0 && window.location.protocol.startsWith('http')
    ? `http://localhost:${app.devPort}`
    : app.url;
  return appendQuery(baseUrl, `fdc3AppId=${encodeURIComponent(app.appId)}`);
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

function panelTitle(app: AppEntry): string {
  // Only emit emoji/text icons in the tab title string; lucide: and data: are not renderable as text.
  const icon = app.icon && !app.icon.startsWith('lucide:') && !app.icon.startsWith('data:') ? app.icon : null;
  return icon ? `${icon} ${app.title}` : app.title;
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
    title: panelTitle(panelApps[0]),
    params: {
      appId: panelApps[0].appId,
      appUrl: resolveEmbeddedAppUrl(panelApps[0]),
      preloadPath,
      channelId,
      theme,
      icon: panelApps[0].icon,
      iconColor: panelApps[0].iconColor,
    },
  });

  if (panelApps[1]) {
    api.addPanel<AppPanelParams>({
      id: panelApps[1].appId,
      component: 'app-panel',
      title: panelTitle(panelApps[1]),
      params: {
        appId: panelApps[1].appId,
        appUrl: resolveEmbeddedAppUrl(panelApps[1]),
        preloadPath,
        channelId,
        theme,
        icon: panelApps[1].icon,
        iconColor: panelApps[1].iconColor,
      },
      position: { referencePanel: panelApps[0].appId, direction: 'right' },
    });
  }

  if (panelApps[2]) {
    api.addPanel<AppPanelParams>({
      id: panelApps[2].appId,
      component: 'app-panel',
      title: panelTitle(panelApps[2]),
      params: {
        appId: panelApps[2].appId,
        appUrl: resolveEmbeddedAppUrl(panelApps[2]),
        preloadPath,
        channelId,
        theme,
        icon: panelApps[2].icon,
        iconColor: panelApps[2].iconColor,
      },
      position: { referencePanel: panelApps[1]?.appId ?? panelApps[0].appId, direction: 'below' },
    });
  }

  for (let index = 3; index < panelApps.length; index += 1) {
    const app = panelApps[index];
    api.addPanel<AppPanelParams>({
      id: app.appId,
      component: 'app-panel',
      title: panelTitle(app),
      params: {
        appId: app.appId,
        appUrl: resolveEmbeddedAppUrl(app),
        preloadPath,
        channelId,
        theme,
        icon: app.icon,
        iconColor: app.iconColor,
      },
    });
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface DockviewWorkspaceHandle {
  addApp: (app: AppEntry) => void;
  removeApp: (appId: string) => void;
}

export const DockviewWorkspace = forwardRef<DockviewWorkspaceHandle, DockviewWorkspaceProps>(function DockviewWorkspace({
  apps,
  currentChannel,
  channelId,
  preloadPath,
  initialPanelIds,
  initialLayout,
  onLayoutChange,
  onOpenPanelsChange,
  onDetachWorkspace,
  onAddApp,
  workspaceName,
  theme,
  detached = false,
  displays = [],
  headersVisible = false,
  resetKey,
  hidden = false,
}, ref) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dockApiRef = useRef<DockviewApi | null>(null);
  const listenersRef = useRef<Array<{ dispose: () => void }>>([]);
  const tabObserverRef = useRef<MutationObserver | null>(null);
  const didInitialAutoPopulateRef = useRef(false);
  const [openPanelIds, setOpenPanelIds] = useState<Set<string>>(new Set());

  // ─── Webview pool state ─────────────────────────────────────────────────
  // webviews survive panel close/reopen — they're repositioned, never destroyed.

  const poolContainerRef = useRef<HTMLDivElement | null>(null);
  const webviewPoolRef = useRef(new Map<string, EmbeddedWebview>());
  const readyIdsRef = useRef(new Set<string>());
  const slotMapRef = useRef(new Map<string, HTMLDivElement>());
  const slotObserverMapRef = useRef(new Map<string, ResizeObserver>());
  const rafRef = useRef<number>(-1);
  // True while a Dockview resize drag or tab drag is in progress; syncPositions reads this.
  const poolBlockedRef = useRef(false);

  // Stable refs so pool callbacks never capture stale channel/theme values.
  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;
  const themeRef = useRef<ThemeMode>(theme);
  themeRef.current = theme;
  const appsRef = useRef(apps);
  appsRef.current = apps;
  const preloadPathRef = useRef(preloadPath);
  preloadPathRef.current = preloadPath;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  // Callback refs — let stable Dockview listeners always call the latest prop functions.
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;
  const onOpenPanelsChangeRef = useRef(onOpenPanelsChange);
  onOpenPanelsChangeRef.current = onOpenPanelsChange;

  // Reposition all pool webviews to match their current slot rects.
  // Reads all rects first (avoids layout thrashing), then writes all styles in one pass.
  const syncPositions = useCallback(() => {
    const pool = poolContainerRef.current;
    if (!pool) return;

    // When hidden (inactive workspace instance), forcibly hide all webviews so that
    // Electron's native HWND windows don't appear at coordinate (0,0) on Windows.
    if (hiddenRef.current) {
      for (const [, wv] of webviewPoolRef.current) {
        (wv as HTMLElement).style.cssText = 'position:absolute;border:none;visibility:hidden;pointer-events:none;width:1px;height:1px;';
      }
      return;
    }

    const poolRect = pool.getBoundingClientRect();

    // Read phase
    const updates: Array<{ wv: EmbeddedWebview; css: string }> = [];
    for (const [appId, wv] of webviewPoolRef.current) {
      const slot = slotMapRef.current.get(appId);
      if (!slot) {
        updates.push({ wv, css: 'position:absolute;border:none;visibility:hidden;pointer-events:none;width:1px;height:1px;' });
        continue;
      }
      const sr = slot.getBoundingClientRect();
      const pe = poolBlockedRef.current ? 'none' : 'auto';
      updates.push({
        wv,
        css: `position:absolute;border:none;visibility:visible;pointer-events:${pe};left:${sr.left - poolRect.left}px;top:${sr.top - poolRect.top}px;width:${sr.width}px;height:${sr.height}px;`,
      });
    }

    // Write phase
    for (const { wv, css } of updates) {
      (wv as HTMLElement).style.cssText = css;
    }
  }, []);

  const scheduleSyncPositions = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(syncPositions);
  }, [syncPositions]);

  // Create a webview element for appId and append it to the pool container.
  // Only called once per appId — subsequent panel opens reuse the same element.
  const createWebview = useCallback((appId: string) => {
    const pool = poolContainerRef.current;
    if (!pool || webviewPoolRef.current.has(appId)) return;
    if (!preloadPathRef.current) return; // preload not ready yet — bindSlot will retry

    const app = appsRef.current.find((a) => a.appId === appId);
    if (!app) return;

    const wv = document.createElement('webview') as unknown as EmbeddedWebview;
    wv.setAttribute('src', resolveEmbeddedAppUrl(app));
    wv.setAttribute('preload', preloadPathRef.current);
    wv.setAttribute('partition', `persist:workspace-${appId}`);
    // Start hidden until bindSlot provides a rect.
    wv.style.cssText = 'position:absolute;border:none;visibility:hidden;pointer-events:none;width:1px;height:1px;';

    wv.addEventListener('dom-ready', () => {
      readyIdsRef.current.add(appId);
      syncEmbeddedApp(wv, channelIdRef.current, themeRef.current);
    }, { once: true });

    const originalUrl = resolveEmbeddedAppUrl(app);

    const buildCrashPage = (title: string, detail: string): string => {
      const escaped = originalUrl.replace(/'/g, '%27');
      return `data:text/html;charset=utf-8,<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0f0f1a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#161625;border:1px solid #2a2a45;border-radius:12px;padding:36px 44px;max-width:480px;text-align:center}.eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:12px}.title{font-size:20px;font-weight:900;color:#f1f5f9;margin-bottom:8px}.detail{font-size:13px;color:#94a3b8;margin-bottom:24px;line-height:1.5}button{background:#4f6ef7;color:#fff;border:none;border-radius:7px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s}button:hover{opacity:.85}</style></head><body><div class="card"><div class="eyebrow">FDC3 Desktop Shell</div><div class="title">${title}</div><div class="detail">${detail}</div><button onclick="window.location.href='${escaped}'">Retry</button></div></body></html>`;
    };

    wv.addEventListener('did-fail-load', (event: Event & { isMainFrame?: boolean; errorCode?: number; errorDescription?: string }) => {
      if (!event.isMainFrame || event.errorCode === -3) return;
      void wv.loadURL(buildCrashPage(
        'Page failed to load',
        `Error ${event.errorCode ?? ''}: ${event.errorDescription ?? 'The app could not be reached.'}`,
      ));
    });

    wv.addEventListener('render-process-gone', (event: Event & { reason?: string }) => {
      console.warn(`[DockviewWorkspace] Renderer process gone for ${appId}:`, event.reason);
      void wv.loadURL(buildCrashPage(
        'App crashed',
        'The renderer process for this app has stopped unexpectedly.',
      ));
    });

    pool.appendChild(wv);
    webviewPoolRef.current.set(appId, wv);
  }, [syncPositions]); // syncPositions stable; appsRef/preloadPathRef accessed via ref

  // Bind a slot div: show the webview over it and track resizes.
  const bindSlot = useCallback((appId: string, el: HTMLDivElement) => {
    slotMapRef.current.set(appId, el);
    createWebview(appId);

    const obs = new ResizeObserver(scheduleSyncPositions);
    obs.observe(el);
    slotObserverMapRef.current.set(appId, obs);
    scheduleSyncPositions();
  }, [createWebview, scheduleSyncPositions]);

  // Unbind a slot div: hide the webview but keep it loaded in the pool.
  const unbindSlot = useCallback((appId: string) => {
    slotMapRef.current.delete(appId);
    slotObserverMapRef.current.get(appId)?.disconnect();
    slotObserverMapRef.current.delete(appId);
    scheduleSyncPositions();
  }, [scheduleSyncPositions]);

  // Re-sync positions when the pool container itself is resized (window resize).
  useEffect(() => {
    const pool = poolContainerRef.current;
    if (!pool) return undefined;
    const obs = new ResizeObserver(scheduleSyncPositions);
    obs.observe(pool);
    return () => obs.disconnect();
  }, [scheduleSyncPositions]);

  // Hide/show all webviews immediately when the workspace becomes inactive/active.
  useEffect(() => {
    scheduleSyncPositions();
  }, [hidden, scheduleSyncPositions]);

  // Tear down all webviews when the workspace unmounts.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      for (const obs of slotObserverMapRef.current.values()) obs.disconnect();
      slotObserverMapRef.current.clear();
      for (const wv of webviewPoolRef.current.values()) wv.remove();
      webviewPoolRef.current.clear();
      readyIdsRef.current.clear();
    };
  }, []);

  // Disable webview pointer events during Dockview tab drag-and-drop and resize drags,
  // then restore. This prevents the webview GPU surfaces from swallowing drop events
  // and interrupting resize mousemove tracking.
  useEffect(() => {
    const blockPool = () => {
      poolBlockedRef.current = true;
      for (const wv of webviewPoolRef.current.values()) {
        (wv as HTMLElement).style.pointerEvents = 'none';
      }
    };
    const unblockPool = () => {
      poolBlockedRef.current = false;
      for (const [appId, wv] of webviewPoolRef.current) {
        (wv as HTMLElement).style.pointerEvents = slotMapRef.current.has(appId) ? 'auto' : 'none';
      }
    };

    // HTML5 drag: Dockview uses drag API to move tabs
    const onDragStart = () => blockPool();
    const onDragEnd = () => unblockPool();

    // Resize: only block when the exact sash handle is pressed, not on every click
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest('.sash')) blockPool();
    };
    const onMouseUp = () => unblockPool();

    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDragEnd);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDragEnd);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // If preloadPath arrives after some slots are already bound (e.g. detached window),
  // create the webviews now.
  useEffect(() => {
    if (!preloadPath) return;
    for (const [appId] of slotMapRef.current) {
      createWebview(appId);
    }
    scheduleSyncPositions();
  }, [preloadPath, createWebview, scheduleSyncPositions]);

  // Sync channel + theme to every ready webview whenever either changes.
  useEffect(() => {
    for (const [appId, wv] of webviewPoolRef.current) {
      if (readyIdsRef.current.has(appId)) {
        syncEmbeddedApp(wv, channelId, theme);
      }
    }
  }, [channelId, theme]);

  // Stable pool context — only changes if bind/unbind change (they don't).
  const poolContextValue = useMemo(
    () => ({ bindSlot, unbindSlot }),
    [bindSlot, unbindSlot],
  );

  // ─── Dockview layout management (unchanged logic) ───────────────────────

  const syncPanelTitles = useCallback((api: DockviewApi) => {
    for (const panel of api.panels) {
      const app = apps.find((entry) => entry.appId === panel.id);
      if (!app) continue;
      const p = panel as { api?: { setTitle?: (t: string) => void; updateParameters?: (p: Partial<AppPanelParams>) => void } };
      p.api?.setTitle?.(panelTitle(app));
      p.api?.updateParameters?.({ icon: app.icon, iconColor: app.iconColor });
    }
  }, [apps]);

  const syncDetachedTabTooltips = useCallback(() => {
    if (!detached || !rootRef.current) return;
    const tabs = rootRef.current.querySelectorAll<HTMLElement>('.dv-tab, .dockview-tab');
    tabs.forEach((tab) => {
      const label = tab.querySelector<HTMLElement>('.dv-tab-label, .dockview-tab-label');
      const labelText = label?.textContent?.trim();
      if (!labelText) return;
      tab.setAttribute('title', labelText);
      tab.setAttribute('aria-label', labelText);
    });
  }, [detached]);

  const syncOpenPanels = useCallback((api: DockviewApi) => {
    const knownIds = new Set(appsRef.current.map((app) => app.appId));
    const panelIds = api.panels.map((panel) => panel.id).filter((id) => knownIds.has(id));
    setOpenPanelIds(new Set(panelIds));
    onOpenPanelsChangeRef.current?.(panelIds);
  }, []); // stable — reads latest values from refs at call time

  const clearListeners = useCallback(() => {
    for (const disposable of listenersRef.current) disposable.dispose();
    listenersRef.current = [];
  }, []);

  const resolveInitialApps = useCallback((): AppEntry[] => {
    if (Array.isArray(initialPanelIds)) {
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
  }, [resolveInitialApps, preloadPath, channelId, theme, syncOpenPanels]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    dockApiRef.current = api;

    if (initialLayout) {
      try {
        api.fromJSON(initialLayout as never);
        syncPanelTitles(api);
      } catch {
        resetLayout();
      }
    } else {
      resetLayout();
    }

    clearListeners();
    listenersRef.current.push(api.onDidAddPanel(() => {
      syncOpenPanels(api);
      syncDetachedTabTooltips();
    }));
    listenersRef.current.push(api.onDidRemovePanel(() => {
      syncOpenPanels(api);
      syncDetachedTabTooltips();
    }));
    listenersRef.current.push(api.onDidLayoutFromJSON(() => {
      syncOpenPanels(api);
      syncPanelTitles(api);
      syncDetachedTabTooltips();
    }));
    listenersRef.current.push(api.onDidLayoutChange(() => {
      onLayoutChangeRef.current?.(api.toJSON());
      syncDetachedTabTooltips();
      scheduleSyncPositions();
    }));
    syncOpenPanels(api);
    syncDetachedTabTooltips();
  }, [clearListeners, initialLayout, resetLayout, scheduleSyncPositions, syncDetachedTabTooltips, syncOpenPanels, syncPanelTitles]);

  useEffect(() => clearListeners, [clearListeners]);

  // Stable ref so the resetKey effect always calls the latest resetLayout without
  // needing it in the effect deps (which would cause extra re-runs on prop changes).
  const resetLayoutRef = useRef(resetLayout);
  resetLayoutRef.current = resetLayout;

  // Force re-initialize this workspace (used when composing over an existing tab).
  useEffect(() => {
    if (resetKey === undefined) return;
    const api = dockApiRef.current;
    if (!api) return;
    resetLayoutRef.current();
    syncOpenPanels(api);
  }, [resetKey, syncOpenPanels]);

  // Push icon/iconColor updates to existing panels whenever apps definition changes.
  useEffect(() => {
    const api = dockApiRef.current;
    if (!api) return;
    syncPanelTitles(api);
  }, [apps, syncPanelTitles]);

  useEffect(() => {
    tabObserverRef.current?.disconnect();
    tabObserverRef.current = null;
    if (!detached || !rootRef.current) return;

    const observer = new MutationObserver(() => syncDetachedTabTooltips());
    observer.observe(rootRef.current, { childList: true, subtree: true });
    tabObserverRef.current = observer;
    syncDetachedTabTooltips();
    return () => {
      observer.disconnect();
      tabObserverRef.current = null;
    };
  }, [detached, syncDetachedTabTooltips]);

  useEffect(() => {
    if (didInitialAutoPopulateRef.current) return;
    if (apps.length === 0) return;
    if (Array.isArray(initialPanelIds) && initialPanelIds.length === 0) {
      didInitialAutoPopulateRef.current = true;
      return;
    }
    const api = dockApiRef.current;
    if (!api) return;
    if (api.panels.length === 0) resetLayout();
    didInitialAutoPopulateRef.current = true;
  }, [apps, initialPanelIds, resetLayout]);

  const addPanel = useCallback((app: AppEntry) => {
    const api = dockApiRef.current;
    if (!api) return;

    const existing = api.getPanel(app.appId);
    if (existing) {
      existing.focus();
      return;
    }

    api.addPanel<AppPanelParams>({
      id: app.appId,
      component: 'app-panel',
      title: panelTitle(app),
      params: {
        appId: app.appId,
        appUrl: resolveEmbeddedAppUrl(app),
        preloadPath,
        channelId,
        theme,
        icon: app.icon,
        iconColor: app.iconColor,
      },
    });

    if (!api.getPanel(app.appId)) {
      api.clear();
      populatePanels(api, [app], preloadPath, channelId, theme);
    }

    const added = api.getPanel(app.appId);
    if (added) {
      added.focus();
      syncDetachedTabTooltips();
      return;
    }

    console.warn('[DockviewWorkspace] Failed to add panel', app.appId);
  }, [channelId, preloadPath, syncDetachedTabTooltips, theme]);

  const removePanel = useCallback((appId: string) => {
    const api = dockApiRef.current;
    if (!api) return;
    const panel = api.getPanel(appId);
    if (panel) api.removePanel(panel);
  }, []);

  useImperativeHandle(ref, () => ({ addApp: addPanel, removeApp: removePanel }), [addPanel, removePanel]);

  const detachToDisplay = useCallback(async (display?: DisplayInfo) => {
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
      targetX: display ? display.workArea.x + 40 : undefined,
      targetY: display ? display.workArea.y + 40 : undefined,
    };
    try {
      await onDetachWorkspace(payload);
    } catch (err) {
      console.error('[DockviewWorkspace] detach failed:', err);
      return;
    }
    api.clear();
    syncOpenPanels(api);
  }, [channelId, onDetachWorkspace, openPanelIds, syncOpenPanels, theme, workspaceName]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      ref={rootRef}
      className={detached ? 'detached-workspace' : undefined}
      style={rootStyle}
      {...(headersVisible ? { 'data-edit-layout': '' } : {})}
    >
      {!detached && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
          <Button onClick={resetLayout} variant="outline" size="sm">
            Reset Layout
          </Button>
          {onDetachWorkspace && openPanelIds.size > 0 && (
            displays.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Detach to:</span>
                {displays.map((d, i) => (
                  <Button
                    key={d.id}
                    onClick={() => void detachToDisplay(d)}
                    title={`${d.bounds.width}×${d.bounds.height}  ·  ${d.isPrimary ? 'Primary display' : `Display ${i + 1}`}`}
                    variant={d.isPrimary ? 'default' : 'secondary'}
                    size="sm"
                  >
                    {d.isPrimary ? '▣' : '▢'} {d.isPrimary ? 'Primary' : `Display ${i + 1}`}
                  </Button>
                ))}
              </div>
            ) : (
              <Button onClick={() => void detachToDisplay()} size="sm" variant="outline" title="Detach this workspace as one window">
                Detach Workspace
              </Button>
            )
          )}
          {onAddApp && (
            <Button onClick={onAddApp} size="sm" variant="outline" className="gap-1">
              + Add App
            </Button>
          )}
          <div className="flex-1" />
          <span className="text-[11px] font-extrabold text-muted-foreground">
            {workspaceName ?? 'Workspace'}
          </span>
          <span className="text-[11px] text-muted-foreground/75">
            Single-window Dockview workspace
          </span>
        </div>
      )}

      {/* Dockview + persistent webview pool share the same space */}
      <div style={contentAreaStyle}>
        <OnAddAppContext.Provider value={onAddApp ?? null}>
          <CurrentChannelContext.Provider value={currentChannel}>
            <WebviewPoolContext.Provider value={poolContextValue}>
              <DockviewReact
                onReady={onReady}
                components={{ 'app-panel': AppPanelComponent }}
                defaultTabComponent={AppTabComponent}
                watermarkComponent={WorkspaceWatermark}
                className={`${THEMES[theme].dockview} h-full w-full`}
              />
            </WebviewPoolContext.Provider>
          </CurrentChannelContext.Provider>
        </OnAddAppContext.Provider>

        {/*
          Webview pool layer — sits above Dockview panel content but below its
          tab strips (which use position:relative z-index from dockview-override.css).
          pointer-events:none on the container lets Dockview chrome pass through;
          individual webviews restore pointer-events:auto only over their own rect.
        */}
        <div ref={poolContainerRef} style={poolLayerStyle} />
      </div>
    </div>
  );
});

const rootStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  minHeight: 0,
  width: '100%',
};

const contentAreaStyle: CSSProperties = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
};

const poolLayerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  // No explicit z-index — DOM order (after DockviewReact) is enough for
  // content-area stacking. Tab strips and resizers in dockview-override.css
  // use position:relative z-index:1 to stay above this layer.
};
