import type { BridgeProfile } from './bridge.js';

/**
 * IT-managed bootstrap config — shipped as config/fdc3-config.json in the app's
 * install directory. Deployed via SCCM / Intune / GPO alongside the installer.
 *
 * Priority chain (highest → lowest):
 *   user saved settings  →  bootstrap  →  hardcoded defaults
 *
 * App directory priority per environment:
 *   userData/app-directory-<envId>.json  (user edits)
 *   config/app-directory-<envId>.json    (IT-managed, this file)
 *   config/app-directory.json            (bundled dev baseline)
 */
export interface FDC3BootstrapConfig {
  environments?: {
    /** Environment id to activate on first launch. */
    default?: string;
    profiles?: Array<{
      id: string;
      name: string;
      color?: string;
      description?: string;
    }>;
  };
  bridge?: {
    host?: string;
    port?: number;
    enabled?: boolean;
    profiles?: Array<Omit<BridgeProfile, 'id'>>;
  };
}
