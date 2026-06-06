// Deprecated: replaced by single-window Dockview workspace.
// Do not use for main workspace runtime.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import type { AppEntry } from '../App.js';
import { cn } from '../lib/utils.js';
import { DockviewWorkspaceEditor } from './DockviewWorkspaceEditor.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';

interface WorkspaceTab {
  id: string;
  name: string;
  channelId: string | null;
  initialPanelIds: string[];
  layoutJson?: unknown;
}

type WorkspaceRuntimePayload = unknown;
type WorkspaceWindowDraft = unknown;

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-[38px] shrink-0 items-stretch gap-0.5 border-b border-border bg-card px-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              role="button"
              tabIndex={0}
              title="Double-click to rename"
              className={cn(
                'mb-[-1px] flex select-none items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground',
                isActive && 'border-[color:var(--shell-accent)] bg-secondary text-foreground',
              )}
            >
              {renamingId === tab.id ? (
                <Input
                  ref={renameInputRef}
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={onRenameKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="h-6 w-32 px-2 text-xs"
                />
              ) : (
                <span
                  onDoubleClick={(e) => startRename(tab, e)}
                  className="max-w-36 overflow-hidden text-ellipsis"
                >
                  {tab.name}
                </span>
              )}
              {tabs.length > 1 && (
                <Button
                  onClick={(e) => closeTab(tab.id, e)}
                  title="Close workspace"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                >
                  ×
                </Button>
              )}
            </div>
          );
        })}

        <Button
          onClick={addTab}
          title="New workspace"
          type="button"
          variant="outline"
          size="icon"
          className="self-center h-6 w-6"
        >
          +
        </Button>

        <div className="ml-auto flex items-center gap-2 px-1">
          <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Channel</span>
          <Select
            value={activeTab?.channelId ?? ''}
            onValueChange={(v) => setTabChannel(activeTabId, v || null)}
          >
            <SelectTrigger size="sm" className="w-44">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {channels.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>
                  {ch.displayMetadata.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
          theme="dark-financial"
        />
      )}
    </div>
  );
}
