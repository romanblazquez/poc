/**
 * Manager Console contract — the io.Manager-class central distribution +
 * settings layer. Shared between the main process (where remote-directory
 * fetching, validation, caching and version tracking happen) and the renderer
 * (which surfaces the admin Settings, Update Available banner, and
 * entitlements summary in the Manager mode).
 */

/**
 * Where the currently-applied directory came from.
 *
 * - `remote`     — fetched live from `directoryUrl` this session.
 * - `cached`     — loaded from the local cache file because the remote URL
 *                  failed (offline / unreachable).
 * - `local`      — no remote URL configured; the bundled `config/app-directory.json`
 *                  is in effect.
 * - `embedded`   — fallback `SAMPLE_APP_DIRECTORY` (validator hard-failed).
 */
export type ManagerDirectorySource = 'remote' | 'cached' | 'local' | 'embedded';

export interface ManagerSettings {
  /**
   * HTTPS (or HTTP for dev) URL to a JSON app-directory file. Empty string
   * means "use the local bundled directory". Persisted to userData on save.
   */
  directoryUrl: string;
  /**
   * Auto-refresh cadence in milliseconds. 0 disables the periodic poll.
   * Even when 0, the user can trigger a refresh manually from the Manager UI.
   */
  refreshIntervalMs: number;
  /**
   * Active user role (e.g. `'trader'`, `'pm'`, `'ops'`, `'admin'`, `'default'`).
   * Drives the launcher entitlement filter — apps declaring a `roles[]` only
   * become visible to users whose role is in that list. Empty `roles[]` is
   * always visible.
   */
  currentRole: string;
  /**
   * Optional HTTPS endpoint Insights would push aggregated telemetry to.
   * Display-only for now (the full pillar will plumb the actual POST).
   */
  telemetryEndpoint: string;
  /**
   * When true, a successful fetch that produces a non-empty diff is immediately
   * applied without waiting for an admin to click "Apply update".
   * Requires ops sign-off before enabling in production environments.
   */
  autoApply: boolean;
}

/**
 * Diff between the currently-applied directory and a freshly-fetched one,
 * computed by the Manager. Drives the "Update available" banner.
 */
export interface ManagerDirectoryDiff {
  /** App ids present in the fetched copy but not the current. */
  addedApps: string[];
  /** App ids present in the current but not the fetched copy. */
  removedApps: string[];
  /** App ids present in both, but whose JSON content differs. */
  changedApps: string[];
}

/**
 * Live status snapshot. The renderer reads this on Manager mode open and on
 * every push of `ManagerDirectoryUpdated`.
 */
export interface ManagerStatus {
  source: ManagerDirectorySource;
  directoryUrl: string | null;
  directoryLabel: string | null;
  currentVersion: string | null;
  currentEtag: string | null;
  currentAppCount: number;
  lastFetchedAt: number | null;
  lastCheckedAt: number | null;
  lastFetchError: string | null;
  /** Set when a successful fetch produced a directory whose version differs. */
  available: {
    version: string | null;
    label: string | null;
    etag: string | null;
    fetchedAt: number;
    appCount: number;
    diff: ManagerDirectoryDiff;
    /**
     * When true this update was flagged as mandatory by the distribution admin.
     * If `mandatoryDeadline` is set and in the future, the renderer shows a
     * soft dismissable notice. Once the deadline has passed (or if no deadline
     * is set), a full blocking modal with countdown auto-applies.
     */
    mandatory: boolean;
    mandatoryCountdownSecs: number;
    /**
     * ISO-8601 date-time after which the update becomes a hard block.
     * null means "block immediately" (classic immediate mandatory).
     */
    mandatoryDeadline: string | null;
  } | null;
  settings: ManagerSettings;
  /** Identity used for entitlement gating. */
  identity: {
    user: string;
    host: string;
    appVersion: string;
  };
}

/**
 * The push that lands on the renderer whenever any of the status fields change.
 * Same shape as `ManagerStatus` — renderers replace their local snapshot.
 */
export type ManagerStatusUpdate = ManagerStatus;
