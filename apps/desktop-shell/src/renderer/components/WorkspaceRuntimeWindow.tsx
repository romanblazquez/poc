// Deprecated: replaced by single-window Dockview workspace.
// Do not use for main workspace runtime.
import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
} from 'react';
import type { AppEntry } from '../App.js';
import { cn } from '../lib/utils.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Switch } from './ui/switch.js';
import { AppIcon } from './AppIcon.js';

interface WorkspaceLayoutItem {
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WorkspaceRuntimePayload {
  id: string;
  name: string;
  channelId: string | null;
  items: WorkspaceLayoutItem[];
}

type EmbeddedWebview = HTMLWebViewElement & {
  executeJavaScript(script: string): Promise<unknown>;
};

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
      <div className="flex h-screen items-center justify-center overflow-hidden bg-background text-sm font-bold text-muted-foreground" data-theme={theme}>
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground" data-theme={theme}>
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card px-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-foreground">{payload.name}</div>
          <div className="text-[10px] font-bold text-muted-foreground">
            Runtime workspace · {items.length} apps · {editing ? 'editing' : 'locked'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[11px] font-bold text-foreground">
            <span>Theme</span>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(checked) => void onThemeChange(checked ? 'dark' : 'light')}
              aria-label="Toggle workspace theme"
            />
            <Badge variant="secondary">{theme}</Badge>
          </label>
          <Button onClick={() => setEditing((value) => !value)} size="sm" type="button" variant="outline">
            {editing ? 'Lock Layout' : 'Edit Layout'}
          </Button>
          <Button onClick={() => saveRuntimeLayout(payload.id, items)} size="sm" type="button">
            Save Layout
          </Button>
        </div>
      </div>

      <div ref={canvasRef} className="relative min-h-0 flex-1">
        {items.map((item) => {
          const app = appById.get(item.appId);
          if (!app) return null;

          return (
            <div
              key={item.appId}
              className="absolute flex overflow-hidden rounded-md border border-[color:var(--shell-accent-border)] bg-card shadow-sm"
              style={tileStyle(item)}
            >
              <div
                onMouseDown={(event) => {
                  if (editing) startMove(item.appId, event);
                }}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-2 border-b border-[color:var(--shell-accent-border)] bg-secondary px-2 text-foreground',
                  editing ? 'cursor-move' : 'cursor-default',
                )}
              >
                <AppIcon icon={app.icon} fallback="□" size={14} />
                <strong className="truncate text-xs font-black">{app.title}</strong>
              </div>
              {preloadPath && (
                <webview
                  ref={(node) => {
                    if (!node) return;
                    const webview = node as EmbeddedWebview;
                    webview.addEventListener('dom-ready', () => {
                      void webview.executeJavaScript(`window.fdc3?.joinUserChannel(${JSON.stringify(payload.channelId)})`);
                    }, { once: true });
                  }}
                  src={resolveEmbeddedAppUrl(app)}
                  preload={`file://${preloadPath}`}
                  partition={`persist:${payload.id}-${app.appId}`}
                  style={webviewStyle}
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

function tileStyle(item: WorkspaceLayoutItem): CSSProperties {
  return {
    height: `${item.height}%`,
    left: `${item.x}%`,
    top: `${item.y}%`,
    width: `${item.width}%`,
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
