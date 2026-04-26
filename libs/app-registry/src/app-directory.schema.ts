/**
 * JSON schema types for the app-directory.json configuration file.
 * Validated at load time by AppRegistry.
 */
import type { AppDefinition } from '@fdc3-poc/fdc3-core';

export interface AppDirectoryFile {
  /** Schema version for forward-compatibility */
  version: '1.0';
  /** Array of app descriptors */
  applications: AppDefinition[];
}
