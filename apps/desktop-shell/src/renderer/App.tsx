import React, { useEffect, useState, useCallback } from 'react';
import { AppLauncher } from './components/AppLauncher.js';
import { ChannelBar } from './components/ChannelBar.js';
import { WorkspaceToolbar } from './components/WorkspaceToolbar.js';
import { DockviewWorkspace } from './components/DockviewWorkspace.js';
import { InteropFlowDesigner } from './interop-flow/components/InteropFlowDesigner.js';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { ThemeName } from '@fdc3-poc/fdc3-core';

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
      onChannelChanged(handler: (ch: UserChannel | null) => void): () => void;
      broadcast(context: unknown): Promise<void>;
    };
  }
}

export interface AppEntry {
  appId: string;
  title: string;
  description?: string;
  icon?: string;
  category?: string;
  url: string;
  devPort: number;
}

type ThemeMode = ThemeName;
type WorkspaceMode = 'launcher' | 'workspace' | 'interop-flow';
type WorkspaceId = 'trading-flow' | 'market-view';

interface WorkspaceState {
  channelId: string | null;
  theme: ThemeMode;
  layout: unknown | null;
}

const WORKSPACE_STATE_STORAGE_KEY = 'fdc3.workspace-tabs.v4'; // v4: theme keys changed to ThemeName

const WORKSPACE_PRESETS: Record<WorkspaceId, { name: string; panelIds: string[] }> = {
  'trading-flow': {
    name: 'Trading Flow',
    panelIds: ['incoming-orders', 'funds-allocations', 'audit-log'],
  },
  'market-view': {
    name: 'Market View',
    panelIds: ['market-watch', 'customer-profile', 'portfolio-view'],
  },
};

const DEFAULT_WORKSPACE_STATES: Record<WorkspaceId, WorkspaceState> = {
  'trading-flow': { channelId: 'channel-5', theme: 'quartz-dark', layout: null },
  'market-view': { channelId: null, theme: 'quartz-dark', layout: null },
};

function validTheme(t: unknown): ThemeName {
  return (t != null && Object.prototype.hasOwnProperty.call(THEMES, t as string))
    ? (t as ThemeName)
    : 'quartz-dark';
}

function readWorkspaceStates(): Record<WorkspaceId, WorkspaceState> {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STATE_STORAGE_KEY);
    if (!raw) return DEFAULT_WORKSPACE_STATES;
    const parsed = JSON.parse(raw) as Partial<Record<WorkspaceId, Partial<WorkspaceState>>>;
    const tf = parsed['trading-flow'];
    const mv = parsed['market-view'];
    return {
      'trading-flow': {
        ...DEFAULT_WORKSPACE_STATES['trading-flow'],
        ...tf,
        theme: validTheme(tf?.theme),
      },
      'market-view': {
        ...DEFAULT_WORKSPACE_STATES['market-view'],
        ...mv,
        theme: validTheme(mv?.theme),
      },
    };
  } catch {
    return DEFAULT_WORKSPACE_STATES;
  }
}

export function App() {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [preloadPath, setPreloadPath] = useState('');
  const [currentChannel, setCurrentChannel] = useState<UserChannel | null>(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [activeMode, setActiveMode] = useState<WorkspaceMode>('workspace');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<WorkspaceId>('trading-flow');
  const [workspaceStates, setWorkspaceStates] = useState<Record<WorkspaceId, WorkspaceState>>(() => readWorkspaceStates());
  const [openPanelIds, setOpenPanelIds] = useState<string[]>(WORKSPACE_PRESETS['trading-flow'].panelIds);

  const activeWorkspaceState = workspaceStates[activeWorkspaceId];
  const activeWorkspacePreset = WORKSPACE_PRESETS[activeWorkspaceId];
  const theme = activeWorkspaceState.theme;

  useEffect(() => {
    if (!window.fdc3) return;
    void window.fdc3.getAppList().then(setApps);
    void window.fdc3.getPreloadPath().then(setPreloadPath);
    void window.fdc3.getCurrentChannel().then(setCurrentChannel);
    const unsub = window.fdc3.onChannelChanged(setCurrentChannel);
    return unsub;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = THEMES[theme].dataTheme;
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_STATE_STORAGE_KEY, JSON.stringify(workspaceStates));
  }, [workspaceStates]);

  useEffect(() => {
    if (!window.fdc3) return;
    const desiredChannelId = activeWorkspaceState.channelId;
    if (desiredChannelId) {
      void window.fdc3.joinUserChannel(desiredChannelId);
      return;
    }
    void window.fdc3.leaveCurrentChannel();
  }, [activeWorkspaceState.channelId, activeWorkspaceId]);

  const handleOpen = useCallback(async (appId: string) => {
    await window.fdc3.open({ appId });
  }, []);

  const handleSave = useCallback(async () => {
    window.localStorage.setItem(WORKSPACE_STATE_STORAGE_KEY, JSON.stringify(workspaceStates));
    setSaveStatus('Workspace saved');
    setTimeout(() => setSaveStatus(''), 2000);
  }, [workspaceStates]);

  const handleThemeChange = useCallback(async (nextTheme: ThemeMode) => {
    setWorkspaceStates((prev) => ({
      ...prev,
      [activeWorkspaceId]: {
        ...prev[activeWorkspaceId],
        theme: nextTheme,
      },
    }));
    document.documentElement.dataset.theme = THEMES[nextTheme].dataTheme;
    if (window.fdc3) {
      await window.fdc3.broadcast({
        type: 'com.demo.theme',
        name: THEMES[nextTheme].label,
        theme: nextTheme,
      });
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!window.fdc3) return;
    void window.fdc3.broadcast({
      type: 'com.demo.theme',
      name: THEMES[theme].label,
      theme,
    });
  }, [activeWorkspaceId, theme]);

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

  const handleLayoutChange = useCallback((layout: unknown) => {
    setWorkspaceStates((prev) => ({
      ...prev,
      [activeWorkspaceId]: {
        ...prev[activeWorkspaceId],
        layout,
      },
    }));
  }, [activeWorkspaceId]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: THEMES[theme].dataTheme === 'dark'
          ? 'linear-gradient(180deg, #06111d 0%, #0d1827 100%)'
          : 'linear-gradient(180deg, #dde6f2 0%, #cfd9e8 100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          height: 30,
          background: THEMES[theme].dataTheme === 'dark' ? '#07111d' : '#eef3f8',
          borderBottom: `1px solid ${THEMES[theme].dataTheme === 'dark' ? '#1c2b3d' : '#b4c2d3'}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: 'linear-gradient(135deg, #1f6feb, #3ba0ff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
            }}
          >
            ⚡
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 12, color: THEMES[theme].dataTheme === 'dark' ? '#dce8f8' : '#11253c', letterSpacing: 0.4 }}>
              FDC3 Desktop Shell
            </div>
            <div style={{ fontSize: 10, color: THEMES[theme].dataTheme === 'dark' ? '#7b90a8' : '#526a82', letterSpacing: 0.8 }}>
              TRADER WORKSTATION
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={theme}
            onChange={(e) => void handleThemeChange(e.target.value as ThemeName)}
            style={{
              background: '#0d1826',
              border: '1px solid #2a4060',
              borderRadius: 4,
              color: '#c8daf0',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              height: 22,
              padding: '0 6px',
            }}
          >
            {Object.entries(THEMES).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
          <WorkspaceToolbar onSave={handleSave} saveStatus={saveStatus} />
          <ChannelBar
            currentChannel={currentChannel}
            onChannelChange={handleChannelChange}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(Object.entries(WORKSPACE_PRESETS) as Array<[WorkspaceId, { name: string; panelIds: string[] }]>).map(([workspaceId, preset]) => (
            <WorkspaceTabButton
              key={workspaceId}
              active={activeWorkspaceId === workspaceId}
              onClick={() => setActiveWorkspaceId(workspaceId)}
            >
              {preset.name}
            </WorkspaceTabButton>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <TabButton active={activeMode === 'workspace'} onClick={() => setActiveMode('workspace')}>
          Workspace
        </TabButton>
        <TabButton active={activeMode === 'interop-flow'} onClick={() => setActiveMode('interop-flow')}>
          Interop Flow
        </TabButton>
        <TabButton active={activeMode === 'launcher'} onClick={() => setActiveMode('launcher')}>
          App Launcher
        </TabButton>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: '10px 12px 12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeMode === 'workspace' ? (
          apps.length > 0 && preloadPath ? (
            <DockviewWorkspace
              key={activeWorkspaceId}
              apps={apps}
              currentChannel={currentChannel}
              preloadPath={preloadPath}
              initialPanelIds={activeWorkspacePreset.panelIds}
              initialLayout={activeWorkspaceState.layout}
              onLayoutChange={handleLayoutChange}
              onOpenPanelsChange={setOpenPanelIds}
              onOpenStandalone={handleOpen}
              workspaceName={activeWorkspacePreset.name}
              theme={theme}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: THEMES[theme].dataTheme === 'dark' ? '#4a6080' : '#8aa0b8', fontSize: 12, letterSpacing: 1,
            }}>
              Connecting to FDC3 bus…
            </div>
          )
        ) : activeMode === 'interop-flow' ? (
          <InteropFlowDesigner
            apps={apps}
            workspaceTabId={activeWorkspaceId}
            appIds={apps.map((a) => a.appId)}
          />
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ color: '#a0a0d0', fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                Application Launcher
              </h2>
              <p style={{ color: '#606080', fontSize: 12 }}>
                Click an app to open it in a new window. All apps share the same FDC3 channel.
              </p>
            </div>
            <AppLauncher apps={apps} onOpen={handleOpen} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        style={{
          height: 28,
          background: '#0a0a18',
          borderTop: '1px solid #1e1e3e',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 20,
          flexShrink: 0,
        }}
      >
        <StatusItem label="Workspace" value={activeWorkspacePreset.name} color="#91b4ff" />
        <StatusItem
          label="Channel"
          value={currentChannel?.displayMetadata.name ?? 'None'}
          color={currentChannel?.displayMetadata.color ?? '#555'}
        />
        <StatusItem label="Bus" value="Electron / FDC3" color="#4080e8" />
        <StatusItem label="Panels" value={String(openPanelIds.length)} color="#40c080" />
      </div>
    </div>
  );
}

function WorkspaceTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#143152' : '#0d1520',
        border: `1px solid ${active ? '#2d5f97' : '#213247'}`,
        borderRadius: '6px 6px 0 0',
        color: active ? '#e4efff' : '#8ea1b7',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 800,
        height: 28,
        padding: '0 12px',
      }}
    >
      {children}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#173454' : '#0d1520',
        border: `1px solid ${active ? '#2f648f' : '#223347'}`,
        borderRadius: 5,
        color: active ? '#e0e8ff' : '#90a4bb',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 800,
        height: 26,
        padding: '0 10px',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </button>
  );
}

function StatusItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ color: '#505070' }}>{label}:</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
