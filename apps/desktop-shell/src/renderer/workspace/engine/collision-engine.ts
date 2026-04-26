import { moveRect, rectsOverlap } from '../model/geometry.js';
import type { WorkspaceTile } from '../model/workspace-types.js';

export function resolveCollisions(tile: WorkspaceTile, siblings: WorkspaceTile[]): WorkspaceTile {
  let next = { ...tile };
  for (const sibling of siblings) {
    if (!rectsOverlap(next, sibling)) continue;
    next = { ...next, ...moveRect(next, 2, 2) };
  }
  return next;
}

