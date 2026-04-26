import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { ThemeName } from '@fdc3-poc/fdc3-core';

const THEME_FILE_NAME = 'theme-preferences.json';
const DEFAULT_THEME: ThemeName = 'dark-financial';

const VALID_THEMES = new Set<ThemeName>([
  'dark-financial',
  'light-financial',
  'high-contrast',
  'luxury-neutral',
]);

interface ThemeFileModel {
  theme: ThemeName;
}

export class ThemeManager {
  private readonly storagePath: string;
  private currentTheme: ThemeName;

  constructor() {
    this.storagePath = path.join(app.getPath('userData'), THEME_FILE_NAME);
    this.currentTheme = this.loadTheme();
  }

  getTheme(): ThemeName {
    return this.currentTheme;
  }

  setTheme(theme: ThemeName): ThemeName {
    if (!this.isValidTheme(theme)) return this.currentTheme;
    if (this.currentTheme === theme) return this.currentTheme;

    this.currentTheme = theme;
    this.persistTheme(theme);
    return this.currentTheme;
  }

  private loadTheme(): ThemeName {
    try {
      if (!fs.existsSync(this.storagePath)) return DEFAULT_THEME;
      const raw = fs.readFileSync(this.storagePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ThemeFileModel>;
      if (parsed.theme && this.isValidTheme(parsed.theme)) {
        return parsed.theme;
      }
      return DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  }

  private persistTheme(theme: ThemeName): void {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify({ theme } satisfies ThemeFileModel), 'utf-8');
    } catch (err) {
      console.error('[theme-manager] Failed to persist theme:', err);
    }
  }

  private isValidTheme(theme: string): theme is ThemeName {
    return VALID_THEMES.has(theme as ThemeName);
  }
}
