import { useEffect, useState } from 'react';
import { Copy, Trash2, ArrowRight, Plus } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import type { WorkspaceTab } from '../App.js';
import type { UserChannel } from '@fdc3-poc/fdc3-core';

interface WorkspaceState {
  channelId: string | null;
  theme: string;
  layout: unknown | null;
}

interface AppEntry {
  appId: string;
  title: string;
  category?: string;
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
}

const CHANNEL_COLORS: Record<string, string> = {
  'channel-1': '#E02020',
  'channel-2': '#FF8C00',
  'channel-3': '#DAA520',
  'channel-4': '#2ECC71',
  'channel-5': '#3498DB',
  'channel-6': '#9B59B6',
  'channel-7': '#FF69B4',
  'channel-8': '#008080',
};

const CHANNEL_NAMES: Record<string, string> = {
  'channel-1': 'Red',
  'channel-2': 'Orange',
  'channel-3': 'Yellow',
  'channel-4': 'Green',
  'channel-5': 'Blue',
  'channel-6': 'Purple',
  'channel-7': 'Pink',
  'channel-8': 'Teal',
};

function getChannelDisplay(channelId: string | null, userChannels: UserChannel[]): { name: string; color: string } | null {
  if (!channelId) return null;
  const found = userChannels.find((c) => c.id === channelId);
  if (found) {
    return { name: found.displayMetadata.name, color: found.displayMetadata.color };
  }
  // Fallback to hardcoded map
  return {
    name: CHANNEL_NAMES[channelId] ?? channelId,
    color: CHANNEL_COLORS[channelId] ?? '#555',
  };
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
}: WorkspaceDashboardProps) {
  const [userChannels, setUserChannels] = useState<UserChannel[]>([]);

  useEffect(() => {
    if (window.fdc3) {
      void window.fdc3.getUserChannels().then(setUserChannels).catch(() => undefined);
    }
  }, []);

  const totalPanels = workspaceTabs.reduce((acc, tab) => acc + tab.panelIds.length, 0);
  const activeState = workspaceStates[activeWorkspaceId];
  const activeChannel = activeState?.channelId
    ? getChannelDisplay(activeState.channelId, userChannels)
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 scrollbar-thin">
      {/* Stats strip */}
      <div className="flex items-center gap-6 rounded-lg border bg-card px-4 py-2.5">
        <StatItem label="Workspaces" value={String(workspaceTabs.length)} color="#91b4ff" />
        <StatItem label="Total Panels" value={String(totalPanels)} color="var(--shell-positive)" />
        <StatItem
          label="Active Channel"
          value={activeChannel?.name ?? 'None'}
          color={activeChannel?.color ?? '#555'}
        />
        <div className="flex-1" />
        <Button size="sm" type="button" onClick={onAdd} variant="outline" className="gap-1.5">
          <Plus className="size-3.5" />
          New Workspace
        </Button>
      </div>

      {/* Workspace cards grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspaceTabs.map((tab) => {
          const state = workspaceStates[tab.id];
          const isActive = tab.id === activeWorkspaceId;
          const channelDisplay = state?.channelId
            ? getChannelDisplay(state.channelId, userChannels)
            : null;
          const tabApps = apps.filter((a) => tab.panelIds.includes(a.appId));
          const visibleApps = tabApps.slice(0, 5);
          const extraCount = tabApps.length - visibleApps.length;

          return (
            <Card
              key={tab.id}
              className={cn(
                'relative transition-shadow hover:shadow-md',
                isActive && 'ring-2 ring-primary/50',
              )}
            >
              {isActive && (
                <Badge
                  className="absolute right-3 top-3 h-4 px-1.5 text-[9px] font-black"
                  variant="default"
                >
                  ACTIVE
                </Badge>
              )}

              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">{tab.name}</CardTitle>
                {/* Channel indicator */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {channelDisplay ? (
                    <>
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: channelDisplay.color }}
                      />
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
                {/* Panels */}
                <div className="min-h-8">
                  {tabApps.length === 0 ? (
                    <span className="text-xs text-muted-foreground/60">No panels open</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {visibleApps.map((app) => (
                        <Badge
                          key={app.appId}
                          variant="outline"
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {app.title}
                        </Badge>
                      ))}
                      {extraCount > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          +{extraCount} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => onSwitch(tab.id)}
                    className="flex-1 gap-1.5 text-xs"
                    variant={isActive ? 'secondary' : 'default'}
                  >
                    <ArrowRight className="size-3" />
                    {isActive ? 'Current' : 'Switch'}
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => onDuplicate(tab.id)}
                    className="h-8 w-8 p-0"
                    title="Duplicate workspace"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  {workspaceTabs.length > 1 && (
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => onDelete(tab.id)}
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                      title="Delete workspace"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* New workspace card */}
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-32 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          aria-label="Add new workspace"
        >
          <div className="flex flex-col items-center gap-2">
            <Plus className="size-6" />
            <span className="text-xs font-medium">New Workspace</span>
          </div>
        </button>
      </div>
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
