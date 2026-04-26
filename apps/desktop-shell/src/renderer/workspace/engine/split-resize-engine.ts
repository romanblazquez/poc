import { bottom, clamp, rangesOverlap, right } from '../model/geometry.js';
import type { WorkspaceTile } from '../model/workspace-types.js';
import { getMinHeight, getMinWidth } from '../model/constraints.js';

export type ResizeEdge = 'right' | 'bottom' | 'corner';

export function resizeWithSplit(
  startTile: WorkspaceTile,
  startTiles: WorkspaceTile[],
  edge: ResizeEdge,
  deltaWidth: number,
  deltaHeight: number,
  demagnetized: boolean,
): { tiles: WorkspaceTile[]; label: string } {
  const byId = new Map(startTiles.map((tile) => [tile.id, { ...tile }]));
  const siblings = startTiles.filter((tile) => tile.id !== startTile.id);
  let nextTile = { ...startTile };
  let label = demagnetized ? 'Demagnetized' : '';

  if (edge === 'right' || edge === 'corner') {
    const attached = demagnetized ? [] : siblings.filter((tile) => isAttachedToRight(startTile, tile));
    let nextRight = clamp(right(startTile) + deltaWidth, startTile.x + getMinWidth(startTile), 100);

    for (const tile of attached) {
      nextRight = Math.min(nextRight, right(tile) - getMinWidth(tile));
    }

    nextTile.width = nextRight - startTile.x;
    for (const tile of attached) {
      byId.set(tile.id, { ...tile, x: right(nextTile), width: right(tile) - right(nextTile) });
      label = 'Slicing vertical split';
    }
  }

  if (edge === 'bottom' || edge === 'corner') {
    const attached = demagnetized ? [] : siblings.filter((tile) => isAttachedToBottom(startTile, tile));
    let nextBottom = clamp(bottom(startTile) + deltaHeight, startTile.y + getMinHeight(startTile), 100);

    for (const tile of attached) {
      nextBottom = Math.min(nextBottom, bottom(tile) - getMinHeight(tile));
    }

    nextTile.height = nextBottom - startTile.y;
    for (const tile of attached) {
      byId.set(tile.id, { ...tile, y: bottom(nextTile), height: bottom(tile) - bottom(nextTile) });
      label = label ? 'Slicing multiple splits' : 'Slicing horizontal split';
    }
  }

  byId.set(startTile.id, nextTile);
  return { tiles: startTiles.map((tile) => byId.get(tile.id) ?? tile), label };
}

function isAttachedToRight(active: WorkspaceTile, candidate: WorkspaceTile): boolean {
  return Math.abs(right(active) - candidate.x) <= 1.5 &&
    rangesOverlap(active.y, bottom(active), candidate.y, bottom(candidate));
}

function isAttachedToBottom(active: WorkspaceTile, candidate: WorkspaceTile): boolean {
  return Math.abs(bottom(active) - candidate.y) <= 1.5 &&
    rangesOverlap(active.x, right(active), candidate.x, right(candidate));
}

