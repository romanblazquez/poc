import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InteropActivityEvent } from '@fdc3-poc/fdc3-core';
import { DashboardHeader, DashboardPage, StatusBadge } from './ui/dashboard.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = 'all' | 'context' | 'intent' | 'channel' | 'app' | 'system';
type StatusFilter = 'all' | 'ok' | 'blocked' | 'error';

function eventCategory(kind: string): Category {
  if (kind.startsWith('context.')) return 'context';
  if (kind.startsWith('intent.')) return 'intent';
  if (kind.startsWith('channel.')) return 'channel';
  if (kind.startsWith('app.')) return 'app';
  if (kind.startsWith('appChannel.') || kind.startsWith('privateChannel.')) return 'context';
  return 'system';
}

function kindShortLabel(kind: string): string {
  const dot = kind.indexOf('.');
  return dot >= 0 ? kind.slice(dot + 1) : kind;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

// ─── Styling helpers ──────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  ok:      'bg-[color:var(--shell-positive)]',
  blocked: 'bg-amber-500',
  error:   'bg-[color:var(--shell-negative)]',
  info:    'bg-blue-400',
};

const CATEGORY_BADGE_CLASS: Record<Category | string, string> = {
  context: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
  intent:  'border-purple-500/40 text-purple-400 bg-purple-500/10',
  channel: 'border-teal-500/40 text-teal-400 bg-teal-500/10',
  app:     'border-amber-500/40 text-amber-400 bg-amber-500/10',
  system:  'border-border text-muted-foreground bg-muted/30',
};

const CATEGORY_ITEMS: Array<{ key: Category; label: string }> = [
  { key: 'all',     label: 'All' },
  { key: 'context', label: 'Context' },
  { key: 'intent',  label: 'Intent' },
  { key: 'channel', label: 'Channel' },
  { key: 'app',     label: 'App' },
  { key: 'system',  label: 'System' },
];

const STATUS_ITEMS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all',     label: 'All' },
  { key: 'ok',      label: 'OK' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'error',   label: 'Error' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PillProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Pill({ active, onClick, children }: PillProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors',
        active
          ? 'border-primary bg-primary/15 text-primary'
          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────────

interface EventRowProps {
  event: InteropActivityEvent;
  expanded: boolean;
  onToggle: () => void;
}

function EventRow({ event, expanded, onToggle }: EventRowProps): JSX.Element {
  const cat = eventCategory(event.kind);
  const badgeClass = CATEGORY_BADGE_CLASS[cat] ?? CATEGORY_BADGE_CLASS.system;
  const dotClass = STATUS_DOT[event.status] ?? 'bg-muted-foreground';
  const shortLabel = kindShortLabel(event.kind);

  const expandedPayload = useMemo(() => {
    const obj = event.payload !== undefined
      ? event.payload
      : (() => {
          const parts: Record<string, string | undefined | null> = {};
          if (event.contextType) parts.contextType = event.contextType;
          if (event.intentName) parts.intentName = event.intentName;
          if (event.channelId !== undefined) parts.channelId = event.channelId;
          return Object.keys(parts).length > 0 ? parts : null;
        })();
    if (!obj) return null;
    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
  }, [event]);

  return (
    <div
      className="group cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/20"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
    >
      <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
        {/* Time */}
        <span className="w-[90px] shrink-0 font-mono text-[10px] text-muted-foreground/70">
          {formatTime(event.ts)}
        </span>

        {/* Status dot */}
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />

        {/* Kind badge */}
        <span className={`shrink-0 rounded border px-1.5 py-px text-[10px] font-bold ${badgeClass}`}>
          {shortLabel}
        </span>

        {/* Message */}
        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
          {event.message}
        </span>

        {/* Source → Target */}
        {(event.sourceAppId ?? event.targetAppId) && (
          <span className="shrink-0 text-[10px] text-muted-foreground/60">
            {event.sourceAppId ?? ''}
            {event.sourceAppId && event.targetAppId ? ' → ' : ''}
            {event.targetAppId ?? ''}
          </span>
        )}
      </div>

      {expanded && expandedPayload && (
        <div className="px-4 pb-2">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-2 text-[10px] leading-relaxed text-muted-foreground">
            {expandedPayload}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const MAX_EVENTS = 500;

// Safe accessor for the interop observability surface — window.fdc3 is typed
// narrowly in App.tsx, so we use a typed cast here rather than augmenting the
// global interface to avoid a duplicate declaration conflict.
interface Fdc3WithObservability {
  onInteropActivity?(handler: (event: InteropActivityEvent) => void): () => void;
  getInteropSnapshot?(): Promise<{ activity: InteropActivityEvent[] }>;
}

function getFdc3(): Fdc3WithObservability | null {
  return (window as unknown as { fdc3?: Fdc3WithObservability }).fdc3 ?? null;
}

export function ContextInspector(): JSX.Element {
  const [events, setEvents] = useState<InteropActivityEvent[]>([]);
  const [live, setLive] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<Category>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Load initial snapshot
  useEffect(() => {
    const fdc3 = getFdc3();
    if (typeof fdc3?.getInteropSnapshot !== 'function') return;
    void fdc3.getInteropSnapshot().then((snapshot) => {
      if (Array.isArray(snapshot?.activity)) {
        setEvents(snapshot.activity.slice(0, MAX_EVENTS));
      }
    }).catch(() => undefined);
  }, []);

  // Subscribe to live activity
  useEffect(() => {
    const fdc3 = getFdc3();
    if (typeof fdc3?.onInteropActivity !== 'function') return undefined;
    const unsub = fdc3.onInteropActivity((event) => {
      setEvents((prev) => {
        const next = [event, ...prev];
        return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
      });
    });
    return unsub;
  }, []);

  // Auto-scroll to top when live
  useEffect(() => {
    if (live && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events, live]);

  const filtered = useMemo(() => {
    let list = events;

    if (categoryFilter !== 'all') {
      list = list.filter((e) => eventCategory(e.kind) === categoryFilter);
    }
    if (statusFilter !== 'all') {
      list = list.filter((e) => e.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) =>
        e.message.toLowerCase().includes(q) ||
        (e.sourceAppId ?? '').toLowerCase().includes(q) ||
        (e.targetAppId ?? '').toLowerCase().includes(q) ||
        (e.contextType ?? '').toLowerCase().includes(q) ||
        (e.intentName ?? '').toLowerCase().includes(q),
      );
    }

    return list;
  }, [events, categoryFilter, statusFilter, search]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleClear = useCallback(() => {
    setEvents([]);
    setExpandedId(null);
  }, []);

  return (
    <DashboardPage>
      {/* Header */}
      <DashboardHeader
        eyebrow="FDC3 observability"
        title="Context Inspector"
        description="Live DevTools-style panel for all FDC3 Nexus events — broadcast, intent, channel, and app lifecycle."
        meta={
          <StatusBadge
            label={live ? 'Live' : 'Paused'}
            tone={live ? 'success' : 'warning'}
          />
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="tabular-nums">
              {filtered.length} / {events.length}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant={live ? 'default' : 'outline'}
              onClick={() => setLive((v) => !v)}
            >
              {live ? 'Pause' : 'Resume'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleClear}>
              Clear
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {/* Category pills */}
        <div className="flex flex-wrap gap-1">
          {CATEGORY_ITEMS.map(({ key, label }) => (
            <Pill key={key} active={categoryFilter === key} onClick={() => setCategoryFilter(key)}>
              {label}
            </Pill>
          ))}
        </div>

        <div className="h-4 w-px shrink-0 bg-border" />

        {/* Status pills */}
        <div className="flex flex-wrap gap-1">
          {STATUS_ITEMS.map(({ key, label }) => (
            <Pill key={key} active={statusFilter === key} onClick={() => setStatusFilter(key)}>
              {label}
            </Pill>
          ))}
        </div>

        {/* Search */}
        <Input
          className="h-7 w-52 text-xs"
          placeholder="Search events…"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </div>

      {/* Event list */}
      <div
        ref={listRef}
        className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card"
      >
        {filtered.length === 0 ? (
          <div className="flex min-h-32 items-center justify-center text-sm font-bold text-muted-foreground">
            {events.length === 0 ? 'No Nexus events recorded yet.' : 'No events match the current filters.'}
          </div>
        ) : (
          filtered.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              expanded={expandedId === event.id}
              onToggle={() => handleToggleExpand(event.id)}
            />
          ))
        )}
      </div>
    </DashboardPage>
  );
}
