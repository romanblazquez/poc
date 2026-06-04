import React, { useEffect, useMemo, useState } from 'react';

const TITLE_BAR_HEIGHT = 30;

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
      style={{
        ...dragStyle,
        alignItems: 'center',
        background: 'var(--shell-panel)',
        borderBottom: '1px solid var(--shell-border)',
        display: 'flex',
        flexShrink: 0,
        height: TITLE_BAR_HEIGHT,
        justifyContent: 'space-between',
        minHeight: TITLE_BAR_HEIGHT,
        paddingLeft: isMac ? 86 : 14,
        paddingRight: isMac ? 14 : 152,
        userSelect: 'none',
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: 10, minWidth: 0 }}>
        {leftActions && (
          <div style={{ ...noDragStyle, alignItems: 'center', display: 'flex', gap: 6, flexShrink: 0 }}>
            {leftActions}
          </div>
        )}
        {mark ?? (
          <div
            style={{
              alignItems: 'center',
              background: 'var(--shell-accent-soft)',
              border: '1px solid var(--shell-accent-border)',
              borderRadius: 4,
              color: 'var(--shell-accent-text)',
              display: 'flex',
              fontSize: 10,
              height: 18,
              justifyContent: 'center',
              width: 18,
            }}
          >
            ⚡
          </div>
        )}
        <div style={{ alignItems: 'baseline', display: 'flex', gap: 8, minWidth: 0 }}>
          <div
            style={{
              color: 'var(--shell-text)',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ color: 'var(--shell-muted)', flexShrink: 0, fontSize: 10, letterSpacing: 0 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {actions && (
        <div style={{ ...noDragStyle, alignItems: 'center', display: 'flex', gap: 8, minWidth: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}

