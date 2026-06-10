export interface RolePermissions {
  allowedApps: string[];
  blockedApps: string[];
  allowedChannels: string[];
  blockedIntentRaise: string[];
  blockedIntentHandle: string[];
}

export interface UserRecord {
  id: string;
  name: string;
  role: string;
}

export interface RbacConfig {
  roles: Record<string, RolePermissions>;
  users: UserRecord[];
}
