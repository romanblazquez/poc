// Deprecated: replaced by single-window Dockview workspace.
// Do not use for main workspace runtime.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import type { AppEntry, WorkspaceRuntimePayload, WorkspaceWindowDraft } from '../App.js';
import { DockviewWorkspaceEditor } from './DockviewWorkspaceEditor.js';

interface WorkspaceTab {
  id: string;
  name: string;
  channelId: string | null;
  initialPanelIds: string[];
  layoutJson?: unknown;
}

interface WorkspaceBuilderProps {
  apps: AppEntry[];
  channels: UserChannel[];
  currentChannel: UserChannel | null;
  preloadPath: string;
  onApply: (payload: {
    name: string;
    windows: WorkspaceWindowDraft[];
    closeOtherApps: boolean;
    save: boolean;
  }) => Promise<void>;
  onOpenWorkspaceWindow: (payload: WorkspaceRuntimePayload) => Promise<void>;
}

const DEFAULT_TABS: WorkspaceTab[] = [
  {
    id: 'tab-trading',
    name: 'Trading Flow',
    channelId: null,
    initialPanelIds: ['incoming-orders', 'funds-allocations', 'audit-log'],
  },
  {
    id: 'tab-market',
    name: 'Market View',
    channelId: null,
    initialPanelIds: ['market-watch', 'customer-profile', 'portfolio-view'],
  },
];

const STORAGE_KEY = 'fdc3-dockview-workspace-tabs-v1';

export function WorkspaceBuilder({
  apps,
  channels,
  currentChannel,
  preloadPath,
  onApply: _onApply,
  onOpenWorkspaceWindow: _onOpenWorkspaceWindow,
}: WorkspaceBuilderProps) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => {
    const fallback = DEFAULT_TABS.map((t) => ({ ...t, channelId: currentChannel?.id ?? null }));
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as WorkspaceTab[];
      if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
      return parsed;
    } catch {
      return fallback;
    }
  });
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TABS[0].id);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  useEffect(() => {
    if (tabs.length === 0) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  const addTab = useCallback(() => {
    const id = `tab-${Date.now()}`;
    const newTab: WorkspaceTab = {
      id,
      name: `Workspace ${tabs.length + 1}`,
      channelId: currentChannel?.id ?? null,
      initialPanelIds: [],
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  }, [tabs.length, currentChannel]);

  const closeTab = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (activeTabId === id && next.length > 0) {
          setActiveTabId(next[Math.max(0, prev.findIndex((t) => t.id === id) - 1)].id);
        }
        return next;
      });
    },
    [activeTabId]
  );

  const startRename = useCallback((tab: WorkspaceTab, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(tab.id);
    setRenameValue(tab.name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    setTabs((prev) =>
      prev.map((t) =>
        t.id === renamingId ? { ...t, name: renameValue.trim() || t.name } : t
      )
    );
    setRenamingId(null);
  }, [renamingId, renameValue]);

  const onRenameKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commitRename();
      if (e.key === 'Escape') setRenamingId(null);
      e.stopPropagation();
    },
    [commitRename]
  );

  const setTabChannel = useCallback((tabId: string, channelId: string | null) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, channelId } : t)));
  }, []);

  const setTabLayout = useCallback((tabId: string, layoutJson: unknown) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, layoutJson } : t)));
  }, []);

  const activeChannel =
    channels.find((c) => c.id === activeTab?.channelId) ?? currentChannel ?? null;

  return (
    <div style={rootStyle}>
      {/* ── Workspace Tab Bar ── */}
      <div style={tabBarStyle}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              title="Double-click to rename"
              style={{ ...tabItemStyle, ...(isActive ? activeTabItemStyle : {}) }}
            >
              {renamingId === tab.id ? (
                <input
                  ref={renameInputRef}
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={onRenameKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  style={renameInputStyle}
                />
              ) : (
                <span
                  onDoubleClick={(e) => startRename(tab, e)}
                  style={tabLabelStyle}
                >
                  {tab.name}
                </span>
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  title="Close workspace"
                  style={closeTabBtnStyle}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Add workspace tab */}
        <button onClick={addTab} title="New workspace" style={addTabBtnStyle}>
          +
        </button>

        {/* Channel selector — aligned right */}
        <div style={channelSelectorContainerStyle}>
          <span style={{ fontSize: 10, color: '#606080', letterSpacing: 0.5 }}>CHANNEL</span>
          <select
            value={activeTab?.channelId ?? ''}
            onChange={(e) => setTabChannel(activeTabId, e.target.value || null)}
            style={selectStyle}
          >
            <option value="">None</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.displayMetadata.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Active Workspace Content ── */}
      {activeTab && (
        <DockviewWorkspaceEditor
          key={activeTab.id}
          apps={apps}
          currentChannel={activeChannel}
          preloadPath={preloadPath}
          initialPanelIds={activeTab.initialPanelIds}
          initialLayout={activeTab.layoutJson}
          onLayoutChange={(layout) => setTabLayout(activeTab.id, layout)}
          workspaceName={activeTab.name}
        />
      )}
    </div>
  );
}

/* ── Styles ── */
const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  width: '100%',
};

const tabBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  background: '#070711',
  borderBottom: '1px solid #1e1e3e',
  padding: '0 8px',
  flexShrink: 0,
  gap: 2,
  minHeight: 38,
};

const tabItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '0 10px',
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  color: '#607098',
  fontSize: 12,
  fontWeight: 600,
  transition: 'color .15s, border-color .15s',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  marginBottom: -1,
};

const activeTabItemStyle: CSSProperties = {
  color: '#e0e0ff',
  borderBottomColor: '#4080e8',
  background: '#0e0e22',
};

const tabLabelStyle: CSSProperties = {
  maxWidth: 140,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const renameInputStyle: CSSProperties = {
  background: '#1a1a38',
  border: '1px solid #4060b0',
  borderRadius: 3,
  color: '#e0e0ff',
  fontSize: 12,
  outline: 'none',
  padding: '1px 5px',
  width: 130,
};

const closeTabBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#506080',
  cursor: 'pointer',
  fontSize: 15,
  lineHeight: 1,
  padding: '0 2px',
};

const addTabBtnStyle: CSSProperties = {
  alignSelf: 'center',
  background: 'none',
  border: '1px solid #2a2a4a',
  borderRadius: 4,
  color: '#6080b0',
  cursor: 'pointer',
  fontSize: 16,
  height: 22,
  lineHeight: 1,
  padding: '0 7px',
};

const channelSelectorContainerStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flex: 1,
  gap: 6,
  justifyContent: 'flex-end',
  padding: '0 4px',
};

const selectStyle: CSSProperties = {
  background: '#0e1228',
  border: '1px solid #2a3560',
  borderRadius: 4,
  color: '#a8bce8',
  cursor: 'pointer',
  fontSize: 11,
  outline: 'none',
  padding: '2px 6px',
};
