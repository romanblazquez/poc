import React, { useCallback, useRef, useState } from 'react';
import type { DetailedHTMLProps, HTMLAttributes, CSSProperties } from 'react';
import { DockviewReact, type IDockviewPanelProps, type DockviewReadyEvent, type DockviewApi } from 'dockview';
import type { AppEntry, WorkspaceRuntimePayload, WorkspaceWindowDraft } from '../App.js';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import '../styles/dockview-override.css';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        preload?: string;
        partition?: string;
        allowpopups?: string;
        onDomReady?: (event: { currentTarget: { executeJavaScript(script: string): Promise<unknown> } }) => void;
      };
    }
  }
}

interface DockviewWorkspaceEditorProps {
  apps: AppEntry[];
  currentChannel: UserChannel | null;
  preloadPath: string;
  initialPanelIds?: string[];
  onApply: (payload: {
    name: string;
    windows: WorkspaceWindowDraft[];
    closeOtherApps: boolean;
    save: boolean;
  }) => Promise<void>;
  onOpenWorkspaceWindow: (payload: WorkspaceRuntimePayload) => Promise<void>;
}

interface AppPanelParams {
  appId: string;
  appUrl: string;
  preloadPath: string;
  channelId: string | null;
}

// Each Dockview panel renders the FDC3 app as an embedded webview — single window, no popup
function AppPanelComponent({ params }: IDockviewPanelProps<AppPanelParams>) {
  return (
    <div style={{ height: '100%', width: '100%', background: '#07070f' }}>
      <webview
        src={params.appUrl}
        preload={`file://${params.preloadPath}`}
        partition={`persist:ws-${params.channelId ?? 'default'}-${params.appId}`}
        allowpopups="true"
        style={{ height: '100%', width: '100%', border: 'none' } as CSSProperties}
        onDomReady={(event) => {
          if (params.channelId) {
            void event.currentTarget.executeJavaScript(
              `window.fdc3?.joinUserChannel(${JSON.stringify(params.channelId)})`
            );
          }
        }}
      />
    </div>
  );
}

/**
 * Adds panels to the Dockview API in a smart grid layout.
 * - Col 0: panels 0, 3, 6  (leftmost column)
 * - Col 1: panels 1, 4, 7  (split right of col 0)
 * - Col 2: panels 2, 5, 8  (split right of col 1)
 * Within each column, panels are stacked below each other.
 */
function populatePanels(
  api: DockviewApi,
  panelApps: AppEntry[],
  preloadPath: string,
  channelId: string | null
) {
  if (panelApps.length === 0) return;

  const COLS = 3;
  // Track the first panel added to each column (needed as position reference)
  const colFirstPanel: Record<number, string> = {};

  panelApps.forEach((app, idx) => {
    const col = idx % COLS;
    const isFirstInCol = Math.floor(idx / COLS) === 0;

    let position: { referencePanel: string; direction: 'right' | 'below' } | undefined;

    if (idx === 0) {
      // Very first panel — no position needed
      position = undefined;
    } else if (isFirstInCol) {
      // First panel of a new column: split right of the first panel of the previous column
      position = { referencePanel: colFirstPanel[col - 1], direction: 'right' };
    } else {
      // Stack below the previous panel in the same column
      position = { referencePanel: panelApps[idx - COLS].appId, direction: 'below' };
    }

    api.addPanel<AppPanelParams>({
      id: app.appId,
      component: 'app-panel',
      title: app.title,
      params: { appId: app.appId, appUrl: app.url, preloadPath, channelId },
      ...(position ? { position } : {}),
    });

    if (isFirstInCol) colFirstPanel[col] = app.appId;
  });
}

export function DockviewWorkspaceEditor({
  apps,
  currentChannel,
  preloadPath,
  initialPanelIds,
  onApply,
}: DockviewWorkspaceEditorProps) {
  const channelId = currentChannel?.id ?? null;
  const dockApiRef = useRef<DockviewApi | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [openPanelIds, setOpenPanelIds] = useState<Set<string>>(new Set());

  // Resolve which apps to show initially
  const resolveInitialApps = useCallback((): AppEntry[] => {
    if (initialPanelIds && initialPanelIds.length > 0) {
      // Use the specified list, preserving order, filtering to known apps
      return initialPanelIds
        .map((id) => apps.find((a) => a.appId === id))
        .filter((a): a is AppEntry => !!a);
    }
    // No list specified → show all apps
    return apps;
  }, [apps, initialPanelIds]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    dockApiRef.current = api;
    const panelApps = resolveInitialApps();
    setOpenPanelIds(new Set(panelApps.map((a) => a.appId)));
    populatePanels(api, panelApps, preloadPath, channelId);
  }, [resolveInitialApps, preloadPath, channelId]);

  const addPanel = useCallback((app: AppEntry) => {
    const api = dockApiRef.current;
    if (!api) return;
    // If panel already open, just activate it
    const existing = api.getPanel(app.appId);
    if (existing) { existing.focus(); setShowAddMenu(false); return; }

    api.addPanel<AppPanelParams>({
      id: app.appId,
      component: 'app-panel',
      title: app.title,
      params: { appId: app.appId, appUrl: app.url, preloadPath, channelId },
    });
    setOpenPanelIds((prev) => new Set([...prev, app.appId]));
    setShowAddMenu(false);
  }, [preloadPath, channelId]);

  const handleSave = useCallback(async () => {
    const windows: WorkspaceWindowDraft[] = [...openPanelIds].map((id, i) => {
      const app = apps.find((a) => a.appId === id);
      if (!app) return null;
      return {
        appId: app.appId,
        channelId,
        bounds: { x: 40 + (i % 3) * 520, y: 70 + Math.floor(i / 3) * 420, width: 500, height: 400 },
        isMinimized: false,
      };
    }).filter((w): w is WorkspaceWindowDraft => w !== null);

    await onApply({ name: 'Saved Workspace', windows, closeOtherApps: false, save: true });
  }, [openPanelIds, apps, channelId, onApply]);

  const closedApps = apps.filter((a) => !openPanelIds.has(a.appId));

  return (
    <div style={rootStyle}>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowAddMenu((v) => !v)} style={btnPrimary}>
            + Add App
          </button>
          {showAddMenu && (
            <div style={addMenuStyle}>
              {closedApps.length === 0 && (
                <div style={{ padding: '8px 12px', color: '#607090', fontSize: 11 }}>All apps open</div>
              )}
              {closedApps.map((app) => (
                <button
                  key={app.appId}
                  onClick={() => addPanel(app)}
                  style={addMenuItemStyle}
                >
                  {app.title}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={handleSave} style={btnSecondary}>Save Layout</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#404060' }}>
          Drag panel tabs to rearrange · Drag borders to resize
        </span>
      </div>

      {/* Dockview — all apps as embedded webview panels */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <DockviewReact
          onReady={onReady}
          components={{ 'app-panel': AppPanelComponent }}
          className="dockview-theme-dark"
          style={{ height: '100%', width: '100%' }}
        />
      </div>
    </div>
  );
}

/* ── Styles ── */
const rootStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%',
};
const toolbarStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 12px', background: '#0a0a18',
  borderBottom: '1px solid #1a1a32', flexShrink: 0,
};
const btnPrimary: CSSProperties = {
  padding: '4px 11px', background: '#1d4ed8', border: 'none',
  borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
const btnSecondary: CSSProperties = {
  padding: '4px 11px', background: '#111827', border: '1px solid #2d4a80',
  borderRadius: 4, color: '#c0d4ff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
const addMenuStyle: CSSProperties = {
  position: 'absolute', top: '100%', left: 0, zIndex: 999,
  background: '#0e1628', border: '1px solid #1e3060', borderRadius: 6,
  boxShadow: '0 8px 24px rgba(0,0,0,.6)', minWidth: 180, marginTop: 4,
  display: 'flex', flexDirection: 'column',
};
const addMenuItemStyle: CSSProperties = {
  background: 'none', border: 'none', color: '#c0d4ff',
  cursor: 'pointer', fontSize: 12, padding: '7px 14px', textAlign: 'left',
};
