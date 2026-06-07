import { useState } from 'react';
import { CheckIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Badge } from './ui/badge.js';

type UserRole = 'Admin' | 'Trader' | 'Compliance' | 'ReadOnly';

interface UserProfile {
  name: string;
  role: UserRole;
  initials: string;
}

const USER_STORAGE_KEY = 'fdc3.shell.user.v1';

const ROLE_COLORS: Record<UserRole, string> = {
  Admin: '#e84080',
  Trader: 'var(--shell-accent)',
  Compliance: '#e8a040',
  ReadOnly: '#888',
};

const ROLES: UserRole[] = ['Admin', 'Trader', 'Compliance', 'ReadOnly'];

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function readProfile(): UserProfile {
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      if (parsed.name && parsed.role) {
        return {
          name: parsed.name,
          role: parsed.role,
          initials: parsed.initials ?? deriveInitials(parsed.name),
        };
      }
    }
  } catch {
    // ignore
  }
  return { name: 'Demo User', role: 'Trader', initials: 'DU' };
}

function saveProfile(profile: UserProfile): void {
  try {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function UserProfile() {
  const [profile, setProfile] = useState<UserProfile>(readProfile);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const roleColor = ROLE_COLORS[profile.role];

  function handleRoleChange(role: UserRole) {
    const next = { ...profile, role };
    setProfile(next);
    saveProfile(next);
  }

  function handleNameEditStart() {
    setEditingName(profile.name);
  }

  function handleNameEditCommit() {
    if (editingName !== null && editingName.trim()) {
      const trimmed = editingName.trim();
      const next: UserProfile = {
        ...profile,
        name: trimmed,
        initials: deriveInitials(trimmed),
      };
      setProfile(next);
      saveProfile(next);
    }
    setEditingName(null);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-2 px-2"
          title={`${profile.name} — ${profile.role}`}
        >
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
            style={{ backgroundColor: roleColor }}
            aria-hidden="true"
          >
            {profile.initials}
          </span>
          <span className="hidden max-w-20 truncate text-[11px] font-medium sm:inline">
            {profile.name}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* Header */}
        <DropdownMenuLabel className="pb-2">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white"
              style={{ backgroundColor: roleColor }}
            >
              {profile.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{profile.name}</div>
              <Badge
                className="mt-0.5 h-4 px-1.5 text-[10px]"
                style={{ backgroundColor: roleColor, color: '#fff', border: 'none' }}
              >
                {profile.role}
              </Badge>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Role switcher */}
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Switch Role
        </DropdownMenuLabel>
        {ROLES.map((role) => (
          <DropdownMenuItem
            key={role}
            onClick={() => handleRoleChange(role)}
            className="gap-2"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: ROLE_COLORS[role] }}
            />
            <span className="flex-1 text-xs">{role}</span>
            {profile.role === role && (
              <CheckIcon className="size-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Edit profile */}
        {editingName !== null ? (
          <div className="flex items-center gap-1.5 px-2 py-1">
            <Input
              autoFocus
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={handleNameEditCommit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') handleNameEditCommit();
                if (e.key === 'Escape') setEditingName(null);
              }}
              className="h-6 flex-1 text-xs"
              placeholder="Your name"
            />
          </div>
        ) : (
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              handleNameEditStart();
            }}
            className="text-xs"
          >
            Edit Profile
          </DropdownMenuItem>
        )}

        <DropdownMenuItem disabled className="text-xs text-muted-foreground">
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
