import { clamp, normalizeRect, type Rect } from '../model/geometry.js';
import type { WorkspaceLayout, WorkspaceTile } from '../model/workspace-types.js';
import { DEFAULT_TILE_CONSTRAINTS } from '../model/workspace-types.js';
import { getDropPreview, type DropPreview } from './drop-zone-engine.js';
import { normalizeLayout } from './layout-normalizer.js';

type SplitDirection = 'left' | 'right' | 'top' | 'bottom';

export interface ApplyDropOperationParams {
  layout: WorkspaceLayout;
  preview: DropPreview;
  tile: WorkspaceTile;
  replacingTileId?: string;
}

export function applyDropOperation({
  layout,
  preview,
  tile,
  replacingTileId,
}: ApplyDropOperationParams): WorkspaceLayout {
  const baseLayout = replacingTileId
    ? { ...layout, tiles: layout.tiles.filter((candidate) => candidate.id !== replacingTileId) }
    : layout;

  if (preview.targetTileId && preview.zone.startsWith('tile-') && preview.zone !== 'tile-center') {
    return splitTile(baseLayout, preview.targetTileId, preview.zone.replace('tile-', '') as SplitDirection, tile);
  }

  if (preview.targetGroupId && preview.zone.startsWith('group-')) {
    return insertAroundGroup(baseLayout, preview.targetGroupId, preview.zone.replace('group-', '') as SplitDirection, tile);
  }

  if (preview.zone === 'tile-center' && preview.targetTileId) {
    return normalizeLayout({
      ...baseLayout,
      tiles: baseLayout.tiles.map((candidate) => (
        candidate.id === preview.targetTileId
          ? { ...tile, ...candidate, id: tile.id, appId: tile.appId, constraints: tile.constraints ?? DEFAULT_TILE_CONSTRAINTS }
          : candidate
      )),
    });
  }

  return normalizeLayout({
    ...baseLayout,
    tiles: [
      ...baseLayout.tiles,
      {
        ...tile,
        ...preview.previewRect,
        constraints: tile.constraints ?? DEFAULT_TILE_CONSTRAINTS,
      },
    ],
  });
}

export function splitTile(
  layout: WorkspaceLayout,
  targetTileId: string,
  direction: SplitDirection,
  newTile: WorkspaceTile,
): WorkspaceLayout {
  const target = layout.tiles.find((tile) => tile.id === targetTileId);
  if (!target) return layout;

  const horizontal = direction === 'left' || direction === 'right';
  const firstRect: Rect = horizontal
    ? { x: target.x, y: target.y, width: target.width / 2, height: target.height }
    : { x: target.x, y: target.y, width: target.width, height: target.height / 2 };
  const secondRect: Rect = horizontal
    ? { x: target.x + target.width / 2, y: target.y, width: target.width / 2, height: target.height }
    : { x: target.x, y: target.y + target.height / 2, width: target.width, height: target.height / 2 };

  const newRect = direction === 'left' || direction === 'top' ? firstRect : secondRect;
  const targetRect = direction === 'left' || direction === 'top' ? secondRect : firstRect;

  return normalizeLayout({
    ...layout,
    tiles: [
      ...layout.tiles.map((tile) => tile.id === targetTileId ? { ...tile, ...normalizeRect(targetRect) } : tile),
      { ...newTile, ...normalizeRect(newRect), constraints: newTile.constraints ?? DEFAULT_TILE_CONSTRAINTS },
    ],
  });
}

export function insertAroundGroup(
  layout: WorkspaceLayout,
  targetGroupId: string,
  direction: SplitDirection,
  newTile: WorkspaceTile,
): WorkspaceLayout {
  const group = layout.groups.find((candidate) => candidate.id === targetGroupId);
  if (!group) return layout;

  const groupIds = new Set(group.tileIds);
  const horizontal = direction === 'left' || direction === 'right';
  const newRect: Rect = horizontal
    ? {
        x: direction === 'left' ? group.bounds.x : group.bounds.x + group.bounds.width * 2 / 3,
        y: group.bounds.y,
        width: group.bounds.width / 3,
        height: group.bounds.height,
      }
    : {
        x: group.bounds.x,
        y: direction === 'top' ? group.bounds.y : group.bounds.y + group.bounds.height * 2 / 3,
        width: group.bounds.width,
        height: group.bounds.height / 3,
      };
  const resizedBounds: Rect = horizontal
    ? {
        x: direction === 'left' ? group.bounds.x + group.bounds.width / 3 : group.bounds.x,
        y: group.bounds.y,
        width: group.bounds.width * 2 / 3,
        height: group.bounds.height,
      }
    : {
        x: group.bounds.x,
        y: direction === 'top' ? group.bounds.y + group.bounds.height / 3 : group.bounds.y,
        width: group.bounds.width,
        height: group.bounds.height * 2 / 3,
      };

  return normalizeLayout({
    ...layout,
    tiles: [
      ...layout.tiles.map((tile) => {
        if (!groupIds.has(tile.id)) return tile;
        const scaleX = resizedBounds.width / group.bounds.width;
        const scaleY = resizedBounds.height / group.bounds.height;
        return {
          ...tile,
          ...normalizeRect({
            x: resizedBounds.x + (tile.x - group.bounds.x) * scaleX,
            y: resizedBounds.y + (tile.y - group.bounds.y) * scaleY,
            width: tile.width * scaleX,
            height: tile.height * scaleY,
          }),
        };
      }),
      { ...newTile, ...normalizeRect(newRect), constraints: newTile.constraints ?? DEFAULT_TILE_CONSTRAINTS },
    ],
  });
}

export function makeTileForDrop(appId: string, idPrefix: string, rect: Rect): WorkspaceTile {
  return {
    id: `${idPrefix}-${appId}-${Date.now()}`,
    appId,
    x: clamp(rect.x, 0, 88),
    y: clamp(rect.y, 0, 90),
    width: rect.width,
    height: rect.height,
    constraints: DEFAULT_TILE_CONSTRAINTS,
  };
}

export { getDropPreview, normalizeLayout };
