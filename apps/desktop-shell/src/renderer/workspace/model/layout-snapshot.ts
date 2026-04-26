import type { WorkspaceEditorSnapshot, WorkspaceTabModel } from './workspace-types.js';

export const WORKSPACE_STORAGE_KEY = 'fdc3.workspaceTabs.v2';
const LEGACY_STORAGE_KEY = 'fdc3.workspaceTabs';

interface LegacyTab {
  id: string;
  name: string;
  items?: Array<{ appId: string; x: number; y: number; width: number; height: number }>;
}

export function loadWorkspaceSnapshot(defaultTabs: WorkspaceTabModel[]): WorkspaceEditorSnapshot {
  const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as WorkspaceEditorSnapshot;
      if (parsed.tabs.length > 0) return parsed;
    } catch {
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  }

  const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy) as LegacyTab[];
      if (parsed.length > 0) {
        return {
          activeTabId: parsed[0].id,
          tabs: parsed.map((tab) => ({
            id: tab.id,
            name: tab.name,
            channelId: 'channel-5',
            theme: 'light',
            layout: {
              tiles: (tab.items ?? []).map((item) => ({
                id: `${tab.id}-${item.appId}`,
                appId: item.appId,
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
                constraints: { minWidth: 12, minHeight: 10 },
              })),
              groups: [],
              attachments: [],
              grid: { enabled: true, size: 24, snap: true },
            },
          })),
        };
      }
    } catch {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  }

  return { activeTabId: defaultTabs[0].id, tabs: defaultTabs };
}

export function saveWorkspaceSnapshot(snapshot: WorkspaceEditorSnapshot): void {
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
}

