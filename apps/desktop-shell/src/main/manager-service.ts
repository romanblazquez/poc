import { app } from 'electron';
import os from 'os';
import type { AppDefinition } from '@fdc3-poc/fdc3-core';
import type {
  ManagerDirectorySource,
  ManagerSettings,
  ManagerStatus,
} from '@fdc3-poc/fdc3-core';
import type { AppDirectoryFile } from '@fdc3-poc/app-registry';
import { ManagerSettingsStore } from './manager-settings.js';
import { RemoteDirectoryClient, diffDirectories } from './remote-directory.js';
import type { RemoteFetchResult } from './remote-directory.js';

/**
 * Manager Console domain — single source of truth for which app directory is
 * currently "applied" plus whether a newer remote version is "available" but
 * not yet adopted.
 *
 * The shell's `AppRegistry`, `WindowManager`, `IntentRegistry` etc all read
 * from the applied list; adopting an update means calling `applyAvailable()`
 * which atomically swaps the active list and notifies the renderer.
 *
 * Subscribers get a `ManagerStatus` push whenever the status changes so the
 * Manager Console UI and the Insights/Launcher banners stay in sync without
 * polling.
 */
export type ManagerStatusListener = (status: ManagerStatus) => void;
export type ManagerAutoApplyListener = (apps: AppDefinition[]) => void;

interface AvailableUpdate {
  file: AppDirectoryFile;
  version: string | null;
  label: string | null;
  etag: string | null;
  fetchedAt: number;
  appCount: number;
  diff: {
    addedApps: string[];
    removedApps: string[];
    changedApps: string[];
  };
}

export class ManagerService {
  private readonly settingsStore = new ManagerSettingsStore();
  private readonly remote = new RemoteDirectoryClient();

  /** Currently-applied directory metadata (from local file at boot or post-apply). */
  private appliedFile: AppDirectoryFile;
  private appliedSource: ManagerDirectorySource;
  private appliedFetchedAt: number | null = null;
  private appliedEtag: string | null = null;
  private lastCheckedAt: number | null = null;
  private lastFetchError: string | null = null;
  private available: AvailableUpdate | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<ManagerStatusListener>();
  private readonly autoApplyListeners = new Set<ManagerAutoApplyListener>();
  private readonly identity = {
    user: this.safeUserName(),
    host: os.hostname(),
    appVersion: app.getVersion(),
  };

  constructor(initialFile: AppDirectoryFile, initialSource: ManagerDirectorySource) {
    this.appliedFile = initialFile;
    this.appliedSource = initialSource;
    this.appliedFetchedAt = initialSource === 'remote' || initialSource === 'cached' ? Date.now() : null;
    this.scheduleRefresh();
  }

  /** Current applied app list — what the rest of the shell uses. */
  getAppliedApps(): AppDefinition[] {
    return this.appliedFile.applications;
  }

  /** Current applied file (incl. directoryVersion / directoryLabel). */
  getAppliedFile(): AppDirectoryFile {
    return this.appliedFile;
  }

  getSettings(): ManagerSettings {
    return this.settingsStore.get();
  }

  updateSettings(patch: Partial<ManagerSettings>): ManagerSettings {
    const before = this.settingsStore.get();
    const after = this.settingsStore.update(patch);
    if (before.refreshIntervalMs !== after.refreshIntervalMs) this.scheduleRefresh();
    this.emit();
    return after;
  }

  /** Subscribe to status pushes. Returns an unsubscribe. */
  subscribe(listener: ManagerStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to auto-apply events (fires when autoApply=true and a diff is applied). */
  onAutoApply(listener: ManagerAutoApplyListener): () => void {
    this.autoApplyListeners.add(listener);
    return () => this.autoApplyListeners.delete(listener);
  }

  /** Build the full snapshot the renderer + IPC expects. */
  getStatus(): ManagerStatus {
    const settings = this.settingsStore.get();
    return {
      source: this.appliedSource,
      directoryUrl: settings.directoryUrl || null,
      directoryLabel: this.appliedFile.directoryLabel ?? null,
      currentVersion: this.appliedFile.directoryVersion ?? null,
      currentEtag: this.appliedEtag,
      currentAppCount: this.appliedFile.applications.length,
      lastFetchedAt: this.appliedFetchedAt,
      lastCheckedAt: this.lastCheckedAt,
      lastFetchError: this.lastFetchError,
      available: this.available
        ? {
            version: this.available.version,
            label: this.available.label,
            etag: this.available.etag,
            fetchedAt: this.available.fetchedAt,
            appCount: this.available.appCount,
            diff: this.available.diff,
          }
        : null,
      settings,
      identity: { ...this.identity },
    };
  }

  /**
   * Force a fetch from the configured directory URL. If the response is
   * structurally different from the applied directory, surfaces it as
   * "available" (does NOT auto-apply — admin click is required). On success
   * with NO diff, clears any prior `available` state.
   */
  async checkForUpdates(): Promise<RemoteFetchResult> {
    const settings = this.settingsStore.get();
    if (!settings.directoryUrl) {
      // No remote configured. Pretend success (so the UI just clears any
      // prior "available" state) but report a friendly status.
      this.lastCheckedAt = Date.now();
      this.available = null;
      this.lastFetchError = null;
      this.emit();
      return { ok: false, error: 'No remote directory URL configured', fetchedAt: this.lastCheckedAt };
    }
    const result = await this.remote.fetch(settings.directoryUrl);
    this.lastCheckedAt = result.fetchedAt;
    if (!result.ok) {
      this.lastFetchError = result.error;
      this.emit();
      return result;
    }
    this.lastFetchError = null;
    // If the fetched directory is structurally identical to the applied one,
    // discard any prior pending update — there's nothing to apply.
    const diff = diffDirectories(this.appliedFile.applications, result.file.applications);
    const same =
      diff.addedApps.length === 0 &&
      diff.removedApps.length === 0 &&
      diff.changedApps.length === 0 &&
      (result.file.directoryVersion ?? null) === (this.appliedFile.directoryVersion ?? null);
    if (same) {
      this.available = null;
      this.emit();
    } else {
      this.available = {
        file: result.file,
        version: result.file.directoryVersion ?? null,
        label: result.file.directoryLabel ?? null,
        etag: result.etag,
        fetchedAt: result.fetchedAt,
        appCount: result.file.applications.length,
        diff,
      };
      if (this.settingsStore.get().autoApply) {
        const applyResult = this.applyAvailable();
        if (applyResult.applied) {
          for (const l of this.autoApplyListeners) {
            try { l(this.appliedFile.applications); } catch { /* ignore */ }
          }
        }
      } else {
        this.emit();
      }
    }
    return result;
  }

  /** Adopt the pending available update as the applied directory. */
  applyAvailable(): { applied: boolean; reason?: string } {
    if (!this.available) return { applied: false, reason: 'No update available' };
    this.appliedFile = this.available.file;
    this.appliedSource = 'remote';
    this.appliedFetchedAt = this.available.fetchedAt;
    this.appliedEtag = this.available.etag;
    this.available = null;
    this.emit();
    return { applied: true };
  }

  /** Discard the pending update without applying. */
  dismissAvailable(): void {
    if (this.available) {
      this.available = null;
      this.emit();
    }
  }

  /** Stop the periodic poll. Called when the shell quits. */
  shutdown(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private emit(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      try { listener(status); } catch (err) { console.warn('[manager] listener threw', err); }
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    const { refreshIntervalMs, directoryUrl } = this.settingsStore.get();
    if (refreshIntervalMs <= 0 || !directoryUrl) return;
    this.refreshTimer = setInterval(() => {
      void this.checkForUpdates();
    }, refreshIntervalMs);
  }

  private safeUserName(): string {
    try { return os.userInfo().username; } catch { return 'unknown'; }
  }
}
