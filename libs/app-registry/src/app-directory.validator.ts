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
        if (isHttp) {
          try {
            const parsed = new URL(url);
            if (parsed.hostname === 'localhost' && !parsed.port) {
              errors.push(
                `${id}.url: ${url} has no port. Use file://… for packaged apps or http(s)://host:${devPort}/ for served apps.`,
              );
            }
            if (parsed.port && Number(parsed.port) !== devPort) {
              errors.push(
                `${id}.url: ${url} uses port ${parsed.port}, but devPort is ${devPort}. Keep them aligned for app identity resolution.`,
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

    if (app.adapter !== undefined) {
      validateAdapter(app.adapter, id, errors);
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

function validateAdapter(adapter: unknown, id: string, errors: string[]): void {
  if (!adapter || typeof adapter !== 'object') {
    errors.push(`${id}.adapter: must be an object if present`);
    return;
  }
  const a = adapter as { emit?: unknown; listen?: unknown };

  if (a.emit !== undefined) {
    if (!Array.isArray(a.emit)) {
      errors.push(`${id}.adapter.emit: must be an array if present`);
    } else {
      a.emit.forEach((rule, i) => {
        const where = `${id}.adapter.emit[${i}]`;
        const r = rule as { on?: { selector?: unknown; event?: unknown }; action?: unknown; intent?: unknown; context?: { type?: unknown } };
        if (!r || typeof r !== 'object') {
          errors.push(`${where}: not an object`);
          return;
        }
        if (typeof r.on?.selector !== 'string' || !r.on.selector.trim()) {
          errors.push(`${where}.on.selector: required non-empty string`);
        }
        if (typeof r.on?.event !== 'string' || !r.on.event.trim()) {
          errors.push(`${where}.on.event: required non-empty string`);
        }
        if (typeof r.context?.type !== 'string' || !r.context.type.trim()) {
          errors.push(`${where}.context.type: required non-empty string`);
        }
        if (r.action !== undefined && r.action !== 'broadcast' && r.action !== 'raiseIntent') {
          errors.push(`${where}.action: must be "broadcast" or "raiseIntent"`);
        }
        if (r.action === 'raiseIntent' && (typeof r.intent !== 'string' || !r.intent.trim())) {
          errors.push(`${where}.intent: required when action is "raiseIntent"`);
        }
      });
    }
  }

  if (a.listen !== undefined) {
    if (!Array.isArray(a.listen)) {
      errors.push(`${id}.adapter.listen: must be an array if present`);
    } else {
      a.listen.forEach((rule, i) => {
        const where = `${id}.adapter.listen[${i}]`;
        const r = rule as { contextType?: unknown; apply?: unknown };
        if (!r || typeof r !== 'object') {
          errors.push(`${where}: not an object`);
          return;
        }
        if (typeof r.contextType !== 'string' || !r.contextType.trim()) {
          errors.push(`${where}.contextType: required non-empty string`);
        }
        if (!Array.isArray(r.apply)) {
          errors.push(`${where}.apply: required array of steps`);
        } else {
          (r.apply as Array<{ from?: unknown; selector?: unknown }>).forEach((step, j) => {
            if (typeof step?.from !== 'string' || !step.from.trim()) {
              errors.push(`${where}.apply[${j}].from: required non-empty string`);
            }
            if (typeof step?.selector !== 'string' || !step.selector.trim()) {
              errors.push(`${where}.apply[${j}].selector: required non-empty string`);
            }
          });
        }
      });
    }
  }
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
