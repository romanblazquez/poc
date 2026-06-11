import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { LayoutDefinition } from '@fdc3-poc/fdc3-core';

export class LayoutsStore {
  private readonly userFile: string;
  private readonly defaultFile: string;
  private layouts: LayoutDefinition[];

  constructor(configRoot: string) {
    this.userFile = path.join(app.getPath('userData'), 'layouts.json');
    this.defaultFile = path.join(configRoot, 'layouts.json');
    this.layouts = this.load();
  }

  list(): LayoutDefinition[] {
    return [...this.layouts];
  }

  save(data: { name: string; description?: string; panelIds: string[]; dockviewLayout: unknown | null }): LayoutDefinition {
    const now = Date.now();
    const layout: LayoutDefinition = {
      id: randomUUID(),
      name: data.name,
      description: data.description,
      panelIds: data.panelIds,
      dockviewLayout: data.dockviewLayout,
      createdAt: now,
      updatedAt: now,
    };
    this.layouts = [...this.layouts, layout];
    this.persist();
    return { ...layout };
  }

  update(id: string, patch: { name?: string; description?: string }): LayoutDefinition | null {
    const idx = this.layouts.findIndex((l) => l.id === id);
    if (idx < 0) return null;
    const updated = { ...this.layouts[idx], ...patch, updatedAt: Date.now() };
    this.layouts = [...this.layouts];
    this.layouts[idx] = updated;
    this.persist();
    return { ...updated };
  }

  delete(id: string): boolean {
    const target = this.layouts.find((l) => l.id === id);
    if (!target || target.isDefault) return false;
    this.layouts = this.layouts.filter((l) => l.id !== id);
    this.persist();
    return true;
  }

  private load(): LayoutDefinition[] {
    const defaults = this.loadDefaults();
    try {
      if (!fs.existsSync(this.userFile)) return defaults;
      const raw = fs.readFileSync(this.userFile, 'utf-8');
      const parsed = JSON.parse(raw) as { layouts?: LayoutDefinition[] };
      const user = (parsed.layouts ?? []).filter((l) => !l.isDefault);
      // IT defaults always come first; user-saved layouts come after.
      return [...defaults, ...user];
    } catch {
      return defaults;
    }
  }

  private loadDefaults(): LayoutDefinition[] {
    try {
      if (!fs.existsSync(this.defaultFile)) return [];
      const raw = fs.readFileSync(this.defaultFile, 'utf-8');
      const parsed = JSON.parse(raw) as { layouts?: Partial<LayoutDefinition>[] };
      const now = Date.now();
      return (parsed.layouts ?? []).map((l) => ({
        id: l.id ?? randomUUID(),
        name: l.name ?? 'Untitled',
        description: l.description,
        panelIds: l.panelIds ?? [],
        dockviewLayout: l.dockviewLayout ?? null,
        createdAt: l.createdAt ?? now,
        updatedAt: l.updatedAt ?? now,
        isDefault: true,
      }));
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      const userLayouts = this.layouts.filter((l) => !l.isDefault);
      fs.writeFileSync(this.userFile, JSON.stringify({ layouts: userLayouts }, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[layouts] failed to persist:', (e as Error).message);
    }
  }
}
