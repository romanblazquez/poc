import React, { useCallback, useMemo, useRef, useState } from 'react';
import { DockviewReact, type DockviewDefaultTab, type DockviewApi, type DockviewPanelApi } from 'dockview';
import type { AppEntry, WorkspaceRuntimePayload, WorkspaceWindowDraft } from '../../App.js';
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

import type { DetailedHTMLProps, HTMLAttributes } from 'react';

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

// Panel component for embedding apps
function AppPanel({
  app,
  preloadPath,
  currentChannel,
}: {
  app: AppEntry;
  preloadPath: string;
  currentChannel: UserChannel | null;
}) {
  const webviewRef = useRef<HTMLElement | null>(null);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#0a0a18',
      }}
    >
      <webview
        ref={webviewRef as any}
        src={app.url}
        preload={preloadPath}
        partition={`persist:${currentChannel?.id ?? 'default'}`}
        allowpopups="true"
        style={{
          flex: 1,
          border: 'none',
          background: '#0a0a18',
        }}
        onDomReady={(event) => {
          if (event.currentTarget && currentChannel) {
            void event.currentTarget.executeJavaScript(`
              window.fdc3 = window.fdc3 || {};
              window.fdc3.__appId = "${app.appId}";
              window.fdc3.__channelId = "${currentChannel.id}";
            `);
          }
        }}
      />
    </div>
  );
}

export function DockviewWorkspaceEditor({
  apps,
  currentChannel,
  preloadPath,
  onApply,
}: DockviewWorkspaceEditorProps) {
  const dockviewRef = useRef<DockviewApi | null>(null);
  const [selectedLayout, setSelectedLayout] = useState<'default' | 'custom'>('default');

  // Define default layout structure
  const defaultLayout = useMemo(() => {
    const demoApps = ['incoming-orders', 'funds-allocations', 'audit-log'];
    return {
      direction: 'horizontal',
      panels: [
        {
          id: 'incoming-orders',
          title: 'Incoming Orders',
          description: 'incoming-orders',
          component: 'app-panel',
          size: 0.33,
        },
        {
          direction: 'vertical',
          size: 0.67,
          panels: [
            {
              id: 'funds-allocations',
              title: 'Funds Allocations',
              description: 'funds-allocations',
              component: 'app-panel',
              size: 0.5,
            },
            {
              id: 'audit-log',
              title: 'Audit Log',
              description: 'audit-log',
              component: 'app-panel',
              size: 0.5,
            },
          ],
        },
      ],
    };
  }, []);

  const handleResetLayout = useCallback(async () => {
    if (confirm('Reset workspace layout to default 3-panel arrangement?')) {
      if (dockviewRef.current) {
        // Recreate the default layout
        setSelectedLayout('default');
        // Reload dockview with default layout
        window.location.reload();
      }
    }
  }, []);

  const handleLaunchWorkspace = useCallback(async () => {
    // Gather current panel layout and launch as workspace
    const windows: WorkspaceWindowDraft[] = [
      {
        appId: 'incoming-orders',
        channelId: currentChannel?.id ?? null,
        bounds: { x: 40, y: 70, width: 500, height: 600 },
        isMinimized: false,
      },
      {
        appId: 'funds-allocations',
        channelId: currentChannel?.id ?? null,
        bounds: { x: 560, y: 70, width: 500, height: 600 },
        isMinimized: false,
      },
      {
        appId: 'audit-log',
        channelId: currentChannel?.id ?? null,
        bounds: { x: 40, y: 700, width: 500, height: 400 },
        isMinimized: false,
      },
    ];

    await onApply({
      name: 'Funds Workflow',
      windows,
      closeOtherApps: true,
      save: false,
    });
  }, [currentChannel, onApply]);

  const handleSaveLayout = useCallback(async () => {
    const windows: WorkspaceWindowDraft[] = [
      {
        appId: 'incoming-orders',
        channelId: currentChannel?.id ?? null,
        bounds: { x: 40, y: 70, width: 500, height: 600 },
        isMinimized: false,
      },
      {
        appId: 'funds-allocations',
        channelId: currentChannel?.id ?? null,
        bounds: { x: 560, y: 70, width: 500, height: 600 },
        isMinimized: false,
      },
      {
        appId: 'audit-log',
        channelId: currentChannel?.id ?? null,
        bounds: { x: 40, y: 700, width: 500, height: 400 },
        isMinimized: false,
      },
    ];

    await onApply({
      name: 'Funds Workflow (Saved)',
      windows,
      closeOtherApps: false,
      save: true,
    });
  }, [currentChannel, onApply]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0, gap: 0 }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: '#0a0a18',
          borderBottom: '1px solid #1e1e3e',
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleLaunchWorkspace}
          style={{
            padding: '6px 12px',
            background: '#4080e8',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Launch Workspace
        </button>

        <button
          onClick={handleSaveLayout}
          style={{
            padding: '6px 12px',
            background: '#2a5aa8',
            border: 'none',
            borderRadius: 4,
            color: '#a0c0ff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Save Layout
        </button>

        <button
          onClick={handleResetLayout}
          style={{
            padding: '6px 12px',
            background: '#2a2a40',
            border: '1px solid #3a3a60',
            borderRadius: 4,
            color: '#a0a0d0',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reset Layout
        </button>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 11, color: '#808090' }}>
          <strong style={{ color: '#a0a0d0' }}>3-Panel Professional Layout</strong>
        </span>
      </div>

      {/* Dockview container */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DockviewReact
          ref={dockviewRef}
          layout={{
            root: {
              kind: 'group',
              direction: 'horizontal',
              size: 100,
              children: [
                {
                  kind: 'group',
                  direction: 'vertical',
                  size: 33,
                  children: [
                    {
                      kind: 'leaf',
                      panel: 'incoming-orders',
                      size: 100,
                    },
                  ],
                },
                {
                  kind: 'group',
                  direction: 'vertical',
                  size: 67,
                  children: [
                    {
                      kind: 'leaf',
                      panel: 'funds-allocations',
                      size: 50,
                    },
                    {
                      kind: 'leaf',
                      panel: 'audit-log',
                      size: 50,
                    },
                  ],
                },
              ],
            },
          }}
          panels={{
            'incoming-orders': {
              title: 'Incoming Orders',
              component: 'app-panel',
              params: { appId: 'incoming-orders' },
            },
            'funds-allocations': {
              title: 'Funds Allocations',
              component: 'app-panel',
              params: { appId: 'funds-allocations' },
            },
            'audit-log': {
              title: 'Audit Log',
              component: 'app-panel',
              params: { appId: 'audit-log' },
            },
          }}
          components={{
            'app-panel': ({
              params,
            }: {
              params: { appId: string };
            }) => {
              const app = apps.find((a) => a.appId === params.appId);
              if (!app) return <div>App not found</div>;
              return (
                <AppPanel app={app} preloadPath={preloadPath} currentChannel={currentChannel} />
              );
            },
          }}
          showAccessoriesView={false}
          showHiddenOnDrop={true}
          disableFloatingGroups={true}
          disableFullscreenToggle={true}
          style={{
            background: 'linear-gradient(135deg, #0a0a18 0%, #0f0f20 100%)',
          }}
        />
      </div>
    </div>
  );
}
