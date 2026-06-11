import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AppLauncher } from './components/AppLauncher.js';
import { ChannelBar } from './components/ChannelBar.js';
import { WorkspaceToolbar } from './components/WorkspaceToolbar.js';
import { ZoomControl } from './components/ZoomControl.js';
import { TopBar } from './components/TopBar.js';
import { NotificationsCenter } from './components/NotificationsCenter.js';
import { HotkeyHelp } from './components/HotkeyHelp.js';
import { IntentResolverDialog } from './components/IntentResolverDialog.js';
import { AppCatalog } from './components/AppCatalog.js';
import { DockviewWorkspace } from './components/DockviewWorkspace.js';
import type { DetachedWorkspacePayload, DisplayInfo, DockviewWorkspaceHandle } from './components/DockviewWorkspace.js';
import { ControlTower } from './components/ControlTower.js';
import { Bridge } from './components/Bridge.js';
import { Environments } from './components/Environments.js';
import { Badge } from './components/ui/badge.js';
import { Button } from './components/ui/button.js';
import { Card, CardContent } from './components/ui/card.js';
import { Input } from './components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select.js';
import { LayoutTemplate, Palette, RefreshCcw, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './components/ui/dropdown-menu.js';
import { cn, modShortcut } from './lib/utils.js';
import { InteropCopilot } from './copilot/InteropCopilot.js';
import { InteropFlowDesigner } from './interop-flow/components/InteropFlowDesigner.js';
import { ShellSidebar } from './components/ShellSidebar.js';
import { ContextInspector } from './components/ContextInspector.js';
import { WorkspaceDashboard } from './components/WorkspaceDashboard.js';
import { RbacPanel } from './components/RbacPanel.js';
import { AddAppsDialog } from './components/AddAppsDialog.js';
import { ShellMenu } from './components/ShellMenu.js';
import type { Fdc3Context, LayoutDefinition, UserChannel } from '@fdc3-poc/fdc3-core';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { FlowPolicy, ThemeName } from '@fdc3-poc/fdc3-core';

interface ShellChromeLayouts {
  list(): Promise<LayoutDefinition[]>;
  save(data: { name: string; description?: string; panelIds: string[]; dockviewLayout: unknown | null }): Promise<LayoutDefinition | null>;
  update(id: string, patch: { name?: string; description?: string }): Promise<LayoutDefinition | null>;
  delete(id: string): Promise<boolean>;
}

// window.fdc3 is injected by the preload script
declare global {
  interface Window {
    fdc3: {
      getAppList(): Promise<AppEntry[]>;
      getPreloadPath(): Promise<string>;
      open(app: { appId: string }): Promise<void>;
      getUserChannels(): Promise<UserChannel[]>;
      getCurrentChannel(): Promise<UserChannel | null>;
      joinUserChannel(channelId: string): Promise<void>;
      leaveCurrentChannel(): Promise<void>;
      saveWorkspace(name?: string): Promise<void>;
      openWorkspaceWindow(payload: DetachedWorkspacePayload): Promise<{ opened: boolean; id: string }>;
      getWorkspaceWindowPayload(workspaceWindowId: string): Promise<DetachedWorkspacePayload | null>;
      updateWorkspaceWindowPayload(payload: DetachedWorkspacePayload): Promise<boolean>;
      recallWorkspaceWindow(workspaceWindowId: string): Promise<boolean>;
      getTheme(): Promise<ThemeName>;
      setTheme(theme: ThemeName): Promise<ThemeName>;
      onThemeChanged(handler: (theme: ThemeName) => void): () => void;
      onWorkspaceWindowClosed(handler: (payload: DetachedWorkspacePayload) => void): () => void;
      addContextListener<T>(type: string | null, handler: (context: T) => void): () => void;
      onChannelChanged(handler: (ch: UserChannel | null) => void): () => void;
      broadcast(context: unknown): Promise<void>;
      setFlowPolicy(policy: FlowPolicy): Promise<void>;
      getDisplays(): Promise<DisplayInfo[]>;
    };
  }
}

export interface AppCapabilityConfig {
  autoWire?: boolean;
  broadcasts?: string[];
  listensTo?: string[];
  raisesIntents?: string[];
  handlesIntents?: string[];
}

export interface AppEntry {
  appId: string;
  title: string;
  description?: string;
  icon?: string;
  iconColor?: string;
  category?: string;
  url: string;
  devPort: number;
  capabilities?: AppCapabilityConfig;
  listensForContexts?: string[];
  intents?: Array<{ intent: string; contextTypes: string[] | null; appId?: string; displayName?: string }>;
}

type ThemeMode = ThemeName;
type SidebarPosition = 'left' | 'right' | 'bottom';
export type WorkspaceMode = 'launcher' | 'workspace' | 'dashboard' | 'layout-editor' | 'interop-flow' | 'control-tower' | 'inspector' | 'apps' | 'bridge' | 'environment' | 'rbac';

export interface WorkspaceState {
  channelId: string | null;
  theme: ThemeMode;
  layout: unknown | null;
}

function readSidebarPosition(storageKey: string): SidebarPosition {
  const value = window.localStorage.getItem(storageKey);
  return value === 'left' || value === 'bottom' ? value : 'right';
}

export interface WorkspaceTab {
  id: string;
  name: string;
  panelIds: string[];
}

interface ShellManifestView {
  appId: string;
  name: string;
  title: string;
  subtitle: string;
  provider: string;
  providerVersion: string;
  description?: string;
  branding?: { productMark?: string; accentColor?: string };
}

export interface SmartWorkspaceTemplate {
  id: string;
  name: string;
  channelId: string | null;
  panelIds: string[];
  seedContext?: Fdc3Context;
}

const WORKSPACE_STORAGE_KEY = 'fdc3.workspace-tabs.v5';
const LEGACY_WORKSPACE_STATE_STORAGE_KEY = 'fdc3.workspace-tabs.v4';
const ACTIVE_ENV_STORAGE_KEY = 'fdc3.active-env-id';

function workspaceStorageKey(envId?: string | null): string {
  return envId ? `fdc3.workspace-tabs.v5.${envId}` : WORKSPACE_STORAGE_KEY;
}

const DEFAULT_WORKSPACE_TABS: WorkspaceTab[] = [
  {
    id: 'trading-flow',
    name: 'Trading Flow',
    panelIds: ['incoming-orders', 'funds-allocations', 'audit-log'],
  },
  {
    id: 'market-view',
    name: 'Market View',
    panelIds: ['market-watch', 'customer-profile', 'portfolio-view'],
  },
];

const DEFAULT_WORKSPACE_STATES: Record<string, WorkspaceState> = {
  'trading-flow': { channelId: 'channel-5', theme: 'dark-financial', layout: null },
  'market-view': { channelId: null, theme: 'dark-financial', layout: null },
};

function validTheme(t: unknown): ThemeName {
  return (t != null && Object.prototype.hasOwnProperty.call(THEMES, t as string))
    ? (t as ThemeName)
    : 'dark-financial';
}

function uniquePanelIds(panelIds: string[]): string[] {
  return [...new Set(panelIds.filter((id) => typeof id === 'string' && id.length > 0))];
}

function readWorkspaceStore(envId?: string | null): {
  tabs: WorkspaceTab[];
  states: Record<string, WorkspaceState>;
  activeWorkspaceId: string;
  savedAt: number | null;
} {
  const defaults = {
    tabs: DEFAULT_WORKSPACE_TABS,
    states: DEFAULT_WORKSPACE_STATES,
    activeWorkspaceId: DEFAULT_WORKSPACE_TABS[0].id,
    savedAt: null as number | null,
  };

  try {
    const storageKey = workspaceStorageKey(envId);
    // Try env-namespaced key first, fall back to legacy shared key
    const raw = window.localStorage.getItem(storageKey)
      ?? (envId ? window.localStorage.getItem(WORKSPACE_STORAGE_KEY) : null);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        tabs?: Array<Partial<WorkspaceTab>>;
        states?: Record<string, Partial<WorkspaceState>>;
        activeWorkspaceId?: string;
        savedAt?: number;
      };

      const parsedTabs = (parsed.tabs ?? [])
        .map((tab) => {
          if (typeof tab.id !== 'string' || typeof tab.name !== 'string') return null;
          return {
            id: tab.id,
            name: tab.name,
            panelIds: uniquePanelIds(Array.isArray(tab.panelIds) ? tab.panelIds.filter((id): id is string => typeof id === 'string') : []),
          } satisfies WorkspaceTab;
        })
        .filter((tab): tab is WorkspaceTab => tab !== null);

      const tabs = parsedTabs.length > 0 ? parsedTabs : DEFAULT_WORKSPACE_TABS;
      const states: Record<string, WorkspaceState> = {};

      for (const tab of tabs) {
        const rawState = parsed.states?.[tab.id];
        states[tab.id] = {
          ...(DEFAULT_WORKSPACE_STATES[tab.id] ?? { channelId: null, theme: 'dark-financial' as ThemeName, layout: null }),
          ...rawState,
          theme: validTheme(rawState?.theme),
        };
      }

      const activeWorkspaceId = tabs.some((tab) => tab.id === parsed.activeWorkspaceId)
        ? (parsed.activeWorkspaceId as string)
        : tabs[0].id;

      return { tabs, states, activeWorkspaceId, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : null };
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_WORKSPACE_STATE_STORAGE_KEY);
    if (!legacyRaw) return defaults;

    const parsedLegacy = JSON.parse(legacyRaw) as Partial<Record<'trading-flow' | 'market-view', Partial<WorkspaceState>>>;
    return {
      tabs: DEFAULT_WORKSPACE_TABS,
      states: {
        'trading-flow': {
          ...DEFAULT_WORKSPACE_STATES['trading-flow'],
          ...parsedLegacy['trading-flow'],
          theme: validTheme(parsedLegacy['trading-flow']?.theme),
        },
        'market-view': {
          ...DEFAULT_WORKSPACE_STATES['market-view'],
          ...parsedLegacy['market-view'],
          theme: validTheme(parsedLegacy['market-view']?.theme),
        },
      },
      activeWorkspaceId: DEFAULT_WORKSPACE_TABS[0].id,
      savedAt: null,
    };
  } catch {
    return defaults;
  }
}

function RestoreBanner({ savedAt, onDismiss }: { savedAt: number; onDismiss: () => void }) {
  const time = new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = new Date(savedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const isToday = new Date(savedAt).toDateString() === new Date().toDateString();

  useEffect(() => {
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[color:var(--shell-positive)]/20 bg-[color:var(--shell-positive)]/8 px-4">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--shell-positive)]" />
      <span className="text-[11px] font-bold text-[color:var(--shell-positive)]">
        Session restored from {isToday ? time : `${date} ${time}`}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-auto text-[11px] font-bold text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}

export function App() {
  const initialWorkspaceStore = readWorkspaceStore(window.localStorage.getItem(ACTIVE_ENV_STORAGE_KEY));
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [preloadPath, setPreloadPath] = useState('');
  const [currentChannel, setCurrentChannel] = useState<UserChannel | null>(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(initialWorkspaceStore.savedAt);
  const [showRestoreBanner, setShowRestoreBanner] = useState<boolean>(initialWorkspaceStore.savedAt != null);
  const [activeMode, setActiveMode] = useState<WorkspaceMode>('workspace');
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    try { return window.localStorage.getItem('fdc3.shell.sidebar.expanded') === 'true'; }
    catch { return false; }
  });
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>(initialWorkspaceStore.tabs);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspaceStore.activeWorkspaceId);
  const [workspaceStates, setWorkspaceStates] = useState<Record<string, WorkspaceState>>(initialWorkspaceStore.states);
  const [globalTheme, setGlobalTheme] = useState<ThemeMode>('dark-financial');
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState('');
  const [openPanelIds, setOpenPanelIds] = useState<string[]>(
    initialWorkspaceStore.tabs.find((tab) => tab.id === initialWorkspaceStore.activeWorkspaceId)?.panelIds
    ?? initialWorkspaceStore.tabs[0]?.panelIds
    ?? [],
  );
  const [workspaceResetKeys, setWorkspaceResetKeys] = useState<Record<string, string>>({});
  const [detachedWorkspaces, setDetachedWorkspaces] = useState<Partial<Record<string, DetachedWorkspacePayload>>>({});
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [channels, setChannels] = useState<UserChannel[]>([]);
  const [lastBroadcast, setLastBroadcast] = useState<{ contextType: string; sourceAppId: string; ts: number } | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<'notifications' | 'channel' | null>(null);
  const [channelPanelPosition, setChannelPanelPosition] = useState<SidebarPosition>(() =>
    readSidebarPosition('fdc3.shell.channel-panel.position'));
  const [notificationsPanelPosition, setNotificationsPanelPosition] = useState<SidebarPosition>(() =>
    readSidebarPosition('fdc3.shell.notifications-panel.position'));
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [addAppsOpen, setAddAppsOpen] = useState(false);
  const [layouts, setLayouts] = useState<LayoutDefinition[]>([]);
  // Layout editor — ephemeral dockview instance for creating layouts from scratch
  const [layoutEditorPanelIds, setLayoutEditorPanelIds] = useState<string[]>([]);
  const [layoutEditorDockviewLayout, setLayoutEditorDockviewLayout] = useState<unknown | null>(null);
  const [layoutEditorResetKey, setLayoutEditorResetKey] = useState<number>(0);
  const layoutEditorRef = useRef<DockviewWorkspaceHandle>(null);
  // Stable ref for current workspace state — read by the env-changed event handler to avoid stale closures
  const workspaceSnapshotRef = useRef<{ tabs: WorkspaceTab[]; states: Record<string, WorkspaceState>; activeId: string } | null>(null);
  const dockviewRef = useRef<DockviewWorkspaceHandle>(null);
  const [shellManifest, setShellManifest] = useState<ShellManifestView | null>(null);
  const [activeEnv, setActiveEnv] = useState<{ id: string; name: string; color?: string } | null>(null);
  // Stable ref so handlers that must stay stable can still read the current active workspace.
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;

  const activeWorkspaceTab = workspaceTabs.find((tab) => tab.id === activeWorkspaceId) ?? workspaceTabs[0];
  workspaceSnapshotRef.current = { tabs: workspaceTabs, states: workspaceStates, activeId: activeWorkspaceTab.id };
  const activeWorkspaceState = workspaceStates[activeWorkspaceTab.id]
    ?? { channelId: null, theme: globalTheme, layout: null };
  const theme = globalTheme;
  const activeWorkspaceApps = apps.filter((app) => activeWorkspaceTab.panelIds.includes(app.appId));
  const interopWorkspaceAppIds = activeWorkspaceApps.map((app) => app.appId);
  const detachedWorkspaceId = new URLSearchParams(window.location.search).get('detachedWorkspaceId');
  const rightSidebarOpen = (
    (rightPanel === 'channel' && channelPanelPosition === 'right') ||
    (rightPanel === 'notifications' && notificationsPanelPosition === 'right')
  );

  useEffect(() => {
    try { window.localStorage.setItem('fdc3.shell.sidebar.expanded', String(sidebarExpanded)); }
    catch { /* ignore */ }
  }, [sidebarExpanded]);

  useEffect(() => {
    if (workspaceTabs.length === 0) {
      setWorkspaceTabs(DEFAULT_WORKSPACE_TABS);
      setActiveWorkspaceId(DEFAULT_WORKSPACE_TABS[0].id);
      return;
    }

    if (!workspaceTabs.some((tab) => tab.id === activeWorkspaceId)) {
      setActiveWorkspaceId(workspaceTabs[0].id);
    }
  }, [activeWorkspaceId, workspaceTabs]);

  useEffect(() => {
    if (!activeWorkspaceTab) return;
    setOpenPanelIds(activeWorkspaceTab.panelIds);
  }, [activeWorkspaceTab]);

  useEffect(() => {
    if (!window.fdc3) return;
    const refreshApps = (): void => {
      void window.fdc3.getAppList().then(setApps);
    };
    refreshApps();
    void window.fdc3.getPreloadPath().then(setPreloadPath);
    void window.fdc3.getCurrentChannel().then(setCurrentChannel);
    void window.fdc3.getUserChannels().then(setChannels);
    void window.fdc3.getDisplays().then(setDisplays);

    const fdc3Extended = window.fdc3 as typeof window.fdc3 & {
      onInteropActivity?: (handler: (e: { kind: string; contextType?: string; sourceAppId?: string; ts: number }) => void) => () => void;
    };
    const unsubActivity = fdc3Extended.onInteropActivity?.((e) => {
      if (e.kind === 'context.broadcasted' && e.contextType && e.sourceAppId) {
        setLastBroadcast({ contextType: e.contextType, sourceAppId: e.sourceAppId, ts: e.ts });
      }
    }) ?? (() => undefined);
    void window.fdc3.getTheme().then((nextTheme) => {
      setGlobalTheme(nextTheme);
      document.documentElement.dataset.theme = THEMES[nextTheme].dataTheme;
      window.localStorage.setItem('fdc3.desktop.theme', nextTheme);
    });
    const unsub = window.fdc3.onChannelChanged(setCurrentChannel);
    const shellFdc3 = window.fdc3 as typeof window.fdc3 & {
      onAppListChanged?: (handler: () => void) => () => void;
    };
    const unsubAppList = shellFdc3.onAppListChanged?.(refreshApps) ?? (() => undefined);
    const unsubTheme = window.fdc3.onThemeChanged((nextTheme) => {
      setGlobalTheme(nextTheme);
      document.documentElement.dataset.theme = THEMES[nextTheme].dataTheme;
      window.localStorage.setItem('fdc3.desktop.theme', nextTheme);
      setWorkspaceStates((prev) => {
        const next: Record<string, WorkspaceState> = {};
        for (const [workspaceId, state] of Object.entries(prev)) {
          next[workspaceId] = { ...state, theme: nextTheme };
        }
        return next;
      });
      setDetachedWorkspaces((prev) => {
        const next: Partial<Record<string, DetachedWorkspacePayload>> = {};
        for (const [workspaceId, payload] of Object.entries(prev)) {
          if (!payload) continue;
          next[workspaceId] = { ...payload, theme: nextTheme };
        }
        return next;
      });
    });
    return () => {
      unsub();
      unsubAppList();
      unsubTheme();
      unsubActivity();
    };
  }, []);

  useEffect(() => {
    const api = (window as unknown as {
      shellChrome?: { getManifest?: () => Promise<ShellManifestView> };
    }).shellChrome;
    if (!api?.getManifest) return;
    void api.getManifest()
      .then((manifest) => setShellManifest(manifest))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const chrome = (window as unknown as { shellChrome?: { layouts?: ShellChromeLayouts } }).shellChrome;
    if (!chrome?.layouts) return;
    void chrome.layouts.list().then(setLayouts).catch(() => undefined);
  }, []);

  useEffect(() => {
    const chrome = (window as unknown as { shellChrome?: { environment?: {
      list(): Promise<Array<{ id: string; name: string; color?: string }>>;
      getActiveId(): Promise<string | null>;
    } } }).shellChrome;
    if (!chrome?.environment) return;
    void Promise.all([chrome.environment.list(), chrome.environment.getActiveId()]).then(([list, activeId]) => {
      const found = activeId ? list.find((e) => e.id === activeId) ?? null : null;
      setActiveEnv(found);
    });

    const onEnvChanged = (e: Event) => {
      const { id, name, color } = (e as CustomEvent<{ id: string; name: string; color?: string }>).detail;
      // Save current workspace under the OLD env key before switching (use ref for current values)
      const snap = workspaceSnapshotRef.current;
      const prevEnvId = window.localStorage.getItem(ACTIVE_ENV_STORAGE_KEY);
      if (snap) {
        window.localStorage.setItem(workspaceStorageKey(prevEnvId), JSON.stringify({
          tabs: snap.tabs,
          states: snap.states,
          activeWorkspaceId: snap.activeId,
          savedAt: Date.now(),
        }));
      }
      // Store new env id and load its workspace
      window.localStorage.setItem(ACTIVE_ENV_STORAGE_KEY, id);
      setActiveEnv({ id, name, color });
      const next = readWorkspaceStore(id);
      setWorkspaceTabs(next.tabs);
      setWorkspaceStates(next.states);
      setActiveWorkspaceId(next.activeWorkspaceId);
    };
    window.addEventListener('fdc3-env-changed', onEnvChanged);
    return () => window.removeEventListener('fdc3-env-changed', onEnvChanged);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = THEMES[theme].dataTheme;
    window.localStorage.setItem('fdc3.desktop.theme', theme);
  }, [theme]);

  // Keep a stable ref so the hotkey handler always calls the latest handleSave
  // without being listed as a dep (handleSave is declared below this effect).
  const handleSaveRef = useRef<() => Promise<void>>(async () => undefined);

  // Shell-level hotkeys. Renderer-scoped by design: this handles shell
  // navigation and overlays without registering OS-global shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      const modeByKey: Partial<Record<string, WorkspaceMode>> = {
        '1': 'workspace',
        '2': 'interop-flow',
        '3': 'control-tower',
        '4': 'apps',
        '5': 'bridge',
        '6': 'inspector',
        '0': 'launcher',
      };
      const mode = modeByKey[key];
      if (mode) {
        event.preventDefault();
        setActiveMode(mode);
        return;
      }
      if (key === 'k') {
        event.preventDefault();
        setCopilotOpen((prev) => !prev);
        return;
      }
      if (key === 'b') {
        event.preventDefault();
        setRightPanel((prev) => prev === 'notifications' ? null : 'notifications');
        return;
      }
      if (key === 's') {
        event.preventDefault();
        void handleSaveRef.current();
        return;
      }
      if (key === '/' || event.code === 'Slash') {
        event.preventDefault();
        setHotkeysOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const ts = Date.now();
    window.localStorage.setItem(workspaceStorageKey(window.localStorage.getItem(ACTIVE_ENV_STORAGE_KEY)), JSON.stringify({
      tabs: workspaceTabs,
      states: workspaceStates,
      activeWorkspaceId: activeWorkspaceTab.id,
      savedAt: ts,
    }));
    setLastSavedAt(ts);
  }, [activeWorkspaceTab.id, workspaceStates, workspaceTabs]);

  useEffect(() => {
    if (!window.fdc3) return;
    const desiredChannelId = activeWorkspaceState.channelId;
    // Sync the ChannelBar immediately from the known channels list — don't wait for the FDC3 event
    setCurrentChannel(channels.find((c) => c.id === desiredChannelId) ?? null);
    if (desiredChannelId) {
      void window.fdc3.joinUserChannel(desiredChannelId);
      return;
    }
    void window.fdc3.leaveCurrentChannel();
  }, [activeWorkspaceState.channelId, activeWorkspaceId, channels]);

  const handleOpen = useCallback(async (appId: string) => {
    await window.fdc3.open({ appId });
  }, []);

  const handleSave = useCallback(async () => {
    const ts = Date.now();
    window.localStorage.setItem(workspaceStorageKey(window.localStorage.getItem(ACTIVE_ENV_STORAGE_KEY)), JSON.stringify({
      tabs: workspaceTabs,
      states: workspaceStates,
      activeWorkspaceId: activeWorkspaceTab.id,
      savedAt: ts,
    }));
    setLastSavedAt(ts);
    setSaveStatus('Workspace saved');
    setTimeout(() => setSaveStatus(''), 2000);
  }, [activeWorkspaceTab.id, workspaceStates, workspaceTabs]);
  handleSaveRef.current = handleSave;

  const handleThemeChange = useCallback(async (nextTheme: ThemeMode) => {
    const appliedTheme = await window.fdc3.setTheme(nextTheme);
    setGlobalTheme(appliedTheme);
    setWorkspaceStates((prev) => {
      const next: Record<string, WorkspaceState> = {};
      for (const [workspaceId, state] of Object.entries(prev)) {
        next[workspaceId] = { ...state, theme: appliedTheme };
      }
      return next;
    });

    setDetachedWorkspaces((prev) => {
      const next: Partial<Record<string, DetachedWorkspacePayload>> = {};
      for (const [workspaceId, payload] of Object.entries(prev)) {
        if (!payload) continue;
        const nextPayload = { ...payload, theme: appliedTheme };
        next[workspaceId] = nextPayload;
        void window.fdc3.updateWorkspaceWindowPayload(nextPayload);
      }
      return next;
    });

    if (window.fdc3) {
      await window.fdc3.broadcast({
        type: 'com.demo.theme',
        name: THEMES[appliedTheme].label,
        theme: appliedTheme,
      });
    }
  }, []);

  const handleChannelChange = useCallback((channel: UserChannel | null) => {
    setCurrentChannel(channel);
    setWorkspaceStates((prev) => ({
      ...prev,
      [activeWorkspaceId]: {
        ...prev[activeWorkspaceId],
        channelId: channel?.id ?? null,
      },
    }));
  }, [activeWorkspaceId]);

  const handleLayoutChange = useCallback((workspaceId: string, layout: unknown) => {
    setWorkspaceStates((prev) => ({
      ...prev,
      [workspaceId]: {
        ...prev[workspaceId],
        layout,
      },
    }));
  }, []);

  const handleOpenPanelsChange = useCallback((workspaceId: string, panelIds: string[]) => {
    const nextPanelIds = uniquePanelIds(panelIds);
    setWorkspaceTabs((prev) => prev.map((tab) => (
      tab.id === workspaceId
        ? { ...tab, panelIds: nextPanelIds }
        : tab
    )));
    if (workspaceId === activeWorkspaceIdRef.current) {
      setOpenPanelIds(nextPanelIds);
    }
  }, []);

  const handleDetachWorkspace = useCallback(async (payload: DetachedWorkspacePayload) => {
    const nextPayload = {
      ...payload,
      sourceWorkspaceId: activeWorkspaceId,
    };
    await window.fdc3.openWorkspaceWindow(nextPayload);
    setDetachedWorkspaces((prev) => ({
      ...prev,
      [activeWorkspaceId]: nextPayload,
    }));
  }, [activeWorkspaceId]);

  const handleRecallWorkspace = useCallback(async (workspaceId: string) => {
    const detached = detachedWorkspaces[workspaceId];
    if (!detached) return;
    await window.fdc3.recallWorkspaceWindow(detached.id);
  }, [detachedWorkspaces]);

  const handleAddWorkspace = useCallback(() => {
    const nextId = `workspace-${Date.now().toString(36)}`;
    const nextName = `Workspace ${workspaceTabs.length + 1}`;
    const panelIds: string[] = [];

    setWorkspaceTabs((prev) => ([
      ...prev,
      { id: nextId, name: nextName, panelIds },
    ]));
    setWorkspaceStates((prev) => ({
      ...prev,
      [nextId]: {
        channelId: activeWorkspaceState.channelId,
        theme: activeWorkspaceState.theme,
        layout: null,
      },
    }));
    setActiveWorkspaceId(nextId);
    setActiveMode('workspace');
    setOpenPanelIds(panelIds);
  }, [activeWorkspaceState.channelId, activeWorkspaceState.theme, workspaceTabs.length]);

  const handleSaveAsLayout = useCallback(async (name: string, description: string, panelIds: string[], dockviewLayout: unknown | null) => {
    const chrome = (window as unknown as { shellChrome?: { layouts?: ShellChromeLayouts } }).shellChrome;
    if (!chrome?.layouts) return;
    const saved = await chrome.layouts.save({ name, description: description || undefined, panelIds, dockviewLayout }).catch(() => null);
    if (saved) setLayouts((prev) => [...prev, saved]);
  }, []);

  const handleSaveCurrentAsLayout = useCallback(async (name: string, description: string) => {
    const snap = workspaceSnapshotRef.current;
    if (!snap) return;
    const activeTab = snap.tabs.find((t) => t.id === snap.activeId) ?? snap.tabs[0];
    if (!activeTab) return;
    const dockviewLayout = snap.states[activeTab.id]?.layout ?? null;
    await handleSaveAsLayout(name, description, activeTab.panelIds, dockviewLayout);
  }, [handleSaveAsLayout]);

  const handleEnterLayoutEditor = useCallback(() => {
    setLayoutEditorPanelIds([]);
    setLayoutEditorDockviewLayout(null);
    setLayoutEditorResetKey(Date.now());
    setActiveMode('layout-editor');
  }, []);

  const handleSaveFromLayoutEditor = useCallback(async (name: string, description: string) => {
    await handleSaveAsLayout(name, description, layoutEditorPanelIds, layoutEditorDockviewLayout);
    setActiveMode('dashboard');
    setLayoutEditorPanelIds([]);
    setLayoutEditorDockviewLayout(null);
  }, [handleSaveAsLayout, layoutEditorDockviewLayout, layoutEditorPanelIds]);

  const handleCancelLayoutEditor = useCallback(() => {
    setActiveMode('dashboard');
    setLayoutEditorPanelIds([]);
    setLayoutEditorDockviewLayout(null);
  }, []);

  const handleNewFromLayout = useCallback((layout: LayoutDefinition) => {
    const nextId = `workspace-${Date.now().toString(36)}`;
    const panelIds = [...layout.panelIds];
    setWorkspaceTabs((prev) => ([...prev, { id: nextId, name: layout.name, panelIds }]));
    setWorkspaceStates((prev) => ({
      ...prev,
      [nextId]: { channelId: null, theme: activeWorkspaceState.theme, layout: layout.dockviewLayout },
    }));
    setActiveWorkspaceId(nextId);
    setActiveMode('workspace');
    setOpenPanelIds(panelIds);
    setWorkspaceResetKeys((prev) => ({ ...prev, [nextId]: Date.now().toString() }));
  }, [activeWorkspaceState.theme]);

const handleDeleteLayout = useCallback(async (id: string) => {
    const chrome = (window as unknown as { shellChrome?: { layouts?: ShellChromeLayouts } }).shellChrome;
    if (!chrome?.layouts) return;
    const ok = await chrome.layouts.delete(id).catch(() => false);
    if (ok) setLayouts((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const handleComposeWorkspace = useCallback(async (template: SmartWorkspaceTemplate) => {
    const existing = workspaceTabs.find((tab) => tab.id === template.id);
    if (existing) {
      setWorkspaceTabs((prev) => prev.map((tab) => (
        tab.id === template.id
          ? { ...tab, name: template.name, panelIds: uniquePanelIds(template.panelIds) }
          : tab
      )));
    } else {
      setWorkspaceTabs((prev) => ([
        ...prev,
        { id: template.id, name: template.name, panelIds: uniquePanelIds(template.panelIds) },
      ]));
    }

    setWorkspaceStates((prev) => ({
      ...prev,
      [template.id]: {
        channelId: template.channelId,
        theme,
        layout: null,
      },
    }));
    setActiveWorkspaceId(template.id);
    setActiveMode('workspace');
    setOpenPanelIds(uniquePanelIds(template.panelIds));
    setWorkspaceResetKeys((prev) => ({ ...prev, [template.id]: Date.now().toString() }));

    if (template.channelId) {
      await window.fdc3.joinUserChannel(template.channelId);
    } else {
      await window.fdc3.leaveCurrentChannel();
    }

    if (template.seedContext) {
      await window.fdc3.broadcast(template.seedContext);
    }
  }, [theme, workspaceTabs]);

  const commitWorkspaceRename = useCallback((workspaceId: string) => {
    const trimmed = editingWorkspaceName.trim();
    setWorkspaceTabs((prev) => prev.map((tab) => (
      tab.id === workspaceId
        ? { ...tab, name: trimmed || tab.name }
        : tab
    )));
    setEditingWorkspaceId(null);
    setEditingWorkspaceName('');
  }, [editingWorkspaceName]);

  const cancelWorkspaceRename = useCallback(() => {
    setEditingWorkspaceId(null);
    setEditingWorkspaceName('');
  }, []);

  const handleWorkspaceRenameStart = useCallback((workspaceId: string, currentName: string) => {
    setEditingWorkspaceId(workspaceId);
    setEditingWorkspaceName(currentName);
  }, []);

  const handleDuplicateWorkspace = useCallback((workspaceId: string) => {
    const source = workspaceTabs.find((tab) => tab.id === workspaceId);
    if (!source) return;
    const nextId = `workspace-${Date.now().toString(36)}`;
    const nextName = `${source.name} (copy)`;
    const panelIds = [...source.panelIds];
    const sourceState = workspaceStates[workspaceId] ?? { channelId: null, theme: globalTheme, layout: null };

    setWorkspaceTabs((prev) => ([
      ...prev,
      { id: nextId, name: nextName, panelIds },
    ]));
    setWorkspaceStates((prev) => ({
      ...prev,
      [nextId]: { ...sourceState, layout: null },
    }));
    setActiveWorkspaceId(nextId);
    setActiveMode('workspace');
    setOpenPanelIds(panelIds);
  }, [globalTheme, workspaceTabs, workspaceStates]);

  const handleCloseWorkspace = useCallback((workspaceId: string) => {
    setWorkspaceTabs((prev) => {
      if (prev.length <= 1) return prev;

      const closingIndex = prev.findIndex((tab) => tab.id === workspaceId);
      if (closingIndex === -1) return prev;

      const nextTabs = prev.filter((tab) => tab.id !== workspaceId);

      setWorkspaceStates((current) => {
        const next = { ...current };
        delete next[workspaceId];
        return next;
      });

      setDetachedWorkspaces((current) => {
        const next = { ...current };
        delete next[workspaceId];
        return next;
      });

      if (activeWorkspaceId === workspaceId) {
        const fallback = nextTabs[Math.min(closingIndex, nextTabs.length - 1)]?.id ?? nextTabs[0].id;
        setActiveWorkspaceId(fallback);
      }

      return nextTabs;
    });
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!window.fdc3 || detachedWorkspaceId) return;
    return window.fdc3.onWorkspaceWindowClosed((payload) => {
      const workspaceId = payload.sourceWorkspaceId ?? activeWorkspaceTab.id;

      setWorkspaceTabs((prev) => {
        const existing = prev.find((tab) => tab.id === workspaceId);
        if (existing) {
          return prev.map((tab) => (
            tab.id === workspaceId
              ? { ...tab, panelIds: payload.panelIds }
              : tab
          ));
        }
        return [
          ...prev,
          {
            id: workspaceId,
            name: payload.name,
            panelIds: payload.panelIds,
          },
        ];
      });
      setActiveMode('workspace');
      setActiveWorkspaceId(workspaceId);
      setWorkspaceStates((prev) => ({
        ...prev,
        [workspaceId]: {
          ...prev[workspaceId],
          channelId: payload.channelId,
          layout: payload.layout,
          theme: payload.theme,
        },
      }));
      setDetachedWorkspaces((prev) => {
        const next = { ...prev };
        delete next[workspaceId];
        return next;
      });
      setOpenPanelIds(payload.panelIds);
    });
  }, [activeWorkspaceTab.id, detachedWorkspaceId]);

  if (detachedWorkspaceId) {
    return (
      <DetachedWorkspaceShell
        apps={apps}
        preloadPath={preloadPath}
        workspaceId={detachedWorkspaceId}
      />
    );
  }

  return (
    <div
      className="flex h-screen flex-col bg-background text-foreground"
    >
      <TopBar
        title={shellManifest?.title ?? 'FDC3 Desktop Shell'}
        subtitle={shellManifest?.subtitle ?? 'TRADER WORKSTATION'}
        sidebarOpen={sidebarExpanded}
        onSidebarToggle={() => setSidebarExpanded((v) => !v)}
        center={activeEnv ? (
          <div className="flex items-center gap-1.5 rounded-full border bg-card/80 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground backdrop-blur-sm">
            <div className="size-2 rounded-full" style={{ background: activeEnv.color ?? '#888' }} />
            {activeEnv.name.toUpperCase()}
          </div>
        ) : undefined}
        actions={
          <>
            <Button
              onClick={() => setCopilotOpen(true)}
              title={`Ask the Desktop (${modShortcut('K')}) — natural-language FDC3 orchestration`}
              size="sm"
              type="button"
            >
              ✦ Ask
              <span className="text-[10px] font-semibold opacity-60">{modShortcut('K')}</span>
            </Button>
            <ChannelBar
              currentChannel={currentChannel}
              onChannelChange={handleChannelChange}
              open={rightPanel === 'channel'}
              onOpenChange={(v) => setRightPanel(v ? 'channel' : null)}
              onPositionChange={setChannelPanelPosition}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Change theme"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Palette className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Theme</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {Object.entries(THEMES).map(([key, cfg]) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => void handleThemeChange(key as ThemeName)}
                    className={cn('gap-2', theme === key && 'font-black text-foreground')}
                  >
                    {theme === key && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    {cfg.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationsCenter
              open={rightPanel === 'notifications'}
              onOpenChange={(v) => setRightPanel(v ? 'notifications' : null)}
              onPositionChange={setNotificationsPanelPosition}
              rightSidebarOpen={rightSidebarOpen}
            />
            <ShellMenu
              theme={theme}
              onThemeChange={(t) => void handleThemeChange(t)}
              onOpenHotkeys={() => setHotkeysOpen(true)}
            />
          </>
        }
      />

      {showRestoreBanner && initialWorkspaceStore.savedAt && (
        <RestoreBanner savedAt={initialWorkspaceStore.savedAt} onDismiss={() => setShowRestoreBanner(false)} />
      )}

      {/* Workspace tab bar */}
      <div className="flex h-10 shrink-0 items-stretch border-b">
        <div className="flex min-w-0 items-stretch overflow-x-auto scrollbar-thin">
          {workspaceTabs.map((tab) => {
            const tabChannelId = workspaceStates[tab.id]?.channelId ?? null;
            const tabChannel = channels.find((c) => c.id === tabChannelId) ?? null;
            return (
              <WorkspaceTabButton
                key={tab.id}
                active={activeWorkspaceTab.id === tab.id}
                onClick={() => { setActiveWorkspaceId(tab.id); setActiveMode('workspace'); }}
                onDoubleClick={() => handleWorkspaceRenameStart(tab.id, tab.name)}
                onClose={workspaceTabs.length > 1 ? () => handleCloseWorkspace(tab.id) : undefined}
                editing={editingWorkspaceId === tab.id}
                editingValue={editingWorkspaceName}
                onEditingChange={setEditingWorkspaceName}
                onEditingCommit={() => commitWorkspaceRename(tab.id)}
                onEditingCancel={cancelWorkspaceRename}
                channelColor={tabChannel?.displayMetadata.color ?? null}
                channelName={tabChannel?.displayMetadata.name ?? null}
                panelCount={tab.panelIds.length}
              >
                {tab.name}
              </WorkspaceTabButton>
            );
          })}
          <button
            onClick={handleAddWorkspace}
            title="Add workspace"
            type="button"
            className="flex items-center border-r px-3 text-base text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ShellSidebar
          activeMode={activeMode}
          onModeChange={setActiveMode}
          expanded={sidebarExpanded}
          onToggleExpanded={() => setSidebarExpanded((v) => !v)}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
            {activeMode === 'workspace' ? (
              apps.length > 0 && preloadPath ? (
                <>
                  {workspaceTabs.map((tab) => {
                    const tabState = workspaceStates[tab.id] ?? { channelId: null, theme: globalTheme, layout: null };
                    const isActive = tab.id === activeWorkspaceTab.id;
                    const tabDetached = detachedWorkspaces[tab.id];

                    if (tabDetached) {
                      return isActive ? (
                        <DetachedWorkspacePlaceholder
                          key={tab.id}
                          workspaceName={tab.name}
                          panelCount={tabDetached.panelIds.length}
                          onRecall={() => void handleRecallWorkspace(tab.id)}
                        />
                      ) : null;
                    }

                    return (
                      <div
                        key={tab.id}
                        className="flex min-h-0 flex-1 flex-col overflow-hidden"
                        style={{ display: isActive ? '' : 'none' }}
                      >
                        <DockviewWorkspace
                          ref={isActive ? dockviewRef : null}
                          hidden={!isActive}
                          resetKey={workspaceResetKeys[tab.id]}
                          apps={apps}
                          currentChannel={currentChannel}
                          channelId={tabState.channelId}
                          preloadPath={preloadPath}
                          initialPanelIds={tab.panelIds}
                          initialLayout={tabState.layout}
                          onLayoutChange={(layout) => handleLayoutChange(tab.id, layout)}
                          onOpenPanelsChange={(panelIds) => handleOpenPanelsChange(tab.id, panelIds)}
                          onDetachWorkspace={handleDetachWorkspace}
                          onAddApp={() => setAddAppsOpen(true)}
                          workspaceName={tab.name}
                          theme={theme}
                          displays={displays}
                          onSave={handleSave}
                          saveStatus={saveStatus}
                          lastSavedAt={lastSavedAt}
                          onSaveAsLayout={(name, desc) => void handleSaveCurrentAsLayout(name, desc)}
                        />
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-xs tracking-wide text-muted-foreground">
                  Connecting to FDC3 bus…
                </div>
              )
            ) : activeMode === 'dashboard' ? (
              <WorkspaceDashboard
                workspaceTabs={workspaceTabs}
                workspaceStates={workspaceStates}
                activeWorkspaceId={activeWorkspaceId}
                apps={apps}
                onSwitch={(id) => {
                  setActiveWorkspaceId(id);
                  setActiveMode('workspace');
                }}
                onDuplicate={handleDuplicateWorkspace}
                onDelete={handleCloseWorkspace}
                onAdd={handleAddWorkspace}
                onFromScratch={handleEnterLayoutEditor}
                layouts={layouts}
                onSaveAsLayout={(name, desc, panelIds, layout) => void handleSaveAsLayout(name, desc, panelIds, layout)}
                onNewFromLayout={handleNewFromLayout}
                onDeleteLayout={(id) => void handleDeleteLayout(id)}
              />
            ) : activeMode === 'layout-editor' ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
                <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs">
                  <LayoutTemplate className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-bold text-muted-foreground uppercase tracking-wide">Layout Editor</span>
                  <span className="flex-1 text-muted-foreground">Add apps and arrange panels, then save as a layout.</span>
                  <button
                    type="button"
                    onClick={handleCancelLayoutEditor}
                    className="text-muted-foreground hover:text-foreground"
                    title="Cancel — discard this layout"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                {preloadPath && (
                  <DockviewWorkspace
                    ref={layoutEditorRef}
                    resetKey={layoutEditorResetKey}
                    apps={apps}
                    currentChannel={null}
                    channelId={null}
                    preloadPath={preloadPath}
                    initialPanelIds={[]}
                    initialLayout={null}
                    onLayoutChange={setLayoutEditorDockviewLayout}
                    onOpenPanelsChange={setLayoutEditorPanelIds}
                    onAddApp={() => setAddAppsOpen(true)}
                    theme={theme}
                    onSaveAsLayout={(name, desc) => void handleSaveFromLayoutEditor(name, desc)}
                  />
                )}
              </div>
            ) : activeMode === 'interop-flow' ? (
              <InteropFlowDesigner
                apps={activeWorkspaceApps}
                workspaceTabId={activeWorkspaceTab.id}
                workspaceName={activeWorkspaceTab.name}
                theme={theme}
                appIds={interopWorkspaceAppIds}
              />
            ) : activeMode === 'control-tower' ? (
              <ControlTower
                apps={apps}
                currentChannel={currentChannel}
                onOpen={handleOpen}
                onComposeWorkspace={handleComposeWorkspace}
              />
            ) : activeMode === 'inspector' ? (
              <ContextInspector />
            ) : activeMode === 'apps' ? (
              <AppCatalog apps={apps} onAppsChanged={setApps} />
            ) : activeMode === 'bridge' ? (
              <Bridge />
            ) : activeMode === 'environment' ? (
              <Environments />
            ) : activeMode === 'rbac' ? (
              <RbacPanel apps={apps} />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto scrollbar-thin">
                <div className="flex flex-col gap-1">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Application Launcher
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Click an app to open it in a new window. All apps share the same FDC3 channel.
                  </p>
                </div>
                <AppLauncher apps={apps} onOpen={handleOpen} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex h-7 shrink-0 items-center gap-4 border-t bg-card px-4">
        <StatusItem label="Workspace" value={activeWorkspaceTab.name} color="#91b4ff" />
        <StatusItem
          label="Channel"
          value={currentChannel?.displayMetadata.name ?? 'None'}
          color={currentChannel?.displayMetadata.color ?? '#555'}
        />
        <StatusItem label="Panels" value={String(openPanelIds.length)} color="var(--shell-positive)" />
        {lastBroadcast && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-[color:var(--shell-accent)]" />
            <span className="text-[color:var(--shell-subtle)]">📡</span>
            <span className="font-semibold text-[color:var(--shell-accent)]">{lastBroadcast.contextType}</span>
            <span className="text-muted-foreground/60">from</span>
            <span className="font-semibold text-muted-foreground">{lastBroadcast.sourceAppId}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--shell-positive)]" />
          <span className="text-[11px] text-muted-foreground/50">FDC3 · Electron</span>
        </div>
      </div>

      <InteropCopilot
        apps={apps}
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        currentChannelId={currentChannel?.id ?? null}
      />
      <HotkeyHelp open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
      <IntentResolverDialog apps={apps} />
      <AddAppsDialog
        open={addAppsOpen}
        onClose={() => setAddAppsOpen(false)}
        apps={apps}
        currentWorkspaceAppIds={activeMode === 'layout-editor' ? layoutEditorPanelIds : activeWorkspaceTab.panelIds}
        onAddToWorkspace={(appId) => {
          const app = apps.find((a) => a.appId === appId);
          if (!app) return;
          if (activeMode === 'layout-editor') {
            layoutEditorRef.current?.addApp(app);
          } else {
            dockviewRef.current?.addApp(app);
          }
        }}
        onRemoveFromWorkspace={(appId) => {
          if (activeMode === 'layout-editor') {
            layoutEditorRef.current?.removeApp(appId);
          } else {
            dockviewRef.current?.removeApp(appId);
          }
        }}
      />
    </div>
  );
}

function DetachedWorkspaceShell({
  apps,
  preloadPath,
  workspaceId,
}: {
  apps: AppEntry[];
  preloadPath: string;
  workspaceId: string;
}) {
  const [payload, setPayload] = useState<DetachedWorkspacePayload | null>(null);
  const [currentChannel, setCurrentChannel] = useState<UserChannel | null>(null);
  const [editLayout, setEditLayout] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const wsRef = useRef<DockviewWorkspaceHandle | null>(null);

  useEffect(() => {
    if (!window.fdc3) return;
    void window.fdc3.getWorkspaceWindowPayload(workspaceId).then((nextPayload) => {
      setPayload(nextPayload);
      if (nextPayload) {
        document.documentElement.dataset.theme = THEMES[nextPayload.theme].dataTheme;
        void window.fdc3.broadcast({
          type: 'com.demo.theme',
          name: THEMES[nextPayload.theme].label,
          theme: nextPayload.theme,
        });
        if (nextPayload.channelId) void window.fdc3.joinUserChannel(nextPayload.channelId);
      }
    });
    void window.fdc3.getCurrentChannel().then(setCurrentChannel);
    const unsub = window.fdc3.onChannelChanged(setCurrentChannel);
    return unsub;
  }, [workspaceId]);

  useEffect(() => {
    if (!window.fdc3) return;
    void window.fdc3.getTheme().then((theme) => {
      setPayload((current) => {
        if (!current || current.theme === theme) return current;
        const next = { ...current, theme };
        document.documentElement.dataset.theme = THEMES[theme].dataTheme;
        void window.fdc3.updateWorkspaceWindowPayload(next);
        return next;
      });
    });
    const unsubTheme = window.fdc3.onThemeChanged((theme) => {
      setPayload((current) => {
        if (!current || current.theme === theme) return current;
        const next = { ...current, theme };
        document.documentElement.dataset.theme = THEMES[theme].dataTheme;
        void window.fdc3.updateWorkspaceWindowPayload(next);
        return next;
      });
    });
    return unsubTheme;
  }, []);

  const handleDetachedLayoutChange = useCallback((layout: unknown) => {
    setPayload((current) => {
      if (!current) return current;
      const next = { ...current, layout };
      void window.fdc3.updateWorkspaceWindowPayload(next);
      return next;
    });
  }, []);

  const handleDetachedThemeChange = useCallback(async (nextTheme: ThemeName) => {
    const appliedTheme = await window.fdc3.setTheme(nextTheme);
    document.documentElement.dataset.theme = THEMES[appliedTheme].dataTheme;
    setPayload((current) => {
      if (!current) return current;
      const next = { ...current, theme: appliedTheme };
      void window.fdc3.updateWorkspaceWindowPayload(next);
      return next;
    });
    await window.fdc3.broadcast({
      type: 'com.demo.theme',
      name: THEMES[appliedTheme].label,
      theme: appliedTheme,
    });
  }, []);

  const handleDetachedSave = useCallback(async () => {
    if (!payload) return;
    await window.fdc3.updateWorkspaceWindowPayload(payload);
    await window.fdc3.saveWorkspace(payload.name);
    setSaveStatus('Workspace saved');
    window.setTimeout(() => setSaveStatus(''), 2000);
  }, [payload]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar
        title={payload?.name ?? 'Detached Workspace'}
        subtitle="DETACHED WORKSPACE"
        mark={
          <Badge variant="outline" className="h-[18px] w-[22px] justify-center rounded px-0 text-[9px] font-black">
            WS
          </Badge>
        }
        leftActions={
          <>
            <Button
              onClick={() => setEditLayout((v) => !v)}
              title={editLayout ? 'Lock layout — hide panel headers' : 'Edit layout — show panel headers to drag and rearrange panels'}
              variant={editLayout ? 'default' : 'secondary'}
              size="sm"
            >
              {editLayout ? '✓ Done' : '✎ Edit Layout'}
            </Button>
            <Button
              onClick={() => void window.fdc3.recallWorkspaceWindow(workspaceId)}
              title="Pull back to main shell"
              variant="secondary"
              size="sm"
            >
              ← Pull Back
            </Button>
          </>
        }
        actions={
          <>
            <Select
              value={payload?.theme ?? 'dark-financial'}
              onValueChange={(v) => void handleDetachedThemeChange(v as ThemeName)}
            >
              <SelectTrigger size="sm" className="min-w-[128px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(THEMES).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => wsRef.current?.reloadAll()}
              variant="outline"
              size="sm"
              title="Reload all apps in this workspace"
              className="gap-1.5"
            >
              <RefreshCcw className="size-3.5" />
              Reload
            </Button>
            <ZoomControl />
            <WorkspaceToolbar onSave={handleDetachedSave} saveStatus={saveStatus} />
          </>
        }
      />
      {!payload || apps.length === 0 || !preloadPath ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs font-extrabold text-muted-foreground">
          Loading detached workspace...
        </div>
      ) : (
        <DockviewWorkspace
          ref={wsRef}
          apps={apps}
          currentChannel={currentChannel}
          channelId={payload.channelId}
          preloadPath={preloadPath}
          initialPanelIds={payload.panelIds}
          initialLayout={payload.layout}
          onLayoutChange={handleDetachedLayoutChange}
          workspaceName={payload.name}
          theme={payload.theme}
          detached
          headersVisible={editLayout}
        />
      )}
    </div>
  );
}

function DetachedWorkspacePlaceholder({
  workspaceName,
  panelCount,
  onRecall,
}: {
  workspaceName: string;
  panelCount: number;
  onRecall: () => void;
}) {
  return (
    <Card className="flex min-h-0 flex-1 items-center justify-center">
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <Badge variant="outline" className="h-11 w-11 justify-center rounded-lg px-0 text-sm font-black">
          WS
        </Badge>
        <div className="text-base font-black text-foreground">{workspaceName} is detached</div>
        <div className="text-xs font-extrabold text-muted-foreground">
          {panelCount} panels are running in the floating workspace window.
        </div>
        <Button onClick={onRecall} size="sm">Pull Workspace Back</Button>
      </CardContent>
    </Card>
  );
}


function WorkspaceTabButton({
  active, onClick, onDoubleClick, onClose,
  editing = false, editingValue = '',
  onEditingChange, onEditingCommit, onEditingCancel,
  channelColor = null, channelName = null, panelCount = 0,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onClose?: () => void;
  editing?: boolean;
  editingValue?: string;
  onEditingChange?: (v: string) => void;
  onEditingCommit?: () => void;
  onEditingCancel?: () => void;
  channelColor?: string | null;
  channelName?: string | null;
  panelCount?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      type="button"
      className={cn(
        'relative flex h-full items-center gap-1.5 border-r px-3 text-xs font-medium outline-none transition-colors select-none',
        active
          ? 'bg-background text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[color:var(--shell-accent)]'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {channelColor && (
        <span
          className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10"
          style={{ background: channelColor }}
          title={channelName ? `Channel: ${channelName}` : 'Channel'}
        />
      )}
      {editing ? (
        <Input
          autoFocus
          value={editingValue}
          onChange={(e) => onEditingChange?.(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onBlur={() => onEditingCommit?.()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') onEditingCommit?.();
            if (e.key === 'Escape') onEditingCancel?.();
          }}
          className="h-5 min-w-24 bg-background px-2 text-xs"
        />
      ) : (
        <span>{children}</span>
      )}
      {panelCount > 0 && (
        <span className="rounded px-1 text-[9px] font-black tabular-nums opacity-50">
          {panelCount}
        </span>
      )}
      {onClose && (
        <span
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
          role="button"
          aria-label="Close workspace"
          className="flex h-4 w-4 items-center justify-center rounded text-[11px] leading-none opacity-50 hover:opacity-100"
        >×</span>
      )}
    </button>
  );
}

function StatusItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-[color:var(--shell-subtle)]">{label}:</span>
      <span className="font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}
