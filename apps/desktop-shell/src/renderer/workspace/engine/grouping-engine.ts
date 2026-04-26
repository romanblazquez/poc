import { bottom, rangesOverlap, right, unionRects } from '../model/geometry.js';
import type { EdgeAttachment, WorkspaceGroup, WorkspaceTile } from '../model/workspace-types.js';

const ATTACH_DISTANCE = 1.5;

export function deriveAttachments(tiles: WorkspaceTile[]): EdgeAttachment[] {
  const attachments: EdgeAttachment[] = [];

  for (const source of tiles) {
    for (const target of tiles) {
      if (source.id === target.id) continue;

      const verticalOverlap = rangesOverlap(source.y, bottom(source), target.y, bottom(target));
      const horizontalOverlap = rangesOverlap(source.x, right(source), target.x, right(target));

      if (verticalOverlap && Math.abs(right(source) - target.x) <= ATTACH_DISTANCE) {
        attachments.push(makeAttachment(source.id, 'right', target.id, 'left'));
      }
      if (verticalOverlap && Math.abs(source.x - right(target)) <= ATTACH_DISTANCE) {
        attachments.push(makeAttachment(source.id, 'left', target.id, 'right'));
      }
      if (horizontalOverlap && Math.abs(bottom(source) - target.y) <= ATTACH_DISTANCE) {
        attachments.push(makeAttachment(source.id, 'bottom', target.id, 'top'));
      }
      if (horizontalOverlap && Math.abs(source.y - bottom(target)) <= ATTACH_DISTANCE) {
        attachments.push(makeAttachment(source.id, 'top', target.id, 'bottom'));
      }
    }
  }

  return dedupeAttachments(attachments);
}

export function deriveGroups(tiles: WorkspaceTile[], attachments: EdgeAttachment[]): WorkspaceGroup[] {
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  const adjacency = new Map<string, Set<string>>();

  for (const tile of tiles) adjacency.set(tile.id, new Set());
  for (const attachment of attachments) {
    adjacency.get(attachment.sourceTileId)?.add(attachment.targetTileId);
    adjacency.get(attachment.targetTileId)?.add(attachment.sourceTileId);
  }

  const visited = new Set<string>();
  const groups: WorkspaceGroup[] = [];

  for (const tile of tiles) {
    if (visited.has(tile.id)) continue;
    const queue = [tile.id];
    const tileIds: string[] = [];
    visited.add(tile.id);

    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) continue;
      tileIds.push(next);

      for (const neighbor of adjacency.get(next) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (tileIds.length > 1) {
      const previousLocked = tileIds.some((id) => byId.get(id)?.locked);
      groups.push({
        id: groupIdFor(tileIds),
        tileIds,
        bounds: unionRects(tileIds.map((id) => byId.get(id)!).filter(Boolean)),
        locked: previousLocked,
      });
    }
  }

  return groups;
}

export function normalizeGroups(tiles: WorkspaceTile[], previousGroups: WorkspaceGroup[] = []): {
  tiles: WorkspaceTile[];
  groups: WorkspaceGroup[];
  attachments: EdgeAttachment[];
} {
  const attachments = deriveAttachments(tiles);
  const groups = deriveGroups(tiles, attachments).map((group) => {
    const previous = previousGroups.find((candidate) => sameTileSet(candidate.tileIds, group.tileIds));
    return { ...group, id: previous?.id ?? group.id, locked: previous?.locked ?? group.locked };
  });
  const groupByTile = new Map(groups.flatMap((group) => group.tileIds.map((tileId) => [tileId, group] as const)));

  return {
    attachments,
    groups,
    tiles: tiles.map((tile) => {
      const group = groupByTile.get(tile.id);
      return { ...tile, groupId: group?.id, locked: group?.locked };
    }),
  };
}

function makeAttachment(
  sourceTileId: string,
  sourceEdge: EdgeAttachment['sourceEdge'],
  targetTileId: string,
  targetEdge: EdgeAttachment['targetEdge'],
): EdgeAttachment {
  return {
    id: `${sourceTileId}:${sourceEdge}->${targetTileId}:${targetEdge}`,
    sourceTileId,
    sourceEdge,
    targetTileId,
    targetEdge,
  };
}

function dedupeAttachments(attachments: EdgeAttachment[]): EdgeAttachment[] {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = [attachment.sourceTileId, attachment.sourceEdge, attachment.targetTileId, attachment.targetEdge].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupIdFor(tileIds: string[]): string {
  return `group:${[...tileIds].sort().join('|')}`;
}

function sameTileSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

