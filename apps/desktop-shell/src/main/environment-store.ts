import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { AppDefinition, EnvironmentProfile, EnvironmentSettings } from '@fdc3-poc/fdc3-core';

const SETTINGS_FILE = 'environments.json';
const APP_DIR_PREFIX = 'app-directory-';

const DEFAULT_PROFILES: EnvironmentProfile[] = [
  { id: 'dev',  name: 'Development', color: '#4CAF50', description: 'Local development environment' },
  { id: 'uat',  name: 'UAT',         color: '#FF9800', description: 'User acceptance testing' },
  { id: 'prod', name: 'Production',  color: '#F44336', description: 'Live production environment' },
];

export class EnvironmentStore {
  private readonly settingsPath = path.join(app.getPath('userData'), SETTINGS_FILE);
  private readonly userDataDir = app.getPath('userData');
  private settings: EnvironmentSettings;

  constructor() {
    this.settings = this.read();
  }

  getAll(): EnvironmentProfile[] {
    return [...this.settings.profiles];
  }

  getActiveId(): string | null {
    return this.settings.activeId;
  }

  getActive(): EnvironmentProfile | null {
    const { activeId, profiles } = this.settings;
    if (!activeId) return null;
    return profiles.find((p) => p.id === activeId) ?? null;
  }

  add(data: Omit<EnvironmentProfile, 'id'>): EnvironmentProfile {
    const profile: EnvironmentProfile = { id: randomUUID(), ...data };
    this.settings = { ...this.settings, profiles: [...this.settings.profiles, profile] };
    this.write();
    return { ...profile };
  }

  update(id: string, patch: Partial<Omit<EnvironmentProfile, 'id'>>): EnvironmentProfile | null {
    const idx = this.settings.profiles.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const updated = { ...this.settings.profiles[idx], ...patch };
    const profiles = [...this.settings.profiles];
    profiles[idx] = updated;
    this.settings = { ...this.settings, profiles };
    this.write();
    return { ...updated };
  }

  delete(id: string): boolean {
    const idx = this.settings.profiles.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    const profiles = this.settings.profiles.filter((p) => p.id !== id);
    const activeId = this.settings.activeId === id ? null : this.settings.activeId;
    this.settings = { ...this.settings, profiles, activeId };
    this.write();
    return true;
  }

  activate(id: string): EnvironmentProfile | null {
    const profile = this.settings.profiles.find((p) => p.id === id);
    if (!profile) return null;
    this.settings = { ...this.settings, activeId: id };
    this.write();
    return { ...profile };
  }

  /**
   * Persist the current in-memory app directory to the active env's file.
   * Called on every APP_DIRECTORY_SAVE so edits survive an env switch.
   */
  saveAppDirectory(apps: AppDefinition[]): void {
    const activeId = this.settings.activeId;
    if (!activeId) return;
    const filePath = this.appDirPath(activeId);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(apps, null, 2)}\n`, 'utf-8');
    } catch (err) {
      console.warn(`[env-store] failed to save app directory for env ${activeId}: ${(err as Error).message}`);
    }
  }

  /**
   * Load the app directory for the currently active env.
   * Returns null if no active env or no persisted file (caller should fall back to bundled).
   */
  loadActiveAppDirectory(): AppDefinition[] | null {
    const activeId = this.settings.activeId;
    if (!activeId) return null;
    return this.loadAppDirectoryForId(activeId);
  }

  /** Load for a specific env id — used on activate to hot-swap directory. */
  loadAppDirectoryForId(id: string): AppDefinition[] | null {
    const filePath = this.appDirPath(id);
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as AppDefinition[];
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {
      console.warn(`[env-store] failed to load app directory for env ${id}: ${(err as Error).message}`);
    }
    return null;
  }

  private appDirPath(id: string): string {
    return path.join(this.userDataDir, `${APP_DIR_PREFIX}${id}.json`);
  }

  private read(): EnvironmentSettings {
    try {
      if (!fs.existsSync(this.settingsPath)) {
        return { activeId: null, profiles: DEFAULT_PROFILES };
      }
      const parsed = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8')) as Partial<EnvironmentSettings>;
      const profiles = Array.isArray(parsed.profiles) && parsed.profiles.length > 0
        ? parsed.profiles
        : DEFAULT_PROFILES;
      const activeId = typeof parsed.activeId === 'string' ? parsed.activeId : null;
      return { activeId, profiles };
    } catch (err) {
      console.warn(`[env-store] failed to read settings: ${(err as Error).message}`);
      return { activeId: null, profiles: DEFAULT_PROFILES };
    }
  }

  private write(): void {
    try {
      fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
      fs.writeFileSync(this.settingsPath, `${JSON.stringify(this.settings, null, 2)}\n`, 'utf-8');
    } catch (err) {
      console.warn(`[env-store] failed to persist settings: ${(err as Error).message}`);
    }
  }
}
