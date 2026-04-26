import { clamp, normalizeRect } from '../model/geometry.js';
import type { WorkspaceLayout, WorkspaceTile } from '../model/workspace-types.js';
import { DEFAULT_TILE_CONSTRAINTS } from '../model/workspace-types.js';
import { normalizeGroups } from './grouping-engine.js';

export function normalizeLayout(layout: WorkspaceLayout): WorkspaceLayout {
  const tiles = layout.tiles.map(normalizeTile);
  const grouped = normalizeGroups(tiles, layout.groups);
  return {
    ...layout,
    ...grouped,
  };
}

export function normalizeTile(tile: WorkspaceTile): WorkspaceTile {
  const constraints = tile.constraints ?? DEFAULT_TILE_CONSTRAINTS;
  const rect = normalizeRect({
    x: clamp(tile.x, 0, 100 - constraints.minWidth),
    y: clamp(tile.y, 0, 100 - constraints.minHeight),
    width: clamp(tile.width, constraints.minWidth, 100 - tile.x),
    height: clamp(tile.height, constraints.minHeight, 100 - tile.y),
  });
  return { ...tile, ...rect, constraints };
}

