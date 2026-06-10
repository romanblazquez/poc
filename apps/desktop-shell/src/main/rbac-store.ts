import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { RbacConfig } from '@fdc3-poc/fdc3-core';

const RBAC_FILE = 'rbac.json';

const ALL_CHANNEL_IDS = [
  'channel-1', 'channel-2', 'channel-3', 'channel-4',
  'channel-5', 'channel-6', 'channel-7', 'channel-8',
];

const ALL_INTENTS = [
  'ViewChart', 'ViewContact', 'ViewPortfolio', 'ViewOrders',
  'SendOrder', 'ViewInstrument', 'StartChat', 'ViewNews',
];

export const DEFAULT_RBAC: RbacConfig = {
  roles: {
    Admin:      { allowedApps: [], blockedApps: [], allowedChannels: ALL_CHANNEL_IDS, blockedIntentRaise: [], blockedIntentHandle: [] },
    Trader:     { allowedApps: [], blockedApps: [], allowedChannels: ALL_CHANNEL_IDS, blockedIntentRaise: [], blockedIntentHandle: ['SendOrder'] },
    Compliance: { allowedApps: [], blockedApps: [], allowedChannels: ALL_CHANNEL_IDS, blockedIntentRaise: ['SendOrder'], blockedIntentHandle: ['SendOrder'] },
    ReadOnly:   { allowedApps: [], blockedApps: [], allowedChannels: [], blockedIntentRaise: ALL_INTENTS, blockedIntentHandle: ALL_INTENTS },
  },
  users: [{ id: '1', name: 'Demo User', role: 'Trader' }],
};

export class RbacStore {
  private readonly filePath = path.join(app.getPath('userData'), RBAC_FILE);
  private config: RbacConfig = DEFAULT_RBAC;

  constructor() {
    this.config = this.read();
  }

  get(): RbacConfig {
    return JSON.parse(JSON.stringify(this.config)) as RbacConfig;
  }

  save(config: RbacConfig): RbacConfig {
    this.config = config;
    this.write(config);
    return this.get();
  }

  private read(): RbacConfig {
    try {
      if (!fs.existsSync(this.filePath)) return { ...DEFAULT_RBAC };
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as RbacConfig;
    } catch (e) {
      console.warn(`[rbac-store] failed to read: ${(e as Error).message}`);
      return { ...DEFAULT_RBAC };
    }
  }

  private write(config: RbacConfig): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    } catch (e) {
      console.warn(`[rbac-store] failed to write: ${(e as Error).message}`);
    }
  }
}
