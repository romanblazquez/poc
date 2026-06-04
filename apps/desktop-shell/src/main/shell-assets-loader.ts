import fs from 'fs';
import path from 'path';

export interface ShellBranding {
  productMark?: string;
  accentColor?: string;
}

export interface ShellManifest {
  appId: string;
  name: string;
  title: string;
  subtitle: string;
  provider: string;
  providerVersion: string;
  description?: string;
  iconWindowPath?: string;
  iconDockPath?: string;
  branding?: ShellBranding;
}

interface ShellManifestFile {
  schemaVersion?: string;
  desktopShell?: {
    appId?: unknown;
    name?: unknown;
    title?: unknown;
    subtitle?: unknown;
    provider?: unknown;
    providerVersion?: unknown;
    description?: unknown;
    icons?: {
      window?: unknown;
      dock?: unknown;
    };
    branding?: {
      productMark?: unknown;
      accentColor?: unknown;
    };
  };
}

const DEFAULT_MANIFEST: ShellManifest = {
  appId: 'desktop-shell',
  name: 'FDC3 Desktop Shell',
  title: 'FDC3 Desktop Shell',
  subtitle: 'TRADER WORKSTATION',
  provider: 'fdc3-desktop-poc',
  providerVersion: '0.1.0',
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveIconPath(baseDir: string, iconPath: unknown): string | undefined {
  const rel = asString(iconPath);
  if (!rel) return undefined;
  const absolute = path.isAbsolute(rel) ? rel : path.resolve(baseDir, rel);
  if (!fs.existsSync(absolute)) {
    console.warn(`[ShellAssetsLoader] Icon not found: ${absolute}`);
    return undefined;
  }
  return absolute;
}

export class ShellAssetsLoader {
  static load(filePath: string, appVersion: string): ShellManifest {
    if (!fs.existsSync(filePath)) {
      console.warn(`[ShellAssetsLoader] ${filePath} not found - using defaults`);
      return { ...DEFAULT_MANIFEST, providerVersion: appVersion || DEFAULT_MANIFEST.providerVersion };
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as ShellManifestFile;
      const shell = parsed.desktopShell ?? {};
      const manifestDir = path.dirname(filePath);

      return {
        appId: asString(shell.appId) ?? DEFAULT_MANIFEST.appId,
        name: asString(shell.name) ?? DEFAULT_MANIFEST.name,
        title: asString(shell.title) ?? DEFAULT_MANIFEST.title,
        subtitle: asString(shell.subtitle) ?? DEFAULT_MANIFEST.subtitle,
        provider: asString(shell.provider) ?? DEFAULT_MANIFEST.provider,
        providerVersion: asString(shell.providerVersion) ?? appVersion ?? DEFAULT_MANIFEST.providerVersion,
        description: asString(shell.description),
        iconWindowPath: resolveIconPath(manifestDir, shell.icons?.window),
        iconDockPath: resolveIconPath(manifestDir, shell.icons?.dock),
        branding: {
          productMark: asString(shell.branding?.productMark),
          accentColor: asString(shell.branding?.accentColor),
        },
      };
    } catch (error) {
      console.error(`[ShellAssetsLoader] Failed to parse ${filePath}: ${(error as Error).message}`);
      return { ...DEFAULT_MANIFEST, providerVersion: appVersion || DEFAULT_MANIFEST.providerVersion };
    }
  }
}