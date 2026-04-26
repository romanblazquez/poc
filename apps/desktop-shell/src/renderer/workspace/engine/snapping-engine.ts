import { bottom, clamp, right, snapValue } from '../model/geometry.js';
import type { Rect } from '../model/geometry.js';
import type { WorkspaceGridSettings, WorkspaceTile } from '../model/workspace-types.js';

export interface SnapResult<T extends Rect> {
  rect: T;
  label: string;
}

const EDGE_DISTANCE = 3;

export function snapRect<T extends Rect>(
  rect: T,
  siblings: WorkspaceTile[],
  grid: WorkspaceGridSettings,
): SnapResult<T> {
  let next = { ...rect };
  let label = '';

  if (grid.snap) {
    const step = grid.enabled ? Math.max(1, grid.size / 12) : 2;
    next = {
      ...next,
      x: snapValue(next.x, step),
      y: snapValue(next.y, step),
      width: snapValue(next.width, step),
      height: snapValue(next.height, step),
    };
  }

  const candidates = [
    { edge: 'left', value: 0 },
    { edge: 'right', value: 100 },
    { edge: 'top', value: 0 },
    { edge: 'bottom', value: 100 },
    ...siblings.flatMap((sibling) => [
      { edge: 'left', value: sibling.x },
      { edge: 'right', value: right(sibling) },
      { edge: 'top', value: sibling.y },
      { edge: 'bottom', value: bottom(sibling) },
    ]),
  ];

  for (const candidate of candidates) {
    if ((candidate.edge === 'left' || candidate.edge === 'right') && Math.abs(next.x - candidate.value) <= EDGE_DISTANCE) {
      next = { ...next, x: candidate.value };
      label = 'Align left';
    }
    if ((candidate.edge === 'left' || candidate.edge === 'right') && Math.abs(right(next) - candidate.value) <= EDGE_DISTANCE) {
      next = { ...next, width: candidate.value - next.x };
      label = 'Align right';
    }
    if ((candidate.edge === 'top' || candidate.edge === 'bottom') && Math.abs(next.y - candidate.value) <= EDGE_DISTANCE) {
      next = { ...next, y: candidate.value };
      label = 'Align top';
    }
    if ((candidate.edge === 'top' || candidate.edge === 'bottom') && Math.abs(bottom(next) - candidate.value) <= EDGE_DISTANCE) {
      next = { ...next, height: candidate.value - next.y };
      label = 'Align bottom';
    }
  }

  return {
    rect: {
      ...next,
      width: clamp(next.width, 1, 100 - next.x),
      height: clamp(next.height, 1, 100 - next.y),
      x: clamp(next.x, 0, 100 - next.width),
      y: clamp(next.y, 0, 100 - next.height),
    },
    label,
  };
}

