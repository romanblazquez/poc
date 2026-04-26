import type { WindowState } from './window-state.js';

/** A named snapshot of the entire desktop layout. */
export interface WorkspaceSnapshot {
  id: string;
  name: string;
  createdAt: string;
  windows: WindowState[];
}

export function createSnapshot(
  id: string,
  name: string,
  windows: WindowState[],
): WorkspaceSnapshot {
  return {
    id,
    name,
    createdAt: new Date().toISOString(),
    windows,
  };
}
