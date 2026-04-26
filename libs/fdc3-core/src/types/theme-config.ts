import type { ThemeName } from './context.js';

export interface ThemeConfig {
  label: string;
  agGrid: string;
  dockview: string;
  dataTheme: string;
}

export const THEMES: Record<ThemeName, ThemeConfig> = {
  'dark-financial':  { label: 'Dark Financial',  agGrid: 'ag-theme-quartz-dark', dockview: 'dockview-theme-dark',  dataTheme: 'dark-financial' },
  'light-financial': { label: 'Light Financial', agGrid: 'ag-theme-quartz',      dockview: 'dockview-theme-light', dataTheme: 'light-financial' },
  'high-contrast':   { label: 'High Contrast',   agGrid: 'ag-theme-quartz-dark', dockview: 'dockview-theme-dark',  dataTheme: 'high-contrast' },
  'luxury-neutral':  { label: 'Luxury Neutral',  agGrid: 'ag-theme-quartz',      dockview: 'dockview-theme-light', dataTheme: 'luxury-neutral' },
};
