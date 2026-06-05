/**
 * JSON schema types for the app-directory.json configuration file.
 * Validated at load time by AppRegistry.
 */
import type { AppDefinition } from '@fdc3-poc/fdc3-core';

export interface AppDirectoryFile {
  /** Schema version for forward-compatibility */
  version: '1.0';
  /**
   * Optional version string for the directory CONTENTS — Manager Console uses
   * this to detect when a newly-fetched remote directory differs from the
   * currently-applied one. Free-form (semver, ISO date, git hash, etc).
   */
  directoryVersion?: string;
  /** Optional human-readable label shown in the Manager Console (e.g. "Prod-2026Q2"). */
  directoryLabel?: string;
  /** Array of app descriptors */
  applications: AppDefinition[];
}
