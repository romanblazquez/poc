import { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, Keyboard, Palette, X, CheckIcon, Minus, Plus } from 'lucide-react';
import { Button } from './ui/button.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';
import { Input } from './ui/input.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';
import { THEMES } from '@fdc3-poc/fdc3-core';
import type { ThemeName } from '@fdc3-poc/fdc3-core';

// ── User profile ──────────────────────────────────────────────────────────────

type UserRole = 'Admin' | 'Trader' | 'Compliance' | 'ReadOnly';
const ROLES: UserRole[] = ['Admin', 'Trader', 'Compliance', 'ReadOnly'];
const ROLE_COLORS: Record<UserRole, string> = {
  Admin: '#e84080',
  Trader: 'var(--shell-accent)',
  Compliance: '#e8a040',
  ReadOnly: '#888',
};
const USER_STORAGE_KEY = 'fdc3.shell.user.v1';
interface UserProfileData { name: string; role: UserRole; initials: string; }

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}
function readProfile(): UserProfileData {
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<UserProfileData>;
      if (p.name && p.role) return { name: p.name, role: p.role, initials: p.initials ?? deriveInitials(p.name) };
    }
  } catch { /* ignore */ }
  return { name: 'Demo User', role: 'Trader', initials: 'DU' };
}
function saveProfile(p: UserProfileData) {
  try { window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
interface ZoomApi { getZoom(): Promise<number>; setZoom(f: number): Promise<number>; onZoomChanged(h: (f: number) => void): () => void; }
function getZoomApi(): ZoomApi | undefined {
  return (window as unknown as { shellChrome?: { zoom?: ZoomApi } & ZoomApi }).shellChrome as ZoomApi | undefined;
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>;
}

function Divider() {
  return <div className="mx-0 h-px bg-border" />;
}

// ── Shell mega menu ───────────────────────────────────────────────────────────

interface ShellMenuProps {
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  onOpenHotkeys: () => void;
}

export function ShellMenu({ theme, onThemeChange, onOpenHotkeys }: ShellMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // User profile state
  const [profile, setProfile] = useState<UserProfileData>(readProfile);
  const [editingName, setEditingName] = useState<string | null>(null);

  const updateProfile = useCallback((next: UserProfileData) => {
    setProfile(next);
    saveProfile(next);
  }, []);

  const commitName = useCallback(() => {
    if (editingName !== null && editingName.trim()) {
      const trimmed = editingName.trim();
      updateProfile({ ...profile, name: trimmed, initials: deriveInitials(trimmed) });
    }
    setEditingName(null);
  }, [editingName, profile, updateProfile]);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const api = getZoomApi();
    if (!api?.getZoom) return;
    let alive = true;
    void api.getZoom().then((f) => { if (alive) setZoom(f); });
    const unsub = api.onZoomChanged?.((f) => setZoom(f));
    return () => { alive = false; unsub?.(); };
  }, []);

  const applyZoom = useCallback(async (next: number) => {
    const api = getZoomApi();
    if (!api?.setZoom) return;
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
    await api.setZoom(clamped);
  }, []);

  const roleColor = ROLE_COLORS[profile.role];
  const pct = Math.round(zoom * 100);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('h-8 w-8 p-0', open && 'bg-muted text-foreground')}
        onClick={() => setOpen((v) => !v)}
        title="Shell menu"
        aria-label="Open shell menu"
        aria-expanded={open}
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </Button>

      {open && (
        <>
          {/* Transparent backdrop — catches outside clicks even over Electron drag regions */}
          <div
            className="fixed inset-0 z-[9998]"
            onMouseDown={() => setOpen(false)}
          />
          <div
            ref={menuRef}
            className="absolute right-0 top-full z-[9999] mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-xl"
            style={{ boxShadow: 'var(--shell-shadow)' }}
          >

          {/* ── Account ── */}
          <div className="p-4">
            <SectionLabel label="Account" />
            <div className="mb-3 flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white"
                style={{ backgroundColor: roleColor }}
              >
                {profile.initials}
              </span>
              <div className="min-w-0 flex-1">
                {editingName !== null ? (
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitName();
                      if (e.key === 'Escape') setEditingName(null);
                    }}
                    className="h-7 text-xs"
                    placeholder="Your name"
                  />
                ) : (
                  <button
                    type="button"
                    className="block truncate text-left text-sm font-semibold hover:underline"
                    onClick={() => setEditingName(profile.name)}
                    title="Click to edit name"
                  >
                    {profile.name}
                  </button>
                )}
                <Badge
                  className="mt-0.5 h-4 px-1.5 text-[10px]"
                  style={{ backgroundColor: roleColor, color: '#fff', border: 'none' }}
                >
                  {profile.role}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1">
              {ROLES.map((role) => {
                const active = profile.role === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => updateProfile({ ...profile, role })}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-md border px-2 text-left text-[11px] font-semibold transition-colors',
                      active
                        ? 'border-transparent text-white'
                        : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                    )}
                    style={active ? { backgroundColor: ROLE_COLORS[role] } : undefined}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ROLE_COLORS[role] }} />
                    {role}
                    {active && <CheckIcon className="ml-auto size-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          <Divider />

          {/* ── Appearance ── */}
          <div className="p-4">
            <SectionLabel label="Appearance" />
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                  <Palette className="size-3.5 text-muted-foreground" />
                  Theme
                </span>
                <Select value={theme} onValueChange={(v) => onThemeChange(v as ThemeName)}>
                  <SelectTrigger size="sm" className="h-7 w-40 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    {Object.entries(THEMES).map(([key, cfg]) => (
                      <SelectItem key={key} value={key} className="text-[12px]">{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold text-foreground">Zoom</span>
                <div className="inline-flex items-stretch overflow-hidden rounded-md border">
                  <button
                    type="button"
                    onClick={() => void applyZoom(zoom - ZOOM_STEP)}
                    disabled={zoom <= ZOOM_MIN + 0.001}
                    className="flex h-7 w-7 items-center justify-center border-r text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <Minus className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyZoom(1)}
                    className="h-7 w-14 border-r text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
                    title="Click to reset to 100%"
                  >
                    {pct}%
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyZoom(zoom + ZOOM_STEP)}
                    disabled={zoom >= ZOOM_MAX - 0.001}
                    className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <Divider />

          {/* ── Tools ── */}
          <div className="p-4">
            <SectionLabel label="Tools" />
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenHotkeys(); }}
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[12px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Keyboard className="size-3.5 shrink-0 text-muted-foreground" />
              Keyboard shortcuts
              <span className="ml-auto text-[10px] font-bold text-muted-foreground opacity-60">⌘/</span>
            </button>
          </div>

          {/* ── Footer ── */}
          <div className="border-t px-4 py-2">
            <p className="text-[10px] text-muted-foreground/50">FDC3 Desktop Shell · v0.1.0-poc</p>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
