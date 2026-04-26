import React, { useCallback, useRef } from 'react';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import { DockviewReact, type IDockviewPanelProps, type DockviewReadyEvent } from 'dockview';
import type { AppEntry, WorkspaceWindowDraft } from '../App.js';
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
  onApply: (payload: {
    name: string;
    windows: WorkspaceWindowDraft[];
    closeOtherApps: boolean;
    save: boolean;
  }) => Promise<void>;
}

// Panel params passed to each app panel
interface AppPanelParams {
  appId: string;
  appUrl: string;
  preloadPath: string;
  channelId: string | null;
}

// Component rendered inside each Dockview panel
function AppPanelComponent({ params }: IDockviewPanelProps<AppPanelParams>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#0a0a18' }}>
      <webview
        src={params.appUrl}
        preload={`file://${params.preloadPath}`}
        partition={`persist:dockview-${params.channelId ?? 'default'}-${params.appId}`}
        allowpopups="true"
        style={{ flex: 1, border: 'none', width: '100%' } as React.CSSProperties}
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

// Default 3-panel layout: incoming-orders left, funds-allocations top-right, audit-log bottom-right
const DEFAULT_PANEL_IDS = ['incoming-orders', 'funds-allocations', 'audit-log'];

export function DockviewWorkspaceEditor({
  apps,
  currentChannel,
  preloadPath,
  onApply,
}: DockviewWorkspaceEditorProps) {
  const channelId = currentChannel?.id ?? null;

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;

    // Find apps to add (use defaults if available, otherwise first 3 apps)
    const panelApps = DEFAULT_PANEL_IDS
      .map((id) => apps.find((a) => a.appId === id))
      .filter((a): a is AppEntry => !!a);

    // Fill with remaining apps if defaults not found
    if (panelApps.length === 0) {
      apps.slice(0, 3).forEach((a) => panelApps.push(a));
    }

    if (panelApps.length === 0) return;

    // Add first panel (left column, full height)
    const first = api.addPanel<AppPanelParams>({
      id: panelApps[0].appId,
      component: 'app-panel',
      title: panelApps[0].title,
      params: {
        appId: panelApps[0].appId,
        appUrl: panelApps[0].url,
        preloadPath,
        channelId,
      },
    });

    // Add second panel to the right of the first
    if (panelApps[1]) {
      api.addPanel<AppPanelParams>({
        id: panelApps[1].appId,
        component: 'app-panel',
        title: panelApps[1].title,
        params: {
          appId: panelApps[1].appId,
          appUrl: panelApps[1].url,
          preloadPath,
          channelId,
        },
        position: { referencePanel: first.id, direction: 'right' },
      });
    }

    // Add third panel below the second
    if (panelApps[2]) {
      api.addPanel<AppPanelParams>({
        id: panelApps[2].appId,
        component: 'app-panel',
        title: panelApps[2].title,
        params: {
          appId: panelApps[2].appId,
          appUrl: panelApps[2].url,
          preloadPath,
          channelId,
        },
        position: { referencePanel: panelApps[1].appId, direction: 'below' },
      });
    }
  }, [apps, channelId, preloadPath]);

  const handleLaunchWorkspace = useCallback(async () => {
    const windows: WorkspaceWindowDraft[] = DEFAULT_PANEL_IDS
      .map((id, i) => {
        const app = apps.find((a) => a.appId === id);
        if (!app) return null;
        return {
          appId: app.appId,
          channelId,
          bounds: { x: 40 + i * 520, y: 70, width: 500, height: 600 },
          isMinimized: false,
        };
      })
      .filter((w): w is WorkspaceWindowDraft => w !== null);

    await onApply({ name: 'Funds Workflow', windows, closeOtherApps: true, save: false });
  }, [apps, channelId, onApply]);

  const handleSaveLayout = useCallback(async () => {
    const windows: WorkspaceWindowDraft[] = DEFAULT_PANEL_IDS
      .map((id, i) => {
        const app = apps.find((a) => a.appId === id);
        if (!app) return null;
        return {
          appId: app.appId,
          channelId,
          bounds: { x: 40 + i * 520, y: 70, width: 500, height: 600 },
          isMinimized: false,
        };
      })
      .filter((w): w is WorkspaceWindowDraft => w !== null);

    await onApply({ name: 'Funds Workflow (Saved)', windows, closeOtherApps: false, save: true });
  }, [apps, channelId, onApply]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px', background: '#0a0a18',
        borderBottom: '1px solid #1e1e3e', flexShrink: 0,
      }}>
        <button onClick={handleLaunchWorkspace} style={btnPrimary}>Launch as Windows</button>
        <button onClick={handleSaveLayout} style={btnSecondary}>Save Layout</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#606080' }}>
          Drag tabs to rearrange · Drag borders to resize
        </span>
      </div>

      {/* Dockview */}
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

const btnPrimary: React.CSSProperties = {
  padding: '5px 12px', background: '#1d4ed8', border: 'none',
  borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '5px 12px', background: '#18233f', border: '1px solid #385ea8',
  borderRadius: 4, color: '#dbe6ff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
