import type { AppDefinition } from '@fdc3-poc/fdc3-core';
import type { AppDirectoryFile } from './app-directory.schema.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const APP_ID_RE = /^[a-z][a-z0-9-]*$/;

export function validateAppDirectory(file: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!file || typeof file !== 'object') {
    return { valid: false, errors: ['app-directory: file is not an object'], warnings };
  }

  const f = file as Partial<AppDirectoryFile>;

  if (f.version !== '1.0') {
    errors.push(`app-directory.version: expected "1.0", got ${JSON.stringify(f.version)}`);
  }

  if (!Array.isArray(f.applications)) {
    errors.push('app-directory.applications: must be an array');
    return { valid: false, errors, warnings };
  }

  const seenIds = new Set<string>();
  const seenPorts = new Map<number, string>();

  f.applications.forEach((rawApp, idx) => {
    const where = `applications[${idx}]`;
    if (!rawApp || typeof rawApp !== 'object') {
      errors.push(`${where}: not an object`);
      return;
    }
    const app = rawApp as Partial<AppDefinition>;
    const id = app.appId ?? `<index ${idx}>`;

    if (typeof app.appId !== 'string' || !app.appId.trim()) {
      errors.push(`${where}.appId: required non-empty string`);
    } else if (!APP_ID_RE.test(app.appId)) {
      warnings.push(`${id}.appId: should be kebab-case ([a-z][a-z0-9-]*)`);
    } else if (seenIds.has(app.appId)) {
      errors.push(`${id}.appId: duplicate appId`);
    } else {
      seenIds.add(app.appId);
    }

    if (typeof app.title !== 'string' || !app.title.trim()) {
      errors.push(`${id}.title: required non-empty string`);
    }

    if (typeof app.url !== 'string' || !app.url.trim()) {
      errors.push(`${id}.url: required non-empty string`);
    }

    if (typeof app.devPort !== 'number' || !Number.isInteger(app.devPort) || app.devPort < 0) {
      errors.push(`${id}.devPort: required non-negative integer (use 0 for cloud apps)`);
    }

    const url = typeof app.url === 'string' ? app.url.trim() : '';
    const devPort = typeof app.devPort === 'number' ? app.devPort : -1;

    if (url && devPort >= 0) {
      const isFile = url.startsWith('file://');
      const isHttp = url.startsWith('http://') || url.startsWith('https://');

      if (!isFile && !isHttp) {
        errors.push(
          `${id}.url: must start with file://, http://, or https:// (got ${JSON.stringify(url)})`,
        );
      }

      if (devPort === 0) {
        if (!isHttp) {
          errors.push(
            `${id}: devPort=0 means "cloud app" — url must be http(s)://… (got ${JSON.stringify(url)})`,
          );
        }
      } else {
        if (!isFile) {
          errors.push(
            `${id}: devPort=${devPort} means "local Angular app" — url must be the production file:// path (got ${JSON.stringify(url)})`,
          );
        }
        if (isHttp) {
          try {
            const parsed = new URL(url);
            if (parsed.hostname === 'localhost' && !parsed.port) {
              errors.push(
                `${id}.url: ${url} has no port. For a local app set url to file://… and devPort=${devPort}.`,
              );
            }
          } catch {
            errors.push(`${id}.url: ${url} is not parseable as a URL`);
          }
        }
      }

      if (devPort > 0) {
        const prior = seenPorts.get(devPort);
        if (prior) {
          errors.push(`${id}.devPort=${devPort} clashes with ${prior}`);
        } else {
          seenPorts.set(devPort, id);
        }
      }
    }

    if (app.intents !== undefined) {
      if (!Array.isArray(app.intents)) {
        errors.push(`${id}.intents: must be an array if present`);
      } else {
        app.intents.forEach((intent, i) => {
          if (!intent || typeof intent !== 'object') {
            errors.push(`${id}.intents[${i}]: not an object`);
            return;
          }
          if (typeof intent.intent !== 'string' || !intent.intent.trim()) {
            errors.push(`${id}.intents[${i}].intent: required non-empty string`);
          }
          if (intent.contextTypes !== null && !Array.isArray(intent.contextTypes)) {
            errors.push(`${id}.intents[${i}].contextTypes: must be array or null`);
          }
        });
      }
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];
  if (result.errors.length) {
    lines.push(`${result.errors.length} error(s):`);
    for (const e of result.errors) lines.push(`  ✗ ${e}`);
  }
  if (result.warnings.length) {
    lines.push(`${result.warnings.length} warning(s):`);
    for (const w of result.warnings) lines.push(`  ⚠ ${w}`);
  }
  return lines.join('\n');
}
