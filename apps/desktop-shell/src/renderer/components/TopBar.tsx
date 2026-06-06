import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

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
  actions?: React.ReactNode;
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

export function TopBar({ title, subtitle, mark, leftActions, actions }: TopBarProps): React.JSX.Element | null {
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

  return (
    <div
      className="flex h-12 shrink-0 select-none items-center justify-between border-b bg-card"
      style={{
        ...dragStyle,
        paddingLeft: isMac ? 86 : 14,
        paddingRight: isMac ? 14 : 152,
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
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
