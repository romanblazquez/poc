import fs from 'fs';
import path from 'path';
import type { WorkspaceSnapshot } from './workspace.js';

/**
 * Persists workspace snapshots to a JSON file on disk.
 * Runs in the Electron main process only.
 */
export class LayoutStore {
  private readonly filePath: string;

  constructor(storagePath: string) {
    this.filePath = path.join(storagePath, 'workspaces.json');
    this.ensureDir(storagePath);
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private readAll(): WorkspaceSnapshot[] {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as WorkspaceSnapshot[];
    } catch {
      return [];
    }
  }

  private writeAll(snapshots: WorkspaceSnapshot[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(snapshots, null, 2), 'utf-8');
  }

  save(snapshot: WorkspaceSnapshot): void {
    const all = this.readAll();
    const idx = all.findIndex((s) => s.id === snapshot.id);
    if (idx >= 0) {
      all[idx] = snapshot;
    } else {
      all.push(snapshot);
    }
    this.writeAll(all);
  }

  loadLatest(): WorkspaceSnapshot | null {
    const all = this.readAll();
    if (all.length === 0) return null;
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  loadById(id: string): WorkspaceSnapshot | null {
    return this.readAll().find((s) => s.id === id) ?? null;
  }

  list(): WorkspaceSnapshot[] {
    return this.readAll();
  }

  delete(id: string): void {
    this.writeAll(this.readAll().filter((s) => s.id !== id));
  }
}
