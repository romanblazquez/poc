import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  BarChart3,
  Workflow,
  Radio,
  CloudDownload,
  Network,
  BookOpen,
  Grid3x3,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip.js';
import type { WorkspaceTab } from '../App.js';

type WorkspaceMode =
  | 'launcher'
  | 'workspace'
  | 'dashboard'
  | 'interop-flow'
  | 'control-tower'
  | 'manager'
  | 'bridge'
  | 'app-directory'
  | 'rbac';

interface ShellSidebarProps {
  activeMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  workspaceTabs: WorkspaceTab[];
  activeWorkspaceId: string;
  onWorkspaceChange: (id: string) => void;
  onWorkspaceRename: (id: string, name: string) => void;
  onWorkspaceClose: (id: string) => void;
  onWorkspaceAdd: () => void;
  editingWorkspaceId: string | null;
  editingWorkspaceName: string;
  onEditingChange: (name: string) => void;
  onEditingCommit: (id: string) => void;
  onEditingCancel: () => void;
}

const SIDEBAR_STORAGE_KEY = 'fdc3.shell.sidebar.expanded';

const MODE_ITEMS: Array<{
  mode: WorkspaceMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
}> = [
  { mode: 'workspace', label: 'Workspace', icon: LayoutDashboard, shortcut: '⌘1' },
  { mode: 'dashboard', label: 'WS Dashboard', icon: BarChart3 },
  { mode: 'interop-flow', label: 'Interop Flow', icon: Workflow, shortcut: '⌘2' },
  { mode: 'control-tower', label: 'Control Tower', icon: Radio, shortcut: '⌘3' },
  { mode: 'manager', label: 'Manager', icon: CloudDownload, shortcut: '⌘4' },
  { mode: 'bridge', label: 'Bridge', icon: Network, shortcut: '⌘5' },
  { mode: 'app-directory', label: 'App Directory', icon: BookOpen },
  { mode: 'launcher', label: 'App Launcher', icon: Grid3x3, shortcut: '⌘0' },
  { mode: 'rbac', label: 'RBAC', icon: ShieldCheck },
];

export function ShellSidebar({
  activeMode,
  onModeChange,
  workspaceTabs,
  activeWorkspaceId,
  onWorkspaceChange,
  onWorkspaceClose,
  onWorkspaceAdd,
  editingWorkspaceId,
  editingWorkspaceName,
  onEditingChange,
  onEditingCommit,
  onEditingCancel,
}: ShellSidebarProps) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(expanded));
    } catch {
      // ignore
    }
  }, [expanded]);

  const sidebarWidth = expanded ? 'w-44' : 'w-12';

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r bg-card transition-all duration-200',
          sidebarWidth,
        )}
      >
        {/* Toggle button */}
        <div className="flex h-10 shrink-0 items-center justify-end border-b px-1">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="h-8 w-8 p-0"
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {expanded ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>

        {/* Workspace tabs (only in workspace mode) */}
        {activeMode === 'workspace' && (
          <div className="flex flex-col border-b py-1">
            {expanded && (
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Workspaces
              </div>
            )}
            {workspaceTabs.map((tab) => {
              const isActive = tab.id === activeWorkspaceId;
              const isEditing = editingWorkspaceId === tab.id;

              if (!expanded) {
                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onWorkspaceChange(tab.id)}
                        className={cn(
                          'mx-1 my-0.5 flex h-8 w-8 items-center justify-center rounded text-[11px] font-bold transition-colors',
                          isActive
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                        aria-label={tab.name}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{tab.name}</TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <div key={tab.id} className="flex items-center gap-1 px-1.5 py-0.5">
                  {isEditing ? (
                    <Input
                      autoFocus
                      value={editingWorkspaceName}
                      onChange={(e) => onEditingChange(e.target.value)}
                      onBlur={() => onEditingCommit(tab.id)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') onEditingCommit(tab.id);
                        if (e.key === 'Escape') onEditingCancel();
                      }}
                      className="h-6 flex-1 px-1.5 text-[11px]"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onWorkspaceChange(tab.id)}
                      onDoubleClick={() => {
                        // handled by parent via onWorkspaceRename which sets editing state
                      }}
                      className={cn(
                        'flex h-7 flex-1 items-center truncate rounded px-2 text-left text-[11px] font-medium transition-colors',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                      title={tab.name}
                    >
                      <span className="truncate">{tab.name}</span>
                    </button>
                  )}
                  {workspaceTabs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onWorkspaceClose(tab.id)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] text-muted-foreground opacity-50 hover:opacity-100"
                      aria-label={`Close ${tab.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add workspace button */}
            {expanded ? (
              <button
                type="button"
                onClick={onWorkspaceAdd}
                className="mx-1.5 mt-0.5 flex h-6 items-center gap-1.5 rounded px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className="text-base leading-none">+</span>
                <span>New workspace</span>
              </button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onWorkspaceAdd}
                    className="mx-1 my-0.5 flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Add workspace"
                  >
                    <span className="text-base leading-none">+</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">New workspace</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Mode list */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto py-2">
          {MODE_ITEMS.map(({ mode, label, icon: Icon, shortcut }) => {
            const isActive = activeMode === mode;

            if (!expanded) {
              return (
                <Tooltip key={mode}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onModeChange(mode)}
                      aria-label={label}
                      className={cn(
                        'mx-1 flex h-8 w-8 items-center justify-center rounded transition-colors',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {label}
                    {shortcut && <span className="ml-2 opacity-60">{shortcut}</span>}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <button
                key={mode}
                type="button"
                onClick={() => onModeChange(mode)}
                className={cn(
                  'mx-1.5 flex h-8 items-center gap-2.5 rounded px-2 text-left text-[12px] font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {shortcut && (
                  <span className="shrink-0 text-[10px] opacity-40">{shortcut}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom: version badge */}
        <div className="flex shrink-0 flex-col items-center border-t py-2">
          {expanded ? (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-bold text-muted-foreground">FDC3 3.0</span>
              <span className="text-[9px] text-muted-foreground/60">Desktop Shell</span>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-default text-[9px] font-black text-muted-foreground/60">3.0</div>
              </TooltipTrigger>
              <TooltipContent side="right">FDC3 3.0 Desktop Shell</TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
