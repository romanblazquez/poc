import type { WorkspaceTile } from './workspace-types.js';

export function getMinWidth(tile: WorkspaceTile): number {
  return tile.constraints.minWidth;
}

export function getMinHeight(tile: WorkspaceTile): number {
  return tile.constraints.minHeight;
}

