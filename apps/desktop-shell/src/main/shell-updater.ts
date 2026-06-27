/**
 * Shell binary updater — wraps electron-updater's autoUpdater for distributing
 * actual Electron installer updates (as opposed to the app-directory catalogue
 * swap handled by ManagerService).
 *
 * Flow:
 *   1. Admin builds a new installer via `build-role.mjs` (or /build in admin
 *      dashboard). The build server emits an SSE `build` event.
 *   2. The renderer's SSE handler receives the event and calls
 *      `shellChrome.shellUpdater.checkForUpdates()` via IPC.
 *   3. electron-updater fetches `latest.yml` from the releases endpoint,
 *      downloads the installer, and emits `update-downloaded`.
 *   4. ShellUpdater raises a sticky notification. Clicking "Restart & Install"
 *      calls `quitAndInstall()` — Electron exits, the installer runs, and the
 *      app restarts at the new version.
 *
 * Guard: in development (`app.isPackaged === false`) all methods are no-ops so
 * the feature never interferes with `electron-vite dev`.
 *
 * Feed URL derivation: reads `directoryUrl` from ManagerService settings
 * (e.g. `http://localhost:4476/directory?role=Trader&env=dev`), extracts the
 * origin + role, and constructs `<origin>/releases/<role>/`.
 */

import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { NotificationStore } from './notification-store.js';
import type { ManagerService } from './manager-service.js';

export interface ShellUpdaterStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'unavailable';
  version: string | null;
  progress: number | null;
  error: string | null;
  feedUrl: string | null;
}

export type ShellUpdaterStatusListener = (status: ShellUpdaterStatus) => void;

export class ShellUpdater {
  private status: ShellUpdaterStatus = {
    state: app.isPackaged ? 'idle' : 'unavailable',
    version: null,
    progress: null,
    error: null,
    feedUrl: null,
  };
  private readonly listeners = new Set<ShellUpdaterStatusListener>();

  constructor(
    private readonly manager: ManagerService,
    private readonly notifications: NotificationStore,
  ) {
    if (!app.isPackaged) return;
    this.configure();
    this.wireEvents();
  }

  private configure(): void {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // Silence the built-in electron-log integration — we surface status via our own notification system.
    autoUpdater.logger = null;
  }

  private wireEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.patch({ state: 'checking', error: null, progress: null });
    });

    autoUpdater.on('update-not-available', () => {
      this.patch({ state: 'idle', version: null });
    });

    autoUpdater.on('update-available', (info) => {
      const version = String(info.version ?? '');
      this.patch({ state: 'downloading', version, progress: 0 });
      this.notifications.raise({
        title: `Shell update v${version} downloading…`,
        body: 'A new version of the desktop shell is being downloaded in the background.',
        severity: 'info',
        sourceTitle: 'Distribution Manager',
        ttlMs: 0,
        action: { label: 'View details', shellAction: 'openManager' },
      });
    });

    autoUpdater.on('download-progress', (prog) => {
      this.patch({ state: 'downloading', progress: Math.round(prog.percent) });
    });

    autoUpdater.on('update-downloaded', (info) => {
      const version = String(info.version ?? '');
      this.patch({ state: 'ready', version, progress: 100 });
      this.notifications.raise({
        title: `Shell update v${version} ready — restart to install`,
        body: 'Download complete. Click "Restart & Install" to apply the update. The desktop will close and relaunch automatically.',
        severity: 'warning',
        sourceTitle: 'Distribution Manager',
        ttlMs: 0,
        action: { label: 'Restart & Install', shellAction: 'installShellUpdate' },
      });
    });

    autoUpdater.on('error', (err: Error) => {
      this.patch({ state: 'error', error: err.message });
      console.error('[shell-updater] autoUpdater error:', err.message);
    });
  }

  /** Derive the feed URL from the configured directory URL and set it. */
  private resolveFeedUrl(): string | null {
    const settings = this.manager.getSettings();
    const dirUrl = settings.directoryUrl;
    if (!dirUrl) return null;
    try {
      const u = new URL(dirUrl);
      const role = u.searchParams.get('role') ?? 'default';
      const feedUrl = `${u.origin}/releases/${role}/`;
      autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
      return feedUrl;
    } catch {
      return null;
    }
  }

  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged) return;
    const feedUrl = this.resolveFeedUrl();
    if (!feedUrl) {
      this.patch({ state: 'idle', error: 'No directory URL configured — cannot resolve release feed.' });
      return;
    }
    this.patch({ feedUrl, error: null });
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.patch({ state: 'error', error: (err as Error).message });
    }
  }

  /**
   * Quit and install the downloaded update. Only works when `state === 'ready'`.
   * In production this causes the app to close and the installer to run.
   */
  install(): void {
    if (!app.isPackaged) return;
    if (this.status.state !== 'ready') return;
    autoUpdater.quitAndInstall(false, true);
  }

  getStatus(): ShellUpdaterStatus {
    return { ...this.status };
  }

  subscribe(listener: ShellUpdaterStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private patch(delta: Partial<ShellUpdaterStatus>): void {
    this.status = { ...this.status, ...delta };
    const snapshot = { ...this.status };
    for (const l of this.listeners) {
      try { l(snapshot); } catch { /* ignore */ }
    }
  }
}
