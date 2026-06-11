import React from 'react';
import {
  LayoutDashboard,
  BarChart3,
  Workflow,
  Radio,
  AppWindow,
  Network,
  Globe,
  Grid3x3,
  ShieldCheck,
  ScanLine,
} from 'lucide-react';
import { cn, modShortcut } from '../lib/utils.js';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip.js';

type WorkspaceMode =
  | 'launcher'
  | 'workspace'
  | 'dashboard'
  | 'interop-flow'
  | 'control-tower'
  | 'inspector'
  | 'apps'
  | 'bridge'
  | 'environment'
  | 'rbac';

interface ShellSidebarProps {
  activeMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}

const MODE_ITEM_DEFS: Array<{
  mode: WorkspaceMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcutKey?: string;
}> = [
  { mode: 'workspace',     label: 'Workspace',     icon: LayoutDashboard, shortcutKey: '1' },
  { mode: 'dashboard',     label: 'WS Dashboard',  icon: BarChart3 },
  { mode: 'interop-flow',  label: 'Flow Designer',  icon: Workflow,        shortcutKey: '2' },
  { mode: 'control-tower', label: 'Control Tower',  icon: Radio,           shortcutKey: '3' },
  { mode: 'inspector',     label: 'Inspector',       icon: ScanLine,        shortcutKey: '6' },
  { mode: 'apps',          label: 'Apps',            icon: AppWindow,       shortcutKey: '4' },
  { mode: 'bridge',        label: 'Bridge',          icon: Network,         shortcutKey: '5' },
  { mode: 'environment',   label: 'Environments',    icon: Globe },
  { mode: 'launcher',      label: 'Launch',           icon: Grid3x3,         shortcutKey: '0' },
  { mode: 'rbac',          label: 'RBAC',            icon: ShieldCheck },
];

export function ShellSidebar({ activeMode, onModeChange, expanded }: ShellSidebarProps) {
  const MODE_ITEMS = MODE_ITEM_DEFS.map((d) => ({
    ...d,
    shortcut: d.shortcutKey ? modShortcut(d.shortcutKey) : undefined,
  }));

  return (
    <TooltipProvider delayDuration={300}>
      <aside className={cn(
        'flex shrink-0 flex-col border-r bg-card transition-all duration-200',
        expanded ? 'w-48' : 'w-12',
      )}>
        {/* Mode list */}
        <nav className="flex flex-1 flex-col overflow-y-auto py-1.5">
          {MODE_ITEMS.map(({ mode, label, icon: Icon, shortcut }) => {
            const isActive = activeMode === mode;
            return expanded ? (
              <button
                key={mode}
                type="button"
                onClick={() => onModeChange(mode)}
                className={cn(
                  'mx-1.5 flex h-8 w-[calc(100%-12px)] items-center gap-2.5 rounded px-2 text-left text-[12px] font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {shortcut && <span className="shrink-0 text-[10px] opacity-40">{shortcut}</span>}
              </button>
            ) : (
              <Tooltip key={mode}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onModeChange(mode)}
                    aria-label={label}
                    className={cn(
                      'mx-1 my-0.5 flex h-8 w-8 items-center justify-center rounded transition-colors',
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {label}{shortcut && <span className="ml-2 opacity-60">{shortcut}</span>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom: FDC3 badge */}
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
