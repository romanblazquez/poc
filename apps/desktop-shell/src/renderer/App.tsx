import React, { useEffect, useState, useCallback } from 'react';
import { AppLauncher } from './components/AppLauncher.js';
import { ChannelBar } from './components/ChannelBar.js';
import { WorkspaceToolbar } from './components/WorkspaceToolbar.js';
import { WorkspaceBuilder } from './components/WorkspaceBuilder.js';
import { WorkspaceRuntimeWindow } from './components/WorkspaceRuntimeWindow.js';
import { InteropFlowDesigner } from './interop-flow/components/InteropFlowDesigner.js';
import type { UserChannel } from '@fdc3-poc/fdc3-core';

// window.fdc3 is injected by the preload script
declare global {
  interface Window {
    fdc3: {
      getAppList(): Promise<AppEntry[]>;
      getPreloadPath(): Promise<string>;
      openWorkspaceWindow(payload: WorkspaceRuntimePayload): Promise<void>;
      getWorkspaceWindowPayload(id: string): Promise<WorkspaceRuntimePayload | null>;
      open(app: { appId: string }): Promise<void>;
      getUserChannels(): Promise<UserChannel[]>;
      getCurrentChannel(): Promise<UserChannel | null>;
      joinUserChannel(channelId: string): Promise<void>;
      leaveCurrentChannel(): Promise<void>;
      saveWorkspace(name?: string): Promise<void>;
      applyWorkspace(payload: {
        name: string;
        windows: WorkspaceWindowDraft[];
        closeOtherApps?: boolean;
        save?: boolean;
      }): Promise<void>;
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

export interface WorkspaceWindowDraft {
  appId: string;
  channelId: string | null;
  bounds: { x: number; y: number; width: number; height: number };
  isMinimized: boolean;
}

export interface WorkspaceLayoutItem {
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkspaceRuntimePayload {
  id: string;
  name: string;
  channelId: string;
  items: WorkspaceLayoutItem[];
}

export function App() {
  const workspaceWindowId = new URLSearchParams(window.location.search).get('workspaceWindowId');
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [channels, setChannels] = useState<UserChannel[]>([]);
  const [preloadPath, setPreloadPath] = useState('');
  const [runtimePayload, setRuntimePayload] = useState<WorkspaceRuntimePayload | null>(null);
  const [currentChannel, setCurrentChannel] = useState<UserChannel | null>(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [activeTab, setActiveTab] = useState<'launcher' | 'workspace' | 'interop-flow'>('workspace');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    void window.fdc3.getAppList().then(setApps);
    void window.fdc3.getPreloadPath().then(setPreloadPath);
    void window.fdc3.getUserChannels().then(setChannels);
    void window.fdc3.getCurrentChannel().then(setCurrentChannel);
    const unsub = window.fdc3.onChannelChanged(setCurrentChannel);
    return unsub;
  }, []);

  useEffect(() => {
    if (!workspaceWindowId) return;
    void window.fdc3.getWorkspaceWindowPayload(workspaceWindowId).then(setRuntimePayload);
  }, [workspaceWindowId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const handleOpen = useCallback(async (appId: string) => {
    await window.fdc3.open({ appId });
  }, []);

  const handleSave = useCallback(async () => {
    await window.fdc3.saveWorkspace('default');
    setSaveStatus('Saved ✓');
    setTimeout(() => setSaveStatus(''), 2000);
  }, []);

  const handleApplyWorkspace = useCallback(async (payload: {
    name: string;
    windows: WorkspaceWindowDraft[];
    closeOtherApps: boolean;
    save: boolean;
  }) => {
    await window.fdc3.applyWorkspace(payload);
    setSaveStatus(payload.save ? 'Workspace saved ✓' : 'Workspace launched ✓');
    setTimeout(() => setSaveStatus(''), 2200);
  }, []);

  const handleOpenWorkspaceWindow = useCallback(async (payload: WorkspaceRuntimePayload) => {
    await window.fdc3.openWorkspaceWindow(payload);
    setSaveStatus('Workspace window opened ✓');
    setTimeout(() => setSaveStatus(''), 2200);
  }, []);

  const handleThemeChange = useCallback(async (nextTheme: 'light' | 'dark') => {
    setTheme(nextTheme);
    await window.fdc3.broadcast({
      type: 'com.demo.theme',
      name: `${nextTheme} theme`,
      theme: nextTheme,
    });
  }, []);

  if (workspaceWindowId) {
    return (
      <WorkspaceRuntimeWindow
        apps={apps}
        preloadPath={preloadPath}
        payload={runtimePayload}
        theme={theme}
        onThemeChange={handleThemeChange}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'linear-gradient(160deg, #0f0f1a 0%, #16213e 100%)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: 56,
          background: '#0a0a18',
          borderBottom: '1px solid #1e1e3e',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #4080e8, #9040e8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            ⚡
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#e0e0ff', letterSpacing: 0.5 }}>
              FDC3 Desktop Shell
            </div>
            <div style={{ fontSize: 10, color: '#6060a0', letterSpacing: 1 }}>
              ENTERPRISE INTEROP POC
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ alignItems: 'center', color: '#a8acd8', display: 'flex', fontSize: 11, fontWeight: 800, gap: 7 }}>
            <span>Theme</span>
            <button
              role="switch"
              aria-checked={theme === 'dark'}
              aria-label="Toggle workspace theme"
              onClick={() => void handleThemeChange(theme === 'light' ? 'dark' : 'light')}
              title="Toggle workspace theme"
              style={{
                alignItems: 'center',
                background: theme === 'dark' ? '#25304f' : '#dbeafe',
                border: '1px solid #3d5f9f',
                borderRadius: 999,
                color: theme === 'dark' ? '#dbeafe' : '#1e3a8a',
                cursor: 'pointer',
                display: 'flex',
                fontSize: 10,
                fontWeight: 900,
                gap: 6,
                height: 24,
                padding: '2px 8px 2px 3px',
              }}
            >
              <span
                style={{
                  background: theme === 'dark' ? '#60a5fa' : '#fff',
                  borderRadius: '50%',
                  boxShadow: '0 1px 4px rgba(0,0,0,.35)',
                  display: 'inline-block',
                  height: 16,
                  width: 16,
                }}
              />
              <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
          </label>
          <WorkspaceToolbar onSave={handleSave} saveStatus={saveStatus} />
          <ChannelBar
            currentChannel={currentChannel}
            onChannelChange={setCurrentChannel}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '14px 24px 0', flexShrink: 0 }}>
        <TabButton active={activeTab === 'workspace'} onClick={() => setActiveTab('workspace')}>
          Workspace Builder
        </TabButton>
        <TabButton active={activeTab === 'interop-flow'} onClick={() => setActiveTab('interop-flow')}>
          Interop Flow
        </TabButton>
        <TabButton active={activeTab === 'launcher'} onClick={() => setActiveTab('launcher')}>
          App Launcher
        </TabButton>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minHeight: 0, padding: '16px 24px 20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'workspace' ? (
          <WorkspaceBuilder
            apps={apps}
            channels={channels}
            currentChannel={currentChannel}
            preloadPath={preloadPath}
            onApply={handleApplyWorkspace}
            onOpenWorkspaceWindow={handleOpenWorkspaceWindow}
          />
        ) : activeTab === 'interop-flow' ? (
          <InteropFlowDesigner
            apps={apps}
            workspaceTabId={currentChannel?.id ?? 'default-channel'}
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
        <StatusItem
          label="Channel"
          value={currentChannel?.displayMetadata.name ?? 'None'}
          color={currentChannel?.displayMetadata.color ?? '#555'}
        />
        <StatusItem label="Runtime" value="Electron / FDC3" color="#4080e8" />
        <StatusItem label="Apps" value={String(apps.length)} color="#40c080" />
      </div>
    </div>
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
        background: active ? '#1e2a4a' : '#101024',
        border: `1px solid ${active ? '#3a5ca8' : '#25254a'}`,
        borderRadius: 7,
        color: active ? '#e0e8ff' : '#8585b0',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 800,
        padding: '8px 12px',
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
