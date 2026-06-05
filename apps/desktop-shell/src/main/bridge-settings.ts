import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { BridgeSettings } from '@fdc3-poc/fdc3-core';

const SETTINGS_FILE = 'bridge-settings.json';

export const DEFAULT_BRIDGE_SETTINGS: BridgeSettings = {
  enabled: false,
  provider: 'finos-backplane',
  host: '127.0.0.1',
  portStart: 4475,
  portEnd: 4575,
  endpointUrl: '',
};

export class BridgeSettingsStore {
  private readonly filePath = path.join(app.getPath('userData'), SETTINGS_FILE);
  private settings: BridgeSettings = { ...DEFAULT_BRIDGE_SETTINGS };

  constructor() {
    this.settings = this.read();
  }

  get(): BridgeSettings {
    return { ...this.settings };
  }

  update(patch: Partial<BridgeSettings>): BridgeSettings {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    this.write(this.settings);
    return this.get();
  }

  private read(): BridgeSettings {
    try {
      if (!fs.existsSync(this.filePath)) return { ...DEFAULT_BRIDGE_SETTINGS };
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<BridgeSettings>;
      return normalizeSettings({ ...DEFAULT_BRIDGE_SETTINGS, ...parsed });
    } catch (error) {
      console.warn(`[bridge-settings] failed to read settings: ${(error as Error).message}`);
      return { ...DEFAULT_BRIDGE_SETTINGS };
    }
  }

  private write(settings: BridgeSettings): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
    } catch (error) {
      console.warn(`[bridge-settings] failed to persist settings: ${(error as Error).message}`);
    }
  }
}

function normalizeSettings(input: BridgeSettings): BridgeSettings {
  const host = typeof input.host === 'string' && input.host.trim() ? input.host.trim() : DEFAULT_BRIDGE_SETTINGS.host;
  const provider = input.provider === 'finos-backplane' ? input.provider : DEFAULT_BRIDGE_SETTINGS.provider;
  const rawStart = Number(input.portStart);
  const rawEnd = Number(input.portEnd);
  const portStart = clampPort(Number.isFinite(rawStart) ? rawStart : DEFAULT_BRIDGE_SETTINGS.portStart);
  const portEnd = clampPort(Number.isFinite(rawEnd) ? rawEnd : DEFAULT_BRIDGE_SETTINGS.portEnd);
  const lo = Math.min(portStart, portEnd);
  const hi = Math.max(portStart, portEnd);
  return {
    enabled: Boolean(input.enabled),
    provider,
    host,
    portStart: lo,
    portEnd: hi,
    endpointUrl: typeof input.endpointUrl === 'string' ? input.endpointUrl.trim() : '',
  };
}

function clampPort(port: number): number {
  return Math.min(65535, Math.max(1, Math.round(port)));
}
