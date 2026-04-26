import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  DetailedHTMLProps,
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
} from 'react';
import type { AppEntry, WorkspaceLayoutItem, WorkspaceRuntimePayload } from '../App.js';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        preload?: string;
        partition?: string;
        onDomReady?: (event: { currentTarget: { executeJavaScript(script: string): Promise<unknown> } }) => void;
      };
    }
  }
}

interface WorkspaceRuntimeWindowProps {
  apps: AppEntry[];
  preloadPath: string;
  payload: WorkspaceRuntimePayload | null;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => Promise<void>;
}

export function WorkspaceRuntimeWindow({
  apps,
  preloadPath,
  payload,
  theme,
  onThemeChange,
}: WorkspaceRuntimeWindowProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<WorkspaceLayoutItem[]>([]);
  const [editing, setEditing] = useState(true);
  const appById = new Map(apps.map((app) => [app.appId, app]));

  useEffect(() => {
    if (!payload) return;
    const stored = window.localStorage.getItem(runtimeStorageKey(payload.id));
    if (stored) {
      try {
        setItems(JSON.parse(stored) as WorkspaceLayoutItem[]);
        return;
      } catch {
        window.localStorage.removeItem(runtimeStorageKey(payload.id));
      }
    }
    setItems(payload.items);
  }, [payload]);

  if (!payload) {
    return (
      <div style={emptyStyle}>
        Loading workspace...
      </div>
    );
  }

  return (
    <div style={rootStyle} data-theme={theme}>
      <div style={headerStyle}>
        <div>
          <div style={{ color: '#e3e6ff', fontSize: 13, fontWeight: 900 }}>{payload.name}</div>
          <div style={{ color: '#70709a', fontSize: 10 }}>Runtime workspace · {items.length} apps · {editing ? 'editing' : 'locked'}</div>
        </div>
        <div style={headerActionsStyle}>
          <label style={themeSwitchRowStyle}>
            <span>Theme</span>
            <button
              role="switch"
              aria-checked={theme === 'dark'}
              aria-label="Toggle workspace theme"
              onClick={() => void onThemeChange(theme === 'dark' ? 'light' : 'dark')}
              style={switchStyle(theme === 'dark')}
            >
              <span style={switchKnobStyle(theme === 'dark')} />
              <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
          </label>
          <button onClick={() => setEditing((value) => !value)} style={buttonStyle}>{editing ? 'Lock Layout' : 'Edit Layout'}</button>
          <button onClick={() => saveRuntimeLayout(payload.id, items)} style={buttonStyle}>Save Layout</button>
        </div>
      </div>

      <div ref={canvasRef} style={canvasStyle}>
        {items.map((item) => {
          const app = appById.get(item.appId);
          if (!app) return null;

          return (
            <div key={item.appId} style={tileStyle(item)}>
              <div
                onMouseDown={(event) => {
                  if (editing) startMove(item.appId, event);
                }}
                style={tileHeaderStyle(editing)}
              >
                <span>{app.icon ?? '□'}</span>
                <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.title}</strong>
              </div>
              {preloadPath && (
                <webview
                  src={resolveEmbeddedAppUrl(app)}
                  preload={`file://${preloadPath}`}
                  partition={`persist:${payload.id}-${app.appId}`}
                  style={webviewStyle}
                  onDomReady={(event) => {
                    const webview = event.currentTarget;
                    void webview.executeJavaScript(`window.fdc3?.joinUserChannel(${JSON.stringify(payload.channelId)})`);
                  }}
                />
              )}
              {editing && (
                <>
                  <span onMouseDown={(event) => startResize(item.appId, 'right', event)} style={rightResizeHandleStyle} />
                  <span onMouseDown={(event) => startResize(item.appId, 'bottom', event)} style={bottomResizeHandleStyle} />
                  <span onMouseDown={(event) => startResize(item.appId, 'corner', event)} style={cornerResizeHandleStyle} />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  function startMove(appId: string, event: ReactMouseEvent<HTMLElement>) {
    if (!canvasRef.current) return;
    event.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const item = items.find((candidate) => candidate.appId === appId);
    if (!item) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startItem = { ...item };

    const onMove = (moveEvent: MouseEvent) => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
      const dy = ((moveEvent.clientY - startY) / rect.height) * 100;
      setItems((current) => current.map((candidate) => candidate.appId === appId
        ? {
            ...candidate,
            x: clamp(startItem.x + dx, 0, 100 - startItem.width),
            y: clamp(startItem.y + dy, 0, 100 - startItem.height),
          }
        : candidate,
      ));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startResize(appId: string, edge: 'right' | 'bottom' | 'corner', event: ReactMouseEvent<HTMLElement>) {
    if (!canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const item = items.find((candidate) => candidate.appId === appId);
    if (!item) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startItem = { ...item };

    const onMove = (moveEvent: MouseEvent) => {
      const dw = ((moveEvent.clientX - startX) / rect.width) * 100;
      const dh = ((moveEvent.clientY - startY) / rect.height) * 100;
      setItems((current) => current.map((candidate) => {
        if (candidate.appId !== appId) return candidate;
        return {
          ...candidate,
          width: edge === 'bottom' ? candidate.width : clamp(startItem.width + dw, 10, 100 - startItem.x),
          height: edge === 'right' ? candidate.height : clamp(startItem.height + dh, 10, 100 - startItem.y),
        };
      }));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
}

function resolveEmbeddedAppUrl(app: AppEntry): string {
  if (window.location.protocol.startsWith('http')) {
    return `http://localhost:${app.devPort}`;
  }
  return app.url;
}

const rootStyle: CSSProperties = {
  background: '#090916',
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  overflow: 'hidden',
};

const emptyStyle: CSSProperties = {
  ...rootStyle,
  alignItems: 'center',
  color: '#a8acd8',
  justifyContent: 'center',
};

const headerStyle: CSSProperties = {
  alignItems: 'center',
  background: '#0a0a18',
  borderBottom: '1px solid #25254a',
  display: 'flex',
  flexShrink: 0,
  height: 36,
  justifyContent: 'space-between',
  padding: '0 10px',
};

const headerActionsStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 6,
};

const buttonStyle: CSSProperties = {
  background: '#1e2a4a',
  border: '1px solid #2a3a6a',
  borderRadius: 4,
  color: '#dbe6ff',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 800,
  height: 24,
  padding: '0 8px',
};

const themeSwitchRowStyle: CSSProperties = {
  alignItems: 'center',
  color: '#a8acd8',
  display: 'flex',
  fontSize: 11,
  fontWeight: 800,
  gap: 7,
};

function switchStyle(dark: boolean): CSSProperties {
  return {
    alignItems: 'center',
    background: dark ? '#25304f' : '#dbeafe',
    border: '1px solid #3d5f9f',
    borderRadius: 999,
    color: dark ? '#dbeafe' : '#1e3a8a',
    cursor: 'pointer',
    display: 'flex',
    fontSize: 10,
    fontWeight: 900,
    gap: 6,
    height: 24,
    padding: '2px 8px 2px 3px',
  };
}

function switchKnobStyle(dark: boolean): CSSProperties {
  return {
    background: dark ? '#60a5fa' : '#fff',
    borderRadius: '50%',
    boxShadow: '0 1px 4px rgba(0,0,0,.35)',
    display: 'inline-block',
    height: 16,
    width: 16,
  };
}

const canvasStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  position: 'relative',
};

function tileStyle(item: WorkspaceLayoutItem): CSSProperties {
  return {
    background: '#101024',
    border: '1px solid #334b86',
    borderRadius: 4,
    display: 'flex',
    flexDirection: 'column',
    height: `${item.height}%`,
    left: `${item.x}%`,
    overflow: 'hidden',
    position: 'absolute',
    top: `${item.y}%`,
    width: `${item.width}%`,
  };
}

function tileHeaderStyle(editing: boolean): CSSProperties {
  return {
  alignItems: 'center',
  background: '#18233f',
  borderBottom: '1px solid #365da8',
  color: '#e3e6ff',
  cursor: editing ? 'move' : 'default',
  display: 'flex',
  flexShrink: 0,
  gap: 8,
  height: 30,
  padding: '0 7px',
  };
}

const webviewStyle: CSSProperties = {
  border: 'none',
  display: 'flex',
  flex: 1,
  minHeight: 0,
  width: '100%',
};

const resizeHandleBaseStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 10,
};

const rightResizeHandleStyle: CSSProperties = {
  ...resizeHandleBaseStyle,
  bottom: 18,
  cursor: 'ew-resize',
  right: 0,
  top: 30,
  width: 7,
};

const bottomResizeHandleStyle: CSSProperties = {
  ...resizeHandleBaseStyle,
  bottom: 0,
  cursor: 'ns-resize',
  height: 7,
  left: 0,
  right: 18,
};

const cornerResizeHandleStyle: CSSProperties = {
  ...resizeHandleBaseStyle,
  borderBottom: '2px solid #9fbfff',
  borderRight: '2px solid #9fbfff',
  bottom: 3,
  cursor: 'nwse-resize',
  height: 14,
  right: 3,
  width: 14,
};

function runtimeStorageKey(id: string): string {
  return `fdc3.workspaceRuntime.${id}`;
}

function saveRuntimeLayout(id: string, items: WorkspaceLayoutItem[]): void {
  window.localStorage.setItem(runtimeStorageKey(id), JSON.stringify(items));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
