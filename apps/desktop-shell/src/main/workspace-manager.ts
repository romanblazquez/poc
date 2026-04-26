import { app } from 'electron';
import path from 'path';
import type { WorkspaceSnapshot } from '@fdc3-poc/workspace-engine';
import { LayoutStore, createSnapshot } from '@fdc3-poc/workspace-engine';
import type { WindowManager } from './window-manager.js';
import type { ChannelManager } from '@fdc3-poc/channel-engine';

/**
 * WorkspaceManager — orchestrates save / restore of the full desktop layout.
 * Delegates persistence to LayoutStore and window operations to WindowManager.
 */
export class WorkspaceManager {
  private readonly store: LayoutStore;

  constructor(
    private readonly windowManager: WindowManager,
    private readonly channelManager: ChannelManager,
  ) {
    const storagePath = path.join(app.getPath('userData'), 'fdc3-desktop-poc');
    this.store = new LayoutStore(storagePath);
  }

  save(name = 'default'): WorkspaceSnapshot {
    const windowStates = this.windowManager.snapshot().map((ws) => ({
      ...ws,
      channelId: this.channelManager.getCurrentChannelId(
        this.windowManager.findByAppId(ws.appId)?.webContents.id ?? -1,
      ),
    }));

    const snapshot = createSnapshot(
      name.toLowerCase().replace(/\s+/g, '-'),
      name,
      windowStates,
    );

    this.store.save(snapshot);
    console.info(`[WorkspaceManager] Saved workspace "${name}"`);
    return snapshot;
  }

  apply(name: string, windows: WorkspaceSnapshot['windows'], closeOtherApps: boolean, save = false): WorkspaceSnapshot {
    if (closeOtherApps) {
      this.windowManager.closeAppsNotIn(new Set(windows.map((windowState) => windowState.appId)));
    }

    const snapshot = createSnapshot(
      name.toLowerCase().trim().replace(/\s+/g, '-') || 'workspace',
      name.trim() || 'Workspace',
      windows,
    );

    this.restore(snapshot);
    if (save) {
      this.store.save(snapshot);
      console.info(`[WorkspaceManager] Saved workspace "${snapshot.name}"`);
    }
    return snapshot;
  }

  loadLatest(): WorkspaceSnapshot | null {
    return this.store.loadLatest();
  }

  restore(snapshot: WorkspaceSnapshot): void {
    for (const ws of snapshot.windows) {
      this.windowManager.restoreWindow(ws);
      if (ws.channelId) {
        const win = this.windowManager.findByAppId(ws.appId);
        if (win) {
          this.channelManager.joinChannel(win.webContents.id, ws.channelId);
        }
      }
    }
    console.info(`[WorkspaceManager] Restored workspace "${snapshot.name}"`);
  }

  list(): WorkspaceSnapshot[] {
    return this.store.list();
  }
}
