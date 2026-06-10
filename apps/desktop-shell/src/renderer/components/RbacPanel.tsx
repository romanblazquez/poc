import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import type { RbacConfig, RolePermissions, UserRecord } from '@fdc3-poc/fdc3-core';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Input } from './ui/input.js';
import { Switch } from './ui/switch.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';
import { Separator } from './ui/separator.js';

interface AppEntry {
  appId: string;
  title: string;
  category?: string;
  icon?: string;
}

interface RbacPanelProps {
  apps: AppEntry[];
}

type RoleName = 'Admin' | 'Trader' | 'Compliance' | 'ReadOnly';

const ROLE_COLORS: Record<RoleName, string> = {
  Admin: '#e84080',
  Trader: 'var(--shell-accent)',
  Compliance: '#e8a040',
  ReadOnly: '#888',
};

const ALL_CHANNELS = [
  { id: 'channel-1', name: 'Red', color: '#E02020' },
  { id: 'channel-2', name: 'Orange', color: '#FF8C00' },
  { id: 'channel-3', name: 'Yellow', color: '#DAA520' },
  { id: 'channel-4', name: 'Green', color: '#2ECC71' },
  { id: 'channel-5', name: 'Blue', color: '#3498DB' },
  { id: 'channel-6', name: 'Purple', color: '#9B59B6' },
  { id: 'channel-7', name: 'Pink', color: '#FF69B4' },
  { id: 'channel-8', name: 'Teal', color: '#008080' },
];

const ALL_INTENTS = [
  'ViewChart',
  'ViewContact',
  'ViewPortfolio',
  'ViewOrders',
  'SendOrder',
  'ViewInstrument',
  'StartChat',
  'ViewNews',
];

const BUILT_IN_ROLES: RoleName[] = ['Admin', 'Trader', 'Compliance', 'ReadOnly'];

interface RbacApi {
  get(): Promise<RbacConfig | null>;
  save(config: RbacConfig): Promise<RbacConfig>;
}

function getRbacApi(): RbacApi | undefined {
  return (window as unknown as { shellChrome?: { rbac?: RbacApi } }).shellChrome?.rbac;
}

const EMPTY_RBAC: RbacConfig = { roles: {}, users: [] };

export function RbacPanel({ apps }: RbacPanelProps) {
  const [config, setConfig] = useState<RbacConfig>(EMPTY_RBAC);
  const [selectedRole, setSelectedRole] = useState<string>('Trader');
  const [addingUser, setAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<string>('Trader');

  useEffect(() => {
    void getRbacApi()?.get().then((loaded) => {
      if (loaded) setConfig(loaded);
    });
  }, []);

  function updateConfig(next: RbacConfig) {
    setConfig(next);
    void getRbacApi()?.save(next);
  }

  function getRolePerms(role: string): RolePermissions {
    return config.roles[role] ?? {
      allowedApps: [],
      blockedApps: [],
      allowedChannels: [],
      blockedIntentRaise: [],
      blockedIntentHandle: [],
    };
  }

  function setRolePerms(role: string, perms: RolePermissions) {
    updateConfig({
      ...config,
      roles: { ...config.roles, [role]: perms },
    });
  }

  function isAppBlocked(role: string, appId: string): boolean {
    const perms = getRolePerms(role);
    return perms.blockedApps.includes(appId);
  }

  function toggleApp(role: string, appId: string, enabled: boolean) {
    const perms = getRolePerms(role);
    const blockedApps = enabled
      ? perms.blockedApps.filter((id) => id !== appId)
      : [...perms.blockedApps, appId];
    setRolePerms(role, { ...perms, blockedApps });
  }

  function isChannelAllowed(role: string, channelId: string): boolean {
    const perms = getRolePerms(role);
    return perms.allowedChannels.includes(channelId);
  }

  function toggleChannel(role: string, channelId: string, allowed: boolean) {
    const perms = getRolePerms(role);
    const allowedChannels = allowed
      ? [...perms.allowedChannels, channelId]
      : perms.allowedChannels.filter((id) => id !== channelId);
    setRolePerms(role, { ...perms, allowedChannels });
  }

  function canRaiseIntent(role: string, intent: string): boolean {
    return !getRolePerms(role).blockedIntentRaise.includes(intent);
  }

  function canHandleIntent(role: string, intent: string): boolean {
    return !getRolePerms(role).blockedIntentHandle.includes(intent);
  }

  function toggleIntentRaise(role: string, intent: string, allowed: boolean) {
    const perms = getRolePerms(role);
    const blockedIntentRaise = allowed
      ? perms.blockedIntentRaise.filter((i) => i !== intent)
      : [...perms.blockedIntentRaise, intent];
    setRolePerms(role, { ...perms, blockedIntentRaise });
  }

  function toggleIntentHandle(role: string, intent: string, allowed: boolean) {
    const perms = getRolePerms(role);
    const blockedIntentHandle = allowed
      ? perms.blockedIntentHandle.filter((i) => i !== intent)
      : [...perms.blockedIntentHandle, intent];
    setRolePerms(role, { ...perms, blockedIntentHandle });
  }

  function getUserCountForRole(role: string): number {
    return config.users.filter((u) => u.role === role).length;
  }

  function addUser() {
    if (!newUserName.trim()) return;
    const user: UserRecord = {
      id: Date.now().toString(36),
      name: newUserName.trim(),
      role: newUserRole,
    };
    updateConfig({ ...config, users: [...config.users, user] });
    setNewUserName('');
    setNewUserRole('Trader');
    setAddingUser(false);
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Left sidebar: roles + users */}
      <aside className="flex w-64 shrink-0 flex-col gap-0 overflow-y-auto border-r bg-card scrollbar-thin">
        <div className="px-3 pt-4 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Roles
          </h2>
        </div>

        {BUILT_IN_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setSelectedRole(role)}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
              selectedRole === role
                ? 'bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: ROLE_COLORS[role as RoleName] ?? '#888' }}
            />
            <span className="flex-1 font-medium">{role}</span>
            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
              {getUserCountForRole(role)}
            </Badge>
          </button>
        ))}

        <Separator className="my-2" />

        <div className="px-3 pb-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Users
          </h2>
        </div>

        {config.users.map((user) => (
          <div key={user.id} className="flex items-center gap-2 px-3 py-1.5">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
              style={{
                backgroundColor:
                  ROLE_COLORS[user.role as RoleName] ?? '#888',
              }}
            >
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{user.name}</div>
              <div className="text-[10px] text-muted-foreground">{user.role}</div>
            </div>
          </div>
        ))}

        {addingUser ? (
          <div className="flex flex-col gap-1.5 px-3 py-2">
            <Input
              autoFocus
              placeholder="Full name"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addUser();
                if (e.key === 'Escape') setAddingUser(false);
              }}
              className="h-7 text-xs"
            />
            <Select value={newUserRole} onValueChange={setNewUserRole}>
              <SelectTrigger size="sm" className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUILT_IN_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button size="sm" type="button" onClick={addUser} className="h-6 flex-1 text-xs">
                Add
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setAddingUser(false)}
                className="h-6 flex-1 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingUser(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add User
          </button>
        )}
      </aside>

      {/* Right: permissions matrix */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: ROLE_COLORS[selectedRole as RoleName] ?? '#888' }}
          />
          <h2 className="text-sm font-bold">{selectedRole}</h2>
          <span className="text-xs text-muted-foreground">
            {getUserCountForRole(selectedRole)} user
            {getUserCountForRole(selectedRole) !== 1 ? 's' : ''}
          </span>
        </div>

        <Tabs defaultValue="apps" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsList className="mx-4 mt-3 mb-0 h-8 w-fit gap-0 rounded-md bg-muted p-0.5">
            <TabsTrigger value="apps" className="h-7 px-3 text-xs">
              Apps
            </TabsTrigger>
            <TabsTrigger value="channels" className="h-7 px-3 text-xs">
              Channels
            </TabsTrigger>
            <TabsTrigger value="intents" className="h-7 px-3 text-xs">
              Intents
            </TabsTrigger>
          </TabsList>

          {/* Apps tab */}
          <TabsContent value="apps" className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            <div className="flex flex-col gap-0.5">
              {apps.length === 0 ? (
                <div className="text-xs text-muted-foreground">No apps registered.</div>
              ) : (
                apps.map((app) => (
                  <PermissionRow
                    key={app.appId}
                    label={app.title}
                    sublabel={app.category}
                    checked={!isAppBlocked(selectedRole, app.appId)}
                    onCheckedChange={(checked) => toggleApp(selectedRole, app.appId, checked)}
                    switchLabel="Can Open"
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* Channels tab */}
          <TabsContent value="channels" className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            <div className="flex flex-col gap-0.5">
              {ALL_CHANNELS.map((ch) => (
                <PermissionRow
                  key={ch.id}
                  label={ch.name}
                  colorDot={ch.color}
                  checked={isChannelAllowed(selectedRole, ch.id)}
                  onCheckedChange={(checked) => toggleChannel(selectedRole, ch.id, checked)}
                  switchLabel="Can Join"
                />
              ))}
            </div>
          </TabsContent>

          {/* Intents tab */}
          <TabsContent value="intents" className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            <div className="flex flex-col gap-0.5">
              <div className="mb-2 grid grid-cols-[1fr_88px_88px] gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <span className="px-2">Intent</span>
                <span className="text-center">Can Raise</span>
                <span className="text-center">Can Handle</span>
              </div>
              {ALL_INTENTS.map((intent) => (
                <div
                  key={intent}
                  className="grid grid-cols-[1fr_88px_88px] items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50"
                >
                  <span className="text-xs font-medium">{intent}</span>
                  <div className="flex justify-center">
                    <Switch
                      size="sm"
                      checked={canRaiseIntent(selectedRole, intent)}
                      onCheckedChange={(checked) =>
                        toggleIntentRaise(selectedRole, intent, checked)
                      }
                      aria-label={`${intent} can raise`}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      size="sm"
                      checked={canHandleIntent(selectedRole, intent)}
                      onCheckedChange={(checked) =>
                        toggleIntentHandle(selectedRole, intent, checked)
                      }
                      aria-label={`${intent} can handle`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PermissionRow({
  label,
  sublabel,
  colorDot,
  checked,
  onCheckedChange,
  switchLabel,
}: {
  label: string;
  sublabel?: string;
  colorDot?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  switchLabel: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-muted/50">
      {colorDot && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: colorDot }}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium">{label}</span>
        {sublabel && (
          <span className="truncate text-[10px] text-muted-foreground">{sublabel}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">{switchLabel}</span>
        <Switch
          size="sm"
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-label={`${label} ${switchLabel}`}
        />
      </div>
    </div>
  );
}
