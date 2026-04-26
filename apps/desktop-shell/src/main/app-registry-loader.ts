import fs from 'fs';
import type { AppDefinition } from '@fdc3-poc/fdc3-core';
import { SAMPLE_APP_DIRECTORY } from '@fdc3-poc/app-registry';
import type { AppDirectoryFile } from '@fdc3-poc/app-registry';

/**
 * Loads the app directory from a JSON file.
 * Falls back to the bundled sample directory if the file is missing or invalid.
 */
export class AppRegistryLoader {
  static load(filePath: string): AppDefinition[] {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`[AppRegistryLoader] ${filePath} not found — using built-in sample directory`);
        return SAMPLE_APP_DIRECTORY;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as AppDirectoryFile;

      if (parsed.version !== '1.0' || !Array.isArray(parsed.applications)) {
        console.warn('[AppRegistryLoader] Invalid app-directory.json format — using sample');
        return SAMPLE_APP_DIRECTORY;
      }

      console.info(`[AppRegistryLoader] Loaded ${parsed.applications.length} apps from ${filePath}`);
      return parsed.applications;
    } catch (err) {
      console.error('[AppRegistryLoader] Failed to load app directory:', err);
      return SAMPLE_APP_DIRECTORY;
    }
  }
}
