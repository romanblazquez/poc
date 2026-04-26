import type { Edge, Rect } from './geometry.js';
import type { InteropFlowDefinition } from '../../interop-flow/model/interop-flow-types.js';

export interface TileConstraints {
  minWidth: number;
  minHeight: number;
}

export interface WorkspaceTile extends Rect {
  id: string;
  appId: string;
  groupId?: string;
  locked?: boolean;
  constraints: TileConstraints;
}

export interface WorkspaceGroup {
  id: string;
  tileIds: string[];
  bounds: Rect;
  locked?: boolean;
}

export interface EdgeAttachment {
  id: string;
  sourceTileId: string;
  sourceEdge: Edge;
  targetTileId: string;
  targetEdge: Edge;
}

export interface WorkspaceGridSettings {
  enabled: boolean;
  size: number;
  snap: boolean;
}

export interface WorkspaceLayout {
  tiles: WorkspaceTile[];
  groups: WorkspaceGroup[];
  attachments: EdgeAttachment[];
  grid: WorkspaceGridSettings;
}

export interface WorkspaceTabModel {
  id: string;
  name: string;
  channelId: string;
  theme: 'light' | 'dark';
  layout: WorkspaceLayout;
  interopFlow?: InteropFlowDefinition;
}

export interface WorkspaceEditorState {
  tabs: WorkspaceTabModel[];
  activeTabId: string;
  selectedTileId: string | null;
  selectedGroupId: string | null;
  status: string;
  snapLabel: string;
}

export interface WorkspaceEditorSnapshot {
  tabs: WorkspaceTabModel[];
  activeTabId: string;
}

export interface DragDelta {
  dx: number;
  dy: number;
  altKey?: boolean;
}

export const DEFAULT_TILE_CONSTRAINTS: TileConstraints = {
  minWidth: 12,
  minHeight: 10,
};
