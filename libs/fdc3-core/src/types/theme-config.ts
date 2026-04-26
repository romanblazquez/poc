import type { ThemeName } from './context.js';

export interface ThemeConfig {
  label: string;
  agGrid: string;
  dockview: string;
  dataTheme: string;
}

export const THEMES: Record<ThemeName, ThemeConfig> = {
  'quartz-dark':   { label: 'Quartz Dark',   agGrid: 'ag-theme-quartz-dark',  dockview: 'dockview-theme-dark',  dataTheme: 'dark' },
  'quartz-light':  { label: 'Quartz Light',  agGrid: 'ag-theme-quartz',       dockview: 'dockview-theme-light', dataTheme: 'light' },
  'alpine-dark':   { label: 'Alpine Dark',   agGrid: 'ag-theme-alpine-dark',  dockview: 'dockview-theme-dark',  dataTheme: 'dark' },
  'material-dark': { label: 'Material Dark', agGrid: 'ag-theme-material',     dockview: 'dockview-theme-dark',  dataTheme: 'dark' },
};
