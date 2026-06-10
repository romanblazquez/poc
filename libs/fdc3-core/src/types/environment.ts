export interface EnvironmentProfile {
  id: string;
  name: string;
  color?: string;
  description?: string;
  /** Remote URL for the app directory (https:// or file://). If omitted, uses local override or bundled default. */
  appDirectoryUrl?: string;
}

export interface EnvironmentSettings {
  activeId: string | null;
  profiles: EnvironmentProfile[];
}
