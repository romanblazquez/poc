import { clamp, moveRect } from '../model/geometry.js';
import type {
  WorkspaceLayout,
  WorkspaceEditorState,
  WorkspaceGridSettings,
  WorkspaceTabModel,
  WorkspaceTile,
} from '../model/workspace-types.js';
import { DEFAULT_TILE_CONSTRAINTS } from '../model/workspace-types.js';
import { normalizeLayout } from './layout-normalizer.js';
import { snapRect } from './snapping-engine.js';
import { resizeWithSplit, type ResizeEdge } from './split-resize-engine.js';

export type WorkspaceAction =
  | { type: 'select-tab'; tabId: string }
  | { type: 'add-tab'; tab: WorkspaceTabModel }
  | { type: 'close-tab'; tabId: string }
  | { type: 'rename-tab'; name: string }
  | { type: 'set-channel'; channelId: string }
  | { type: 'set-theme'; theme: 'light' | 'dark' }
  | { type: 'set-grid'; grid: Partial<WorkspaceGridSettings> }
  | { type: 'select-tile'; tileId: string | null }
  | { type: 'add-tile'; appId: string; x: number; y: number }
  | { type: 'replace-layout'; layout: WorkspaceLayout; selectedTileId?: string | null }
  | { type: 'remove-tile'; tileId: string }
  | { type: 'move-tile'; tileId: string; dx: number; dy: number; altKey?: boolean }
  | { type: 'resize-tile'; tileId: string; edge: ResizeEdge; dw: number; dh: number; demagnetized?: boolean }
  | { type: 'resize-group'; groupId: string; dw: number; dh: number }
  | { type: 'ungroup'; groupId: string }
  | { type: 'toggle-lock-group'; groupId: string }
  | { type: 'smart-arrange'; groupId?: string }
  | { type: 'detach-tile'; tileId: string }
  | { type: 'set-status'; status: string; snapLabel?: string };

export function workspaceReducer(state: WorkspaceEditorState, action: WorkspaceAction): WorkspaceEditorState {
  switch (action.type) {
    case 'select-tab':
      return { ...state, activeTabId: action.tabId, selectedTileId: null, selectedGroupId: null };
    case 'add-tab':
      return { ...state, tabs: [...state.tabs, action.tab], activeTabId: action.tab.id, selectedTileId: null, selectedGroupId: null };
    case 'close-tab':
      return closeTab(state, action.tabId);
    case 'rename-tab':
      return updateActiveTab(state, (tab) => ({ ...tab, name: action.name }));
    case 'set-channel':
      return updateActiveTab(state, (tab) => ({ ...tab, channelId: action.channelId }));
    case 'set-theme':
      return updateActiveTab(state, (tab) => ({ ...tab, theme: action.theme }));
    case 'set-grid':
      return updateActiveTab(state, (tab) => ({
        ...tab,
        layout: { ...tab.layout, grid: { ...tab.layout.grid, ...action.grid } },
      }));
    case 'select-tile':
      return selectTile(state, action.tileId);
    case 'add-tile':
      return addTile(state, action.appId, action.x, action.y);
    case 'replace-layout':
      return updateActiveTab(
        { ...state, selectedTileId: action.selectedTileId ?? state.selectedTileId, selectedGroupId: null },
        (tab) => ({ ...tab, layout: normalizeLayout(action.layout) }),
      );
    case 'remove-tile':
      return updateActiveTab(state, (tab) => ({
        ...tab,
        layout: normalizeLayout({
          ...tab.layout,
          tiles: tab.layout.tiles.filter((tile) => tile.id !== action.tileId),
        }),
      }));
    case 'move-tile':
      return moveTile(state, action.tileId, action.dx, action.dy, action.altKey ?? false);
    case 'resize-tile':
      return resizeTile(state, action.tileId, action.edge, action.dw, action.dh, action.demagnetized ?? false);
    case 'resize-group':
      return resizeGroup(state, action.groupId, action.dw, action.dh);
    case 'ungroup':
      return updateActiveTab(state, (tab) => ({
        ...tab,
        layout: {
          ...tab.layout,
          groups: tab.layout.groups.filter((group) => group.id !== action.groupId),
          attachments: tab.layout.attachments.filter(
            (attachment) => !tab.layout.groups.find((group) => group.id === action.groupId)?.tileIds.includes(attachment.sourceTileId),
          ),
          tiles: tab.layout.tiles.map((tile) => tile.groupId === action.groupId ? { ...tile, groupId: undefined, locked: false } : tile),
        },
      }));
    case 'toggle-lock-group':
      return updateActiveTab(state, (tab) => ({
        ...tab,
        layout: {
          ...tab.layout,
          groups: tab.layout.groups.map((group) => group.id === action.groupId ? { ...group, locked: !group.locked } : group),
          tiles: tab.layout.tiles.map((tile) => tile.groupId === action.groupId ? { ...tile, locked: !tab.layout.groups.find((group) => group.id === action.groupId)?.locked } : tile),
        },
      }));
    case 'smart-arrange':
      return smartArrange(state, action.groupId);
    case 'detach-tile':
      return updateActiveTab(state, (tab) => ({
        ...tab,
        layout: normalizeLayout({
          ...tab.layout,
          groups: tab.layout.groups.filter((group) => !group.tileIds.includes(action.tileId)),
          attachments: tab.layout.attachments.filter((attachment) => attachment.sourceTileId !== action.tileId && attachment.targetTileId !== action.tileId),
          tiles: tab.layout.tiles.map((tile) => tile.id === action.tileId ? { ...tile, groupId: undefined, locked: false } : tile),
        }),
      }));
    case 'set-status':
      return { ...state, status: action.status, snapLabel: action.snapLabel ?? '' };
    default:
      return state;
  }
}

export function getActiveTab(state: WorkspaceEditorState): WorkspaceTabModel {
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0];
}

function updateActiveTab(state: WorkspaceEditorState, updater: (tab: WorkspaceTabModel) => WorkspaceTabModel): WorkspaceEditorState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? updater(tab) : tab),
  };
}

function closeTab(state: WorkspaceEditorState, tabId: string): WorkspaceEditorState {
  if (state.tabs.length === 1) return state;
  const closingIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId = state.activeTabId === tabId
    ? (tabs[Math.max(0, closingIndex - 1)] ?? tabs[0]).id
    : state.activeTabId;
  return { ...state, tabs, activeTabId, selectedTileId: null, selectedGroupId: null };
}

function selectTile(state: WorkspaceEditorState, tileId: string | null): WorkspaceEditorState {
  const tab = getActiveTab(state);
  const tile = tab.layout.tiles.find((candidate) => candidate.id === tileId);
  return {
    ...state,
    selectedTileId: tileId,
    selectedGroupId: tile?.groupId ?? null,
  };
}

function addTile(state: WorkspaceEditorState, appId: string, x: number, y: number): WorkspaceEditorState {
  return updateActiveTab(state, (tab) => {
    const tile: WorkspaceTile = {
      id: `${tab.id}-${appId}-${Date.now()}`,
      appId,
      x: clamp(x, 0, 72),
      y: clamp(y, 0, 74),
      width: 28,
      height: 26,
      constraints: DEFAULT_TILE_CONSTRAINTS,
    };
    const snapped = snapRect(tile, tab.layout.tiles, tab.layout.grid);
    return {
      ...tab,
      layout: normalizeLayout({ ...tab.layout, tiles: [...tab.layout.tiles, { ...tile, ...snapped.rect }] }),
    };
  });
}

function moveTile(state: WorkspaceEditorState, tileId: string, dx: number, dy: number, altKey: boolean): WorkspaceEditorState {
  return updateActiveTab(state, (tab) => {
    const tile = tab.layout.tiles.find((candidate) => candidate.id === tileId);
    if (!tile) return tab;
    const group = tile.groupId ? tab.layout.groups.find((candidate) => candidate.id === tile.groupId) : undefined;
    const shouldMoveGroup = group && !altKey;
    const movingIds = shouldMoveGroup ? new Set(group.tileIds) : new Set([tileId]);
    const tiles = tab.layout.tiles.map((candidate) => {
      if (!movingIds.has(candidate.id)) return candidate;
      const moved = moveRect(candidate, dx, dy);
      return {
        ...candidate,
        x: clamp(moved.x, 0, 100 - candidate.width),
        y: clamp(moved.y, 0, 100 - candidate.height),
        groupId: altKey && candidate.id === tileId ? undefined : candidate.groupId,
        locked: altKey && candidate.id === tileId ? false : candidate.locked,
      };
    });
    return {
      ...tab,
      layout: normalizeLayout({
        ...tab.layout,
        groups: altKey ? tab.layout.groups.filter((candidate) => candidate.id !== tile.groupId) : tab.layout.groups,
        attachments: altKey ? tab.layout.attachments.filter((attachment) => attachment.sourceTileId !== tileId && attachment.targetTileId !== tileId) : tab.layout.attachments,
        tiles,
      }),
    };
  });
}

function resizeTile(
  state: WorkspaceEditorState,
  tileId: string,
  edge: ResizeEdge,
  dw: number,
  dh: number,
  demagnetized: boolean,
): WorkspaceEditorState {
  return updateActiveTab(state, (tab) => {
    const tile = tab.layout.tiles.find((candidate) => candidate.id === tileId);
    if (!tile || tile.locked) return tab;
    const group = tile.groupId ? tab.layout.groups.find((candidate) => candidate.id === tile.groupId) : undefined;
    if (group?.locked) return tab;

    const result = resizeWithSplit(tile, tab.layout.tiles, edge, dw, dh, demagnetized);
    return { ...tab, layout: normalizeLayout({ ...tab.layout, tiles: result.tiles }) };
  });
}

function resizeGroup(state: WorkspaceEditorState, groupId: string, dw: number, dh: number): WorkspaceEditorState {
  return updateActiveTab(state, (tab) => {
    const group = tab.layout.groups.find((candidate) => candidate.id === groupId);
    if (!group || group.locked) return tab;
    const nextWidth = clamp(group.bounds.width + dw, 10, 100 - group.bounds.x);
    const nextHeight = clamp(group.bounds.height + dh, 10, 100 - group.bounds.y);
    const scaleX = nextWidth / group.bounds.width;
    const scaleY = nextHeight / group.bounds.height;

    return {
      ...tab,
      layout: normalizeLayout({
        ...tab.layout,
        tiles: tab.layout.tiles.map((tile) => {
          if (!group.tileIds.includes(tile.id)) return tile;
          return {
            ...tile,
            x: group.bounds.x + (tile.x - group.bounds.x) * scaleX,
            y: group.bounds.y + (tile.y - group.bounds.y) * scaleY,
            width: tile.width * scaleX,
            height: tile.height * scaleY,
          };
        }),
      }),
    };
  });
}

function smartArrange(state: WorkspaceEditorState, groupId?: string): WorkspaceEditorState {
  return updateActiveTab(state, (tab) => {
    const targetIds = groupId
      ? new Set(tab.layout.groups.find((group) => group.id === groupId)?.tileIds ?? [])
      : new Set(tab.layout.tiles.map((tile) => tile.id));
    const targets = tab.layout.tiles.filter((tile) => targetIds.has(tile.id));
    const arranged = autoArrange(targets);
    const byId = new Map(arranged.map((tile) => [tile.id, tile]));
    return {
      ...tab,
      layout: normalizeLayout({
        ...tab.layout,
        tiles: tab.layout.tiles.map((tile) => byId.get(tile.id) ?? tile),
      }),
    };
  });
}

function autoArrange(tiles: WorkspaceTile[]): WorkspaceTile[] {
  if (tiles.length === 0) return [];
  const columns = Math.min(3, Math.ceil(Math.sqrt(tiles.length)));
  const rows = Math.ceil(tiles.length / columns);
  const gap = 2;
  const width = (100 - gap * (columns - 1)) / columns;
  const height = (100 - gap * (rows - 1)) / rows;
  return tiles.map((tile, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return { ...tile, x: column * (width + gap), y: row * (height + gap), width, height };
  });
}
