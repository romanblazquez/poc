import { useEffect, useRef, useState } from 'react';
import { Copy, Trash2, ArrowRight, Plus, LayoutTemplate, Save, Lock, X, Check, Pencil } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Input } from './ui/input.js';
import type { WorkspaceTab } from '../App.js';
import type { LayoutDefinition, UserChannel } from '@fdc3-poc/fdc3-core';
import type { AppEntry } from '../App.js';

interface WorkspaceState {
  channelId: string | null;
  theme: string;
  layout: unknown | null;
}

interface WorkspaceDashboardProps {
  workspaceTabs: WorkspaceTab[];
  workspaceStates: Record<string, WorkspaceState>;
  activeWorkspaceId: string;
  apps: AppEntry[];
  onSwitch: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onFromScratch: () => void;
  layouts: LayoutDefinition[];
  onSaveAsLayout: (name: string, description: string, panelIds: string[], dockviewLayout: unknown | null) => void;
  onNewFromLayout: (layout: LayoutDefinition) => void;
  onDeleteLayout: (id: string) => void;
}

type DashTab = 'workspaces' | 'layouts';

const CHANNEL_COLORS: Record<string, string> = {
  'channel-1': '#E02020', 'channel-2': '#FF8C00', 'channel-3': '#DAA520',
  'channel-4': '#2ECC71', 'channel-5': '#3498DB', 'channel-6': '#9B59B6',
  'channel-7': '#FF69B4', 'channel-8': '#008080',
};
const CHANNEL_NAMES: Record<string, string> = {
  'channel-1': 'Red', 'channel-2': 'Orange', 'channel-3': 'Yellow',
  'channel-4': 'Green', 'channel-5': 'Blue', 'channel-6': 'Purple',
  'channel-7': 'Pink', 'channel-8': 'Teal',
};

function getChannelDisplay(channelId: string | null, userChannels: UserChannel[]): { name: string; color: string } | null {
  if (!channelId) return null;
  const found = userChannels.find((c) => c.id === channelId);
  if (found) return { name: found.displayMetadata.name, color: found.displayMetadata.color };
  return { name: CHANNEL_NAMES[channelId] ?? channelId, color: CHANNEL_COLORS[channelId] ?? '#555' };
}

export function WorkspaceDashboard({
  workspaceTabs,
  workspaceStates,
  activeWorkspaceId,
  apps,
  onSwitch,
  onDuplicate,
  onDelete,
  onAdd,
  onFromScratch,
  layouts,
  onSaveAsLayout,
  onNewFromLayout,
  onDeleteLayout,
}: WorkspaceDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashTab>('workspaces');
  const [userChannels, setUserChannels] = useState<UserChannel[]>([]);

  // Save-as-layout form
  const [savingLayout, setSavingLayout] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(activeWorkspaceId);
  const [saveLayoutName, setSaveLayoutName] = useState('');
  const [saveLayoutDesc, setSaveLayoutDesc] = useState('');
  const saveNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.fdc3) void window.fdc3.getUserChannels().then(setUserChannels).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!workspaceTabs.some((t) => t.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(workspaceTabs[0]?.id ?? '');
    }
  }, [workspaceTabs, selectedWorkspaceId]);

  useEffect(() => {
    if (savingLayout) setTimeout(() => saveNameRef.current?.focus(), 50);
  }, [savingLayout]);

  const totalPanels = workspaceTabs.reduce((acc, tab) => acc + tab.panelIds.length, 0);
  const activeState = workspaceStates[activeWorkspaceId];
  const activeChannel = activeState?.channelId ? getChannelDisplay(activeState.channelId, userChannels) : null;

  const openSaveForm = (preselectedId?: string) => {
    setSelectedWorkspaceId(preselectedId ?? activeWorkspaceId);
    setSaveLayoutName('');
    setSaveLayoutDesc('');
    setSavingLayout(true);
    setActiveTab('layouts');
  };

  const cancelSave = () => {
    setSavingLayout(false);
    setSaveLayoutName('');
    setSaveLayoutDesc('');
  };

  const handleSaveLayout = () => {
    const name = saveLayoutName.trim();
    if (!name) return;
    const ws = workspaceTabs.find((t) => t.id === selectedWorkspaceId);
    onSaveAsLayout(name, saveLayoutDesc.trim(), ws?.panelIds ?? [], workspaceStates[selectedWorkspaceId]?.layout ?? null);
    cancelSave();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-1 border-b px-4 pt-3">
        {(['workspaces', 'layouts'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-bold capitalize transition-colors',
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab}
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {tab === 'workspaces' ? workspaceTabs.length : layouts.length}
            </Badge>
          </button>
        ))}
      </div>

      {/* ── WORKSPACES TAB ── */}
      {activeTab === 'workspaces' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 scrollbar-thin">
          <div className="flex items-center gap-6 rounded-lg border bg-card px-4 py-2.5">
            <StatItem label="Workspaces" value={String(workspaceTabs.length)} color="#91b4ff" />
            <StatItem label="Total Panels" value={String(totalPanels)} color="var(--shell-positive)" />
            <StatItem label="Active Channel" value={activeChannel?.name ?? 'None'} color={activeChannel?.color ?? '#555'} />
            <div className="flex-1" />
            <Button size="sm" type="button" onClick={() => openSaveForm()} variant="outline" className="gap-1.5">
              <Save className="size-3.5" />
              Save as Layout
            </Button>
            <Button size="sm" type="button" onClick={onAdd} variant="outline" className="gap-1.5">
              <Plus className="size-3.5" />
              New Workspace
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workspaceTabs.map((tab) => {
              const state = workspaceStates[tab.id];
              const isActive = tab.id === activeWorkspaceId;
              const channelDisplay = state?.channelId ? getChannelDisplay(state.channelId, userChannels) : null;
              const tabApps = apps.filter((a) => tab.panelIds.includes(a.appId));
              const visibleApps = tabApps.slice(0, 5);
              const extraCount = tabApps.length - visibleApps.length;

              return (
                <Card key={tab.id} className={cn('relative transition-shadow hover:shadow-md', isActive && 'ring-2 ring-primary/50')}>
                  {isActive && (
                    <Badge className="absolute right-3 top-3 h-4 px-1.5 text-[9px] font-black" variant="default">ACTIVE</Badge>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold">{tab.name}</CardTitle>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {channelDisplay ? (
                        <>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: channelDisplay.color }} />
                          <span>{channelDisplay.name}</span>
                        </>
                      ) : (
                        <>
                          <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                          <span>No channel</span>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 pt-0">
                    <div className="min-h-8">
                      {tabApps.length === 0 ? (
                        <span className="text-xs text-muted-foreground/60">No panels open</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {visibleApps.map((app) => (
                            <Badge key={app.appId} variant="outline" className="h-5 px-1.5 text-[10px]">{app.title}</Badge>
                          ))}
                          {extraCount > 0 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">+{extraCount} more</Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" type="button" onClick={() => onSwitch(tab.id)} className="flex-1 gap-1.5 text-xs" variant={isActive ? 'secondary' : 'default'}>
                        <ArrowRight className="size-3" />
                        {isActive ? 'Current' : 'Switch'}
                      </Button>
                      <Button size="sm" type="button" variant="outline" className="h-8 w-8 p-0" title="Save as layout" onClick={() => openSaveForm(tab.id)}>
                        <Save className="size-3.5" />
                      </Button>
                      <Button size="sm" type="button" variant="outline" className="h-8 w-8 p-0" title="Duplicate" onClick={() => onDuplicate(tab.id)}>
                        <Copy className="size-3.5" />
                      </Button>
                      {workspaceTabs.length > 1 && (
                        <Button size="sm" type="button" variant="outline" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={() => onDelete(tab.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <button
              type="button" onClick={onAdd}
              className="flex min-h-32 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <div className="flex flex-col items-center gap-2">
                <Plus className="size-6" />
                <span className="text-xs font-medium">New Workspace</span>
              </div>
            </button>
          </div>
        </div>
      ) : (
        /* ── LAYOUTS TAB ── */
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 scrollbar-thin">

          {/* Save form */}
          {savingLayout ? (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Save Layout</p>
                <button type="button" onClick={cancelSave} className="text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>

              {/* Workspace selector */}
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Select workspace</p>
              <div className="mb-4 flex flex-col gap-1.5">
                {workspaceTabs.map((tab) => {
                  const isSelected = tab.id === selectedWorkspaceId;
                  const tabApps = apps.filter((a) => tab.panelIds.includes(a.appId));
                  const hasLayout = Boolean(workspaceStates[tab.id]?.layout);
                  return (
                    <button
                      key={tab.id} type="button"
                      onClick={() => setSelectedWorkspaceId(tab.id)}
                      className={cn(
                        'flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                        isSelected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted',
                      )}
                    >
                      <div className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground',
                      )}>
                        {isSelected && <Check className="size-2.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold">{tab.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {tabApps.length > 0
                            ? tabApps.map((a) => a.title).join(', ')
                            : `${tab.panelIds.length} panel${tab.panelIds.length !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {hasLayout && <Badge variant="outline" className="h-4 px-1 text-[9px]">layout ✓</Badge>}
                        {tab.id === activeWorkspaceId && <Badge variant="secondary" className="h-4 px-1 text-[9px]">Active</Badge>}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <Input
                  ref={saveNameRef}
                  placeholder="Layout name"
                  value={saveLayoutName}
                  onChange={(e) => setSaveLayoutName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLayout(); if (e.key === 'Escape') cancelSave(); }}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Description (optional)"
                  value={saveLayoutDesc}
                  onChange={(e) => setSaveLayoutDesc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLayout(); if (e.key === 'Escape') cancelSave(); }}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" type="button" onClick={handleSaveLayout} disabled={!saveLayoutName.trim()} className="gap-1.5">
                    <Save className="size-3.5" />
                    Save Layout
                  </Button>
                  <Button size="sm" type="button" variant="outline" onClick={cancelSave}>Cancel</Button>
                </div>
              </div>
            </div>
          ) : (
            /* Toolbar */
            <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
              <p className="flex-1 text-xs text-muted-foreground">
                A layout is a saved dockview arrangement. Build one from scratch or capture an existing workspace.
              </p>
              <Button size="sm" type="button" onClick={onFromScratch} variant="outline" className="gap-1.5 shrink-0">
                <Pencil className="size-3.5" />
                From Scratch
              </Button>
              <Button size="sm" type="button" onClick={() => openSaveForm()} variant="outline" className="gap-1.5 shrink-0">
                <Save className="size-3.5" />
                From Workspace
              </Button>
            </div>
          )}

          {/* Empty state */}
          {layouts.length === 0 && !savingLayout && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
              <LayoutTemplate className="size-10 opacity-30" />
              <p className="text-sm">No layouts saved yet.</p>
              <p className="text-xs">Build one from scratch in dockview or capture an existing workspace.</p>
            </div>
          )}

          {/* Layout cards */}
          {layouts.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {layouts.map((layout) => {
                const layoutApps = apps.filter((a) => layout.panelIds.includes(a.appId));
                const unknownIds = layout.panelIds.filter((id) => !apps.some((a) => a.appId === id));
                return (
                  <Card key={layout.id} className="relative transition-shadow hover:shadow-md">
                    {layout.isDefault && (
                      <div className="absolute right-3 top-3 flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                        <Lock className="size-3" />IT
                      </div>
                    )}
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2 pr-8">
                        <CardTitle className="text-base font-bold">{layout.name}</CardTitle>
                        {Boolean(layout.dockviewLayout) && (
                          <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">layout ✓</Badge>
                        )}
                      </div>
                      {layout.description && (
                        <p className="text-xs text-muted-foreground">{layout.description}</p>
                      )}
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 pt-0">
                      <div className="min-h-8">
                        {layoutApps.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {layoutApps.slice(0, 5).map((app) => (
                              <Badge key={app.appId} variant="outline" className="h-5 px-1.5 text-[10px]">{app.title}</Badge>
                            ))}
                            {layoutApps.length > 5 && (
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">+{layoutApps.length - 5} more</Badge>
                            )}
                          </div>
                        ) : unknownIds.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {unknownIds.slice(0, 5).map((id) => (
                              <Badge key={id} variant="outline" className="h-5 px-1.5 text-[10px] opacity-50">{id}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">No panels defined</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" type="button" onClick={() => onNewFromLayout(layout)} className="flex-1 gap-1.5 text-xs">
                          <LayoutTemplate className="size-3" />
                          Open as Workspace
                        </Button>
                        {!layout.isDefault && (
                          <Button size="sm" type="button" variant="outline" onClick={() => onDeleteLayout(layout.id)} className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10">
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
    </div>
  );
}
