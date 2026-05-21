import fs from 'fs';
import type { AppDefinition } from '@fdc3-poc/fdc3-core';
import {
  SAMPLE_APP_DIRECTORY,
  formatValidationResult,
  validateAppDirectory,
} from '@fdc3-poc/app-registry';
import type { AppDirectoryFile } from '@fdc3-poc/app-registry';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Loads the app directory from a JSON file.
 * Validates the file shape and url/devPort conventions; in dev a bad config throws,
 * in production it falls back to the bundled sample directory after logging.
 */
export class AppRegistryLoader {
  static load(filePath: string): AppDefinition[] {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`[AppRegistryLoader] ${filePath} not found — using built-in sample directory`);
        return SAMPLE_APP_DIRECTORY;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return AppRegistryLoader.failOrFallback(
          `Could not parse ${filePath} as JSON: ${(err as Error).message}`,
        );
      }

      const result = validateAppDirectory(parsed);
      if (result.warnings.length) {
        console.warn(`[AppRegistryLoader] ${filePath} warnings:\n${formatValidationResult({ ...result, errors: [] })}`);
      }
      if (!result.valid) {
        return AppRegistryLoader.failOrFallback(
          `${filePath} is invalid:\n${formatValidationResult(result)}`,
        );
      }

      const apps = (parsed as AppDirectoryFile).applications;
      console.info(`[AppRegistryLoader] Loaded ${apps.length} apps from ${filePath}`);
      return apps;
    } catch (err) {
      return AppRegistryLoader.failOrFallback(
        `Failed to load app directory: ${(err as Error).message}`,
      );
    }
  }

  private static failOrFallback(message: string): AppDefinition[] {
    if (isDev) {
      // In dev we want to surface configuration errors immediately, not silently
      // boot a different demo than the one the developer is editing.
      throw new Error(`[AppRegistryLoader] ${message}`);
    }
    console.error(`[AppRegistryLoader] ${message}\nFalling back to bundled sample directory.`);
    return SAMPLE_APP_DIRECTORY;
  }
}
