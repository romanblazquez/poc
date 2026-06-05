import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { ManagerSettings } from '@fdc3-poc/fdc3-core';

const SETTINGS_FILE = 'manager-settings.json';

const DEFAULT_SETTINGS: ManagerSettings = {
  directoryUrl: '',
  refreshIntervalMs: 0,
  currentRole: 'default',
  telemetryEndpoint: '',
};

/**
 * Persists the Manager Console settings (directory URL, refresh interval,
 * active user role, telemetry endpoint) to `userData/manager-settings.json`
 * so they survive shell restart. Async-safe — writes are awaited so the main
 * process doesn't lose state on quick quits.
 *
 * The store is small and infrequently changed; we deliberately keep it as a
 * plain JSON file rather than a key-value DB so an admin can also push a
 * pre-baked settings file when provisioning a new desktop.
 */
export class ManagerSettingsStore {
  private settings: ManagerSettings;
  private readonly file: string;

  constructor() {
    this.file = path.join(app.getPath('userData'), SETTINGS_FILE);
    this.settings = this.read();
  }

  get(): ManagerSettings {
    return { ...this.settings };
  }

  update(patch: Partial<ManagerSettings>): ManagerSettings {
    this.settings = { ...this.settings, ...patch };
    this.write(this.settings);
    return { ...this.settings };
  }

  private read(): ManagerSettings {
    try {
      if (!fs.existsSync(this.file)) return { ...DEFAULT_SETTINGS };
      const raw = fs.readFileSync(this.file, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ManagerSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private write(value: ManagerSettings): void {
    try {
      fs.writeFileSync(this.file, JSON.stringify(value, null, 2));
    } catch (err) {
      console.warn('[manager-settings] write failed', err);
    }
  }
}
