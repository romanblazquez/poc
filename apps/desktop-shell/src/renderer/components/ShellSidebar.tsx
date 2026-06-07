import { useEffect, useState } from 'react';
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
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip.js';

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
  // workspace tab props kept for API compatibility but no longer rendered in sidebar
  workspaceTabs?: WorkspaceTab[];
  activeWorkspaceId?: string;
  onWorkspaceChange?: (id: string) => void;
  onWorkspaceRename?: (id: string, name: string) => void;
  onWorkspaceClose?: (id: string) => void;
  onWorkspaceAdd?: () => void;
  editingWorkspaceId?: string | null;
  editingWorkspaceName?: string;
  onEditingChange?: (name: string) => void;
  onEditingCommit?: (id: string) => void;
  onEditingCancel?: () => void;
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
