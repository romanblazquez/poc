import React, { useEffect, useMemo, useState } from 'react';
import { PanelLeft, PanelLeftClose } from 'lucide-react';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

// macOS: x:6, 3 circles × ~20px hitbox each → right edge ~66px + 8px gap = 74px
const MAC_TRAFFIC_LIGHT_WIDTH = 74;
// Windows 11: 3 buttons × ~46px each (minimize/maximize/close at 32px height)
const WIN_CONTROLS_WIDTH = 138;

type AppRegionStyle = React.CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag';
};

interface ShellChromeFullscreenAPI {
  getFullscreenState(): Promise<boolean>;
  onFullscreenChanged(handler: (fullscreen: boolean) => void): () => void;
}

export interface TopBarProps {
  title: string;
  subtitle?: string;
  mark?: React.ReactNode;
  leftActions?: React.ReactNode;
  center?: React.ReactNode;
  actions?: React.ReactNode;
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
}

function getShellChrome(): ShellChromeFullscreenAPI | undefined {
  return (window as unknown as { shellChrome?: ShellChromeFullscreenAPI }).shellChrome;
}

function useWindowFullscreen(): boolean {
  const api = getShellChrome();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!api) return;
    let alive = true;
    void api.getFullscreenState().then((state) => {
      if (alive) setFullscreen(Boolean(state));
    });
    const unsub = api.onFullscreenChanged((state) => setFullscreen(Boolean(state)));
    return () => {
      alive = false;
      unsub();
    };
  }, [api]);

  return fullscreen;
}

export function TopBar({ title, subtitle, mark, leftActions, center, actions, sidebarOpen, onSidebarToggle }: TopBarProps): React.JSX.Element | null {
  const fullscreen = useWindowFullscreen();
  const isMac = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return navigator.platform.toLowerCase().includes('mac');
  }, []);

  if (fullscreen) return null;

  const dragStyle: AppRegionStyle = {
    WebkitAppRegion: 'drag',
  };
  const noDragStyle: AppRegionStyle = {
    WebkitAppRegion: 'no-drag',
  };

  // macOS: 36px matches traffic light zone. Windows: 38px matches titleBarOverlay height (Win11 feels).
  const barHeight = isMac ? 36 : 38;

  return (
    <div
      className="relative flex shrink-0 select-none items-center justify-between border-b bg-card"
      style={{
        ...dragStyle,
        height: barHeight,
        paddingLeft: isMac ? MAC_TRAFFIC_LIGHT_WIDTH : 14,
        paddingRight: isMac ? 14 : WIN_CONTROLS_WIDTH,
      }}
    >
      {center && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={noDragStyle}
        >
          <div className="pointer-events-auto" style={noDragStyle}>{center}</div>
        </div>
      )}
      <div className="flex min-w-0 items-center gap-2.5">
        {onSidebarToggle && (
          <button
            type="button"
            onClick={onSidebarToggle}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            style={noDragStyle}
          >
            {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
          </button>
        )}
        {leftActions && (
          <div className="flex flex-shrink-0 items-center gap-1.5" style={noDragStyle}>
            {leftActions}
          </div>
        )}
        {mark ?? (
          <Badge variant="outline" className="h-[18px] w-[18px] justify-center rounded px-0 text-[10px]">
            ⚡
          </Badge>
        )}
        <div className="flex min-w-0 items-baseline gap-2">
          <div className="min-w-0 truncate text-xs font-extrabold text-foreground">
            {title}
          </div>
          {subtitle && (
            <div className="flex-shrink-0 text-[10px] text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {actions && (
        <div
          className={cn('flex min-w-0 items-center gap-2')}
          style={noDragStyle}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
