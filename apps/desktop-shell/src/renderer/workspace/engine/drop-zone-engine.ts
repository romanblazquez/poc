import { bottom, clamp, normalizeRect, right, type Rect } from '../model/geometry.js';
import type { WorkspaceGroup, WorkspaceLayout, WorkspaceTile } from '../model/workspace-types.js';

export type DropZone =
  | 'canvas-left'
  | 'canvas-right'
  | 'canvas-top'
  | 'canvas-bottom'
  | 'tile-left'
  | 'tile-right'
  | 'tile-top'
  | 'tile-bottom'
  | 'tile-center'
  | 'group-left'
  | 'group-right'
  | 'group-top'
  | 'group-bottom'
  | 'freeform';

export interface DropPreview {
  zone: DropZone;
  targetTileId?: string;
  targetGroupId?: string;
  previewRect: Rect;
  affectedRects?: Record<string, Rect>;
  label: string;
}

export interface DropPreviewParams {
  layout: WorkspaceLayout;
  pointer: { x: number; y: number };
  draggedRect: Rect;
  draggedTileId?: string;
  allowFreeform?: boolean;
}

const TILE_EDGE_RATIO = 0.25;
const GROUP_EDGE_RATIO = 0.16;
const CANVAS_EDGE_THRESHOLD = 10;

export function getDropPreview({
  layout,
  pointer,
  draggedRect,
  draggedTileId,
  allowFreeform = true,
}: DropPreviewParams): DropPreview | null {
  const targetTile = topMostTileAt(layout.tiles, pointer, draggedTileId);
  if (targetTile) {
    return getTileDropPreview(targetTile, pointer);
  }

  const targetGroup = topMostGroupAt(layout.groups, pointer, draggedTileId);
  if (targetGroup) {
    const groupPreview = getGroupDropPreview(targetGroup, pointer, layout.tiles);
    if (groupPreview) return groupPreview;
  }

  const canvasPreview = getCanvasDropPreview(pointer);
  if (canvasPreview) return canvasPreview;

  if (!allowFreeform) return null;

  return {
    zone: 'freeform',
    label: 'Place',
    previewRect: normalizeRect({
      x: clamp(pointer.x - draggedRect.width / 2, 0, 100 - draggedRect.width),
      y: clamp(pointer.y - draggedRect.height / 2, 0, 100 - draggedRect.height),
      width: draggedRect.width,
      height: draggedRect.height,
    }),
  };
}

function getTileDropPreview(tile: WorkspaceTile, pointer: { x: number; y: number }): DropPreview {
  const localX = (pointer.x - tile.x) / tile.width;
  const localY = (pointer.y - tile.y) / tile.height;

  if (localX <= TILE_EDGE_RATIO) {
    return {
      zone: 'tile-left',
      targetTileId: tile.id,
      label: 'Split Left',
      previewRect: normalizeRect({ x: tile.x, y: tile.y, width: tile.width / 2, height: tile.height }),
      affectedRects: { [tile.id]: normalizeRect({ x: tile.x + tile.width / 2, y: tile.y, width: tile.width / 2, height: tile.height }) },
    };
  }

  if (localX >= 1 - TILE_EDGE_RATIO) {
    return {
      zone: 'tile-right',
      targetTileId: tile.id,
      label: 'Split Right',
      previewRect: normalizeRect({ x: tile.x + tile.width / 2, y: tile.y, width: tile.width / 2, height: tile.height }),
      affectedRects: { [tile.id]: normalizeRect({ x: tile.x, y: tile.y, width: tile.width / 2, height: tile.height }) },
    };
  }

  if (localY <= TILE_EDGE_RATIO) {
    return {
      zone: 'tile-top',
      targetTileId: tile.id,
      label: 'Split Top',
      previewRect: normalizeRect({ x: tile.x, y: tile.y, width: tile.width, height: tile.height / 2 }),
      affectedRects: { [tile.id]: normalizeRect({ x: tile.x, y: tile.y + tile.height / 2, width: tile.width, height: tile.height / 2 }) },
    };
  }

  if (localY >= 1 - TILE_EDGE_RATIO) {
    return {
      zone: 'tile-bottom',
      targetTileId: tile.id,
      label: 'Split Bottom',
      previewRect: normalizeRect({ x: tile.x, y: tile.y + tile.height / 2, width: tile.width, height: tile.height / 2 }),
      affectedRects: { [tile.id]: normalizeRect({ x: tile.x, y: tile.y, width: tile.width, height: tile.height / 2 }) },
    };
  }

  return {
    zone: 'tile-center',
    targetTileId: tile.id,
    label: 'Replace',
    previewRect: normalizeRect({ x: tile.x, y: tile.y, width: tile.width, height: tile.height }),
  };
}

function getGroupDropPreview(
  group: WorkspaceGroup,
  pointer: { x: number; y: number },
  tiles: WorkspaceTile[],
): DropPreview | null {
  const localX = (pointer.x - group.bounds.x) / group.bounds.width;
  const localY = (pointer.y - group.bounds.y) / group.bounds.height;
  const affectedRects = group.tileIds.reduce<Record<string, Rect>>((rects, tileId) => {
    const tile = tiles.find((candidate) => candidate.id === tileId);
    if (tile) rects[tile.id] = tile;
    return rects;
  }, {});

  if (localX <= GROUP_EDGE_RATIO) {
    return {
      zone: 'group-left',
      targetGroupId: group.id,
      label: 'Dock Left',
      previewRect: normalizeRect({ x: group.bounds.x, y: group.bounds.y, width: group.bounds.width / 3, height: group.bounds.height }),
      affectedRects: scaleAffected(affectedRects, group.bounds, { x: group.bounds.x + group.bounds.width / 3, y: group.bounds.y, width: group.bounds.width * 2 / 3, height: group.bounds.height }),
    };
  }

  if (localX >= 1 - GROUP_EDGE_RATIO) {
    return {
      zone: 'group-right',
      targetGroupId: group.id,
      label: 'Dock Right',
      previewRect: normalizeRect({ x: group.bounds.x + group.bounds.width * 2 / 3, y: group.bounds.y, width: group.bounds.width / 3, height: group.bounds.height }),
      affectedRects: scaleAffected(affectedRects, group.bounds, { x: group.bounds.x, y: group.bounds.y, width: group.bounds.width * 2 / 3, height: group.bounds.height }),
    };
  }

  if (localY <= GROUP_EDGE_RATIO) {
    return {
      zone: 'group-top',
      targetGroupId: group.id,
      label: 'Dock Top',
      previewRect: normalizeRect({ x: group.bounds.x, y: group.bounds.y, width: group.bounds.width, height: group.bounds.height / 3 }),
      affectedRects: scaleAffected(affectedRects, group.bounds, { x: group.bounds.x, y: group.bounds.y + group.bounds.height / 3, width: group.bounds.width, height: group.bounds.height * 2 / 3 }),
    };
  }

  if (localY >= 1 - GROUP_EDGE_RATIO) {
    return {
      zone: 'group-bottom',
      targetGroupId: group.id,
      label: 'Dock Bottom',
      previewRect: normalizeRect({ x: group.bounds.x, y: group.bounds.y + group.bounds.height * 2 / 3, width: group.bounds.width, height: group.bounds.height / 3 }),
      affectedRects: scaleAffected(affectedRects, group.bounds, { x: group.bounds.x, y: group.bounds.y, width: group.bounds.width, height: group.bounds.height * 2 / 3 }),
    };
  }

  return null;
}

function getCanvasDropPreview(pointer: { x: number; y: number }): DropPreview | null {
  if (pointer.x <= CANVAS_EDGE_THRESHOLD) {
    return { zone: 'canvas-left', label: 'Dock Left', previewRect: { x: 0, y: 0, width: 50, height: 100 } };
  }
  if (pointer.x >= 100 - CANVAS_EDGE_THRESHOLD) {
    return { zone: 'canvas-right', label: 'Dock Right', previewRect: { x: 50, y: 0, width: 50, height: 100 } };
  }
  if (pointer.y <= CANVAS_EDGE_THRESHOLD) {
    return { zone: 'canvas-top', label: 'Dock Top', previewRect: { x: 0, y: 0, width: 100, height: 50 } };
  }
  if (pointer.y >= 100 - CANVAS_EDGE_THRESHOLD) {
    return { zone: 'canvas-bottom', label: 'Dock Bottom', previewRect: { x: 0, y: 50, width: 100, height: 50 } };
  }
  return null;
}

function topMostTileAt(
  tiles: WorkspaceTile[],
  pointer: { x: number; y: number },
  ignoredTileId?: string,
): WorkspaceTile | undefined {
  return [...tiles].reverse().find((tile) => (
    tile.id !== ignoredTileId
    && pointer.x >= tile.x
    && pointer.x <= right(tile)
    && pointer.y >= tile.y
    && pointer.y <= bottom(tile)
  ));
}

function topMostGroupAt(
  groups: WorkspaceGroup[],
  pointer: { x: number; y: number },
  ignoredTileId?: string,
): WorkspaceGroup | undefined {
  return [...groups].reverse().find((group) => (
    !group.tileIds.includes(ignoredTileId ?? '')
    && pointer.x >= group.bounds.x
    && pointer.x <= right(group.bounds)
    && pointer.y >= group.bounds.y
    && pointer.y <= bottom(group.bounds)
  ));
}

function scaleAffected(rects: Record<string, Rect>, from: Rect, to: Rect): Record<string, Rect> {
  const scaleX = to.width / from.width;
  const scaleY = to.height / from.height;
  return Object.fromEntries(Object.entries(rects).map(([id, rect]) => [
    id,
    normalizeRect({
      x: to.x + (rect.x - from.x) * scaleX,
      y: to.y + (rect.y - from.y) * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
    }),
  ]));
}
