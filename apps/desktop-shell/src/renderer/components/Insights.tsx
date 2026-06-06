import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppLogEvent,
  AppLogLevel,
  InteropActivityEvent,
  InteropActivityKind,
  InteropSnapshot,
  PlatformLogsApi,
} from '@fdc3-poc/fdc3-core';
import type { AppEntry } from '../App.js';
import { Button } from './ui/button.js';
import { Card, CardContent } from './ui/card.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';
import {
  Activity,
  AlertTriangle,
  Download,
  FileText,
  Filter,
  Layers,
  Radio,
  Trash2,
  TriangleAlert,
  Zap,
} from 'lucide-react';

/**
 * Intelligence — the io.Insights-class telemetry dashboard. Aggregates the live
 * activity + log streams the shell already publishes into rolling KPIs, a
 * time-series sparkline, channel/intent/app leaderboards, and a per-app
 * health table. Exports the buffered events as CSV or JSON so a compliance
 * team can take an audit trail off the desk.
 *
 * The component is the analytical complement inside Control Tower: live
 * telemetry becomes aggregated, sliced, exportable operational intelligence.
 */

interface InsightsProps {
  apps: AppEntry[];
}

interface InsightsFdc3Api {
  getInteropSnapshot(): Promise<InteropSnapshot>;
  onInteropActivity(handler: (event: InteropActivityEvent) => void): () => void;
}

// ─── Configuration ──────────────────────────────────────────────────────────

type WindowKey = '1m' | '5m' | '15m' | '1h' | 'all';

const WINDOW_MS: Record<WindowKey, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  'all': Number.POSITIVE_INFINITY,
};

const WINDOW_LABELS: Record<WindowKey, string> = {
  '1m': '1 min',
  '5m': '5 min',
  '15m': '15 min',
  '1h': '1 hour',
  'all': 'All',
};

const EVENT_BUFFER_LIMIT = 5_000;
const LOG_BUFFER_LIMIT = 1_500;
const SPARKLINE_BUCKETS = 60;
const SPARKLINE_WINDOW_MS = 5 * 60_000;
const SPARKLINE_BUCKET_MS = SPARKLINE_WINDOW_MS / SPARKLINE_BUCKETS;

// localStorage keys — versioned so format changes don't bork old buffers.
const STORAGE_KEY_EVENTS = 'fdc3-shell.insights.events.v1';
const STORAGE_KEY_LOGS = 'fdc3-shell.insights.logs.v1';
const STORAGE_KEY_FILTER = 'fdc3-shell.insights.filter.v1';
// Hard cap on persisted events so we never blow the localStorage quota.
const STORAGE_EVENT_CAP = 2_000;
const STORAGE_LOG_CAP = 500;
const PERSIST_DEBOUNCE_MS = 800;
const ANOMALY_MULTIPLE = 3; // bucket count > mean × this → anomaly

const INTENT_KINDS = new Set<InteropActivityKind>([
  'intent.raised',
  'intent.resolved',
  'intent.delivered',
  'intent.blocked',
  'intent.failed',
]);

const BROADCAST_KINDS = new Set<InteropActivityKind>([
  'context.broadcasted',
  'context.delivered',
  'context.blocked',
  'appChannel.broadcasted',
  'privateChannel.broadcasted',
]);

// ─── Section helper — shadcn Card with row-style iconified header ─────────

interface InsightsSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}
/**
 * Dashboard section card. Title + meta sit on ONE row (denser than the
 * canonical shadcn CardHeader which stacks them) — important on a trader
 * desktop where vertical space is at a premium. Header has a subtle
 * bottom-border so the visual hierarchy is clear without re-introducing
 * gradients or heavy shadows.
 */
function InsightsSection({ title, icon: Icon, meta, children, className }: InsightsSectionProps): React.JSX.Element {
  return (
    <Card className={cn('flex flex-col gap-0', className)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{title}</span>
        </div>
        {meta && <div className="text-[11px] font-medium text-muted-foreground">{meta}</div>}
      </div>
      {children}
    </Card>
  );
}

function InsightsEmpty({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="px-4 py-8 text-center text-xs text-muted-foreground">{message}</div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getApi(): InsightsFdc3Api | undefined {
  return (window as unknown as { fdc3?: InsightsFdc3Api }).fdc3;
}

function getPlatformLogsApi(): PlatformLogsApi | undefined {
  return (window as unknown as { platformLogs?: PlatformLogsApi }).platformLogs;
}

function appLabel(apps: AppEntry[], appId?: string): string {
  if (!appId) return 'unknown';
  return apps.find((a) => a.appId === appId)?.title ?? appId;
}

function isError(event: InteropActivityEvent): boolean {
  return event.status === 'error' || event.kind === 'intent.failed';
}
function isBlocked(event: InteropActivityEvent): boolean {
  return event.status === 'blocked' || event.kind.endsWith('.blocked');
}

function formatLogTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function logAccent(level: AppLogLevel): string {
  if (level === 'error') return '#ef4444';
  if (level === 'warning') return '#f59e0b';
  if (level === 'debug') return 'var(--shell-muted)';
  return 'var(--shell-accent)';
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / disabled storage / SSR — silently degrade.
  }
}

interface InsightsFilter {
  app?: string;
  channel?: string;
  intent?: string;
  contextType?: string;
}

function eventMatchesFilter(e: InteropActivityEvent, f: InsightsFilter): boolean {
  if (f.app && f.app !== e.sourceAppId && f.app !== e.targetAppId && f.app !== e.appId) return false;
  if (f.channel && f.channel !== e.channelId) return false;
  if (f.intent && f.intent !== e.intentName) return false;
  if (f.contextType && f.contextType !== e.contextType) return false;
  return true;
}

function logMatchesFilter(l: AppLogEvent, f: InsightsFilter): boolean {
  if (f.app && f.app !== l.appId) return false;
  return true;
}

function isFilterEmpty(f: InsightsFilter): boolean {
  return !f.app && !f.channel && !f.intent && !f.contextType;
}

function deltaLabel(current: number, prior: number): { label: string; accent: 'good' | 'bad' | 'muted' } {
  if (prior === 0 && current === 0) return { label: '·', accent: 'muted' };
  if (prior === 0) return { label: 'new', accent: 'good' };
  const pct = ((current - prior) / prior) * 100;
  if (Math.abs(pct) < 0.5) return { label: '·', accent: 'muted' };
  const sign = pct > 0 ? '+' : '';
  return { label: `${sign}${pct.toFixed(0)}%`, accent: pct > 0 ? 'good' : 'bad' };
}

function downloadBlob(filename: string, type: string, content: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── KPI tile ───────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: string;
  hint?: string;
  accent?: 'good' | 'warn' | 'bad' | 'muted';
  delta?: { label: string; accent: 'good' | 'bad' | 'muted' };
}
function KpiTile({ label, value, hint, accent = 'muted', delta }: KpiTileProps): React.JSX.Element {
  const color =
    accent === 'good' ? 'var(--shell-positive)'
    : accent === 'warn' ? '#f59e0b'
    : accent === 'bad' ? '#ef4444'
    : 'var(--shell-text)';
  const deltaColor =
    delta?.accent === 'good' ? 'var(--shell-positive)'
    : delta?.accent === 'bad' ? '#ef4444'
    : 'var(--shell-muted)';
  return (
    <Card className="flex min-h-[78px] flex-col gap-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</div>
        {delta && delta.label !== '·' && (
          <div className="text-[10px] font-extrabold tabular-nums" style={{ color: deltaColor }}>
            {delta.label}
          </div>
        )}
      </div>
      <div className="text-[22px] font-black leading-none tabular-nums" style={{ color }}>{value}</div>
      {hint && <div className="text-[10px] font-semibold text-muted-foreground">{hint}</div>}
    </Card>
  );
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

interface SparklineProps {
  series: number[];
  height?: number;
  accent?: string;
  /** Index → triangle/circle marker; rendered above the line for visual anomaly callouts. */
  anomalies?: readonly number[];
  /** Unique id so multiple sparklines on one page don't share the gradient `id`. */
  gradientId?: string;
}
function Sparkline({ series, height = 48, accent = 'var(--shell-accent)', anomalies = [], gradientId = 'sparkline-fill' }: SparklineProps): React.JSX.Element {
  const width = 600;
  const n = series.length;
  if (n < 2) {
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }} />
    );
  }
  const max = Math.max(...series, 1);
  const pad = 4;
  const usable = height - pad * 2;
  const points = series.map((v, i) => {
    const x = (i / (n - 1)) * width;
    const y = pad + (1 - v / max) * usable;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M${points.join(' L')}`;
  const areaPath = `M0,${height} L${points.join(' L')} L${width},${height} Z`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={accent} strokeWidth="1.6" />
      {anomalies.map((idx) => {
        if (idx < 0 || idx >= n) return null;
        const x = (idx / (n - 1)) * width;
        const v = series[idx];
        const y = pad + (1 - v / max) * usable;
        return (
          <g key={`anomaly-${idx}`}>
            {/* small triangle pointing down toward the spike */}
            <polygon
              points={`${(x - 4).toFixed(1)},${(y - 12).toFixed(1)} ${(x + 4).toFixed(1)},${(y - 12).toFixed(1)} ${x.toFixed(1)},${(y - 4).toFixed(1)}`}
              fill="#ef4444"
              stroke="var(--shell-panel)"
              strokeWidth="0.8"
            />
            <circle cx={x} cy={y} r="2.5" fill="#ef4444" stroke="var(--shell-panel)" strokeWidth="0.8" />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function Insights({ apps }: InsightsProps): React.JSX.Element {
  const api = getApi();
  const logsApi = getPlatformLogsApi();

  // Seed events/logs from localStorage so the dashboard isn't blank after a shell restart.
  const [events, setEvents] = useState<InteropActivityEvent[]>(() =>
    safeReadJson<InteropActivityEvent[]>(STORAGE_KEY_EVENTS, []),
  );
  const [logs, setLogs] = useState<AppLogEvent[]>(() =>
    safeReadJson<AppLogEvent[]>(STORAGE_KEY_LOGS, []),
  );
  const [filter, setFilter] = useState<InsightsFilter>(() =>
    safeReadJson<InsightsFilter>(STORAGE_KEY_FILTER, {}),
  );
  const [windowKey, setWindowKey] = useState<WindowKey>('5m');
  const [now, setNow] = useState<number>(() => Date.now());
  const eventsRef = useRef<InteropActivityEvent[]>(events);
  const logsRef = useRef<AppLogEvent[]>(logs);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Merge an array of incoming events with an existing buffer, deduping by id.
  const mergeEvents = useCallback((incoming: InteropActivityEvent[], existing: InteropActivityEvent[]): InteropActivityEvent[] => {
    const seen = new Set<string>();
    const out: InteropActivityEvent[] = [];
    for (const arr of [incoming, existing]) {
      for (const e of arr) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        out.push(e);
      }
    }
    out.sort((a, b) => b.ts - a.ts);
    return out.slice(0, EVENT_BUFFER_LIMIT);
  }, []);

  const mergeLogs = useCallback((incoming: AppLogEvent[], existing: AppLogEvent[]): AppLogEvent[] => {
    const seen = new Set<string>();
    const out: AppLogEvent[] = [];
    for (const arr of [incoming, existing]) {
      for (const l of arr) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        out.push(l);
      }
    }
    out.sort((a, b) => b.ts - a.ts);
    return out.slice(0, LOG_BUFFER_LIMIT);
  }, []);

  // Initial snapshot + live subscription.
  useEffect(() => {
    if (!api) return;
    let alive = true;
    void api.getInteropSnapshot().then((snap) => {
      if (!alive) return;
      const merged = mergeEvents(snap.activity ?? [], eventsRef.current);
      eventsRef.current = merged;
      setEvents(merged);
      const mergedLogs = mergeLogs(snap.appLogs ?? [], logsRef.current);
      logsRef.current = mergedLogs;
      setLogs(mergedLogs);
    });

    const unsub = api.onInteropActivity((event) => {
      const next = [event, ...eventsRef.current].slice(0, EVENT_BUFFER_LIMIT);
      eventsRef.current = next;
      setEvents(next);
    });

    let unsubLog: (() => void) | undefined;
    if (logsApi) {
      unsubLog = logsApi.onLog((entry) => {
        const next = [entry, ...logsRef.current].slice(0, LOG_BUFFER_LIMIT);
        logsRef.current = next;
        setLogs(next);
      });
    }

    return () => {
      alive = false;
      unsub();
      unsubLog?.();
    };
  }, [api, logsApi, mergeEvents, mergeLogs]);

  // Persist filter on every change.
  useEffect(() => {
    safeWriteJson(STORAGE_KEY_FILTER, filter);
  }, [filter]);

  // Debounced persistence of the activity + log buffers. We cap aggressively
  // (STORAGE_EVENT_CAP / STORAGE_LOG_CAP) so the writes stay well under any
  // realistic localStorage quota.
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      safeWriteJson(STORAGE_KEY_EVENTS, events.slice(0, STORAGE_EVENT_CAP));
      safeWriteJson(STORAGE_KEY_LOGS, logs.slice(0, STORAGE_LOG_CAP));
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [events, logs]);

  // Tick the wall-clock so windowed aggregates recompute every second even
  // when no new events arrive (otherwise idle screens look stuck).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ─── Filter helpers ───────────────────────────────────────────────────────

  const filterActive = !isFilterEmpty(filter);

  // Pre-filter every event/log by the drill-down filter ONCE, so every
  // downstream useMemo benefits without re-filtering.
  const filteredEvents = useMemo(() => {
    if (!filterActive) return events;
    return events.filter((e) => eventMatchesFilter(e, filter));
  }, [events, filter, filterActive]);

  const filteredLogs = useMemo(() => {
    if (!filterActive) return logs;
    return logs.filter((l) => logMatchesFilter(l, filter));
  }, [logs, filter, filterActive]);

  // ─── Windowed slices ─────────────────────────────────────────────────────

  const windowMs = WINDOW_MS[windowKey];
  const windowed = useMemo(() => {
    if (windowMs === Number.POSITIVE_INFINITY) return filteredEvents;
    const cutoff = now - windowMs;
    return filteredEvents.filter((e) => e.ts >= cutoff);
  }, [filteredEvents, windowMs, now]);

  // Prior-window slice for period-over-period deltas. Same length as the
  // current window, immediately preceding it. `all` has no comparison.
  const priorWindowed = useMemo(() => {
    if (windowMs === Number.POSITIVE_INFINITY) return null;
    const priorEnd = now - windowMs;
    const priorStart = priorEnd - windowMs;
    return filteredEvents.filter((e) => e.ts >= priorStart && e.ts < priorEnd);
  }, [filteredEvents, windowMs, now]);

  const windowedLogs = useMemo(() => {
    if (windowMs === Number.POSITIVE_INFINITY) return filteredLogs;
    const cutoff = now - windowMs;
    return filteredLogs.filter((l) => l.ts >= cutoff);
  }, [filteredLogs, windowMs, now]);

  // ─── KPIs ────────────────────────────────────────────────────────────────

  // KPI bundle for an arbitrary event slice — used for both the current and
  // prior windows so we can compute period-over-period deltas.
  type KpiBundle = {
    total: number;
    broadcasts: number;
    intentsRaised: number;
    intentsDelivered: number;
    blocked: number;
    errors: number;
    activeAppCount: number;
    channelCount: number;
  };
  const computeBundle = useCallback((slice: InteropActivityEvent[]): KpiBundle => {
    let broadcasts = 0;
    let intentsRaised = 0;
    let intentsDelivered = 0;
    let blocked = 0;
    let errors = 0;
    const activeApps = new Set<string>();
    const channelsUsed = new Set<string>();
    for (const e of slice) {
      if (BROADCAST_KINDS.has(e.kind)) broadcasts++;
      if (e.kind === 'intent.raised') intentsRaised++;
      if (e.kind === 'intent.delivered' || e.kind === 'intent.resolved') intentsDelivered++;
      if (isBlocked(e)) blocked++;
      if (isError(e)) errors++;
      if (e.sourceAppId) activeApps.add(e.sourceAppId);
      if (e.targetAppId) activeApps.add(e.targetAppId);
      if (e.appId) activeApps.add(e.appId);
      if (e.channelId) channelsUsed.add(e.channelId);
    }
    return {
      total: slice.length,
      broadcasts,
      intentsRaised,
      intentsDelivered,
      blocked,
      errors,
      activeAppCount: activeApps.size,
      channelCount: channelsUsed.size,
    };
  }, []);

  const priorBundle = useMemo<KpiBundle | null>(
    () => (priorWindowed ? computeBundle(priorWindowed) : null),
    [priorWindowed, computeBundle],
  );

  const kpis = useMemo(() => {
    const current = computeBundle(windowed);
    const last60 = filteredEvents.filter((e) => e.ts >= now - 60_000).length;
    const priorLast60 = filteredEvents.filter((e) => e.ts >= now - 120_000 && e.ts < now - 60_000).length;
    const eventsPerSec = (last60 / 60).toFixed(2);
    const denom = current.total || 1;
    const errorRate = ((current.errors / denom) * 100).toFixed(1);
    const blockedRate = ((current.blocked / denom) * 100).toFixed(1);

    const logErrors = windowedLogs.filter((l) => l.level === 'error').length;
    const logWarnings = windowedLogs.filter((l) => l.level === 'warning').length;

    return {
      eventsPerSec,
      eventsLast60: last60,
      eventsLast60Prior: priorLast60,
      total: current.total,
      errors: current.errors,
      errorRate,
      blocked: current.blocked,
      blockedRate,
      intentsRaised: current.intentsRaised,
      intentsDelivered: current.intentsDelivered,
      broadcasts: current.broadcasts,
      activeAppCount: current.activeAppCount,
      channelCount: current.channelCount,
      logErrors,
      logWarnings,
    };
  }, [computeBundle, windowed, filteredEvents, windowedLogs, now]);

  // KPI deltas — only computed when we have a comparable prior window
  // (i.e. windowKey !== 'all'). Each delta is a small ↑/↓ tag shown in the
  // top-right corner of its KPI tile.
  const deltas = useMemo(() => {
    if (!priorBundle) return null;
    return {
      eventsPerSec: deltaLabel(kpis.eventsLast60, kpis.eventsLast60Prior),
      total: deltaLabel(kpis.total, priorBundle.total),
      broadcasts: deltaLabel(kpis.broadcasts, priorBundle.broadcasts),
      intentsRaised: deltaLabel(kpis.intentsRaised, priorBundle.intentsRaised),
      activeAppCount: deltaLabel(kpis.activeAppCount, priorBundle.activeAppCount),
      blocked: deltaLabel(kpis.blocked, priorBundle.blocked),
      errors: deltaLabel(kpis.errors, priorBundle.errors),
    };
  }, [kpis, priorBundle]);

  // ─── Sparkline series — events/sec over last 5 minutes ───────────────────

  const sparklineSeries = useMemo(() => {
    const buckets = new Array(SPARKLINE_BUCKETS).fill(0);
    const cutoff = now - SPARKLINE_WINDOW_MS;
    for (const e of filteredEvents) {
      if (e.ts < cutoff) break;
      const idx = Math.min(SPARKLINE_BUCKETS - 1, Math.floor((e.ts - cutoff) / SPARKLINE_BUCKET_MS));
      buckets[idx]++;
    }
    return buckets;
  }, [filteredEvents, now]);

  const errorSparklineSeries = useMemo(() => {
    const buckets = new Array(SPARKLINE_BUCKETS).fill(0);
    const cutoff = now - SPARKLINE_WINDOW_MS;
    for (const e of filteredEvents) {
      if (e.ts < cutoff) break;
      if (!isError(e) && !isBlocked(e)) continue;
      const idx = Math.min(SPARKLINE_BUCKETS - 1, Math.floor((e.ts - cutoff) / SPARKLINE_BUCKET_MS));
      buckets[idx]++;
    }
    return buckets;
  }, [filteredEvents, now]);

  // Anomaly detection — any bucket whose count exceeds the rolling mean by
  // `ANOMALY_MULTIPLE`× is flagged on the sparkline. The mean is computed
  // across non-zero buckets so a quiet baseline doesn't trigger every tick.
  const anomalyBuckets = useMemo<readonly number[]>(() => {
    const nonZero = sparklineSeries.filter((v) => v > 0);
    if (nonZero.length < 3) return [];
    const mean = nonZero.reduce((s, v) => s + v, 0) / nonZero.length;
    const threshold = mean * ANOMALY_MULTIPLE;
    const flagged: number[] = [];
    for (let i = 0; i < sparklineSeries.length; i++) {
      if (sparklineSeries[i] > threshold) flagged.push(i);
    }
    return flagged;
  }, [sparklineSeries]);

  // ─── Channel heatmap ─────────────────────────────────────────────────────

  const channels = useMemo(() => {
    const map = new Map<string, { count: number; lastTs: number; lastApp?: string; contextTypes: Set<string> }>();
    for (const e of windowed) {
      if (!e.channelId) continue;
      let bucket = map.get(e.channelId);
      if (!bucket) {
        bucket = { count: 0, lastTs: 0, contextTypes: new Set() };
        map.set(e.channelId, bucket);
      }
      bucket.count++;
      if (e.ts > bucket.lastTs) { bucket.lastTs = e.ts; bucket.lastApp = e.sourceAppId; }
      if (e.contextType) bucket.contextTypes.add(e.contextType);
    }
    return [...map.entries()]
      .map(([channelId, b]) => ({ channelId, ...b, contextTypes: [...b.contextTypes].sort() }))
      .sort((a, b) => b.count - a.count);
  }, [windowed]);
  const maxChannelCount = channels[0]?.count ?? 1;

  // ─── Intent leaderboard ──────────────────────────────────────────────────

  const intents = useMemo(() => {
    const map = new Map<string, { raised: number; delivered: number; blocked: number; failed: number; lastTs: number }>();
    for (const e of windowed) {
      if (!INTENT_KINDS.has(e.kind) || !e.intentName) continue;
      let bucket = map.get(e.intentName);
      if (!bucket) {
        bucket = { raised: 0, delivered: 0, blocked: 0, failed: 0, lastTs: 0 };
        map.set(e.intentName, bucket);
      }
      if (e.kind === 'intent.raised') bucket.raised++;
      else if (e.kind === 'intent.delivered' || e.kind === 'intent.resolved') bucket.delivered++;
      else if (e.kind === 'intent.blocked') bucket.blocked++;
      else if (e.kind === 'intent.failed') bucket.failed++;
      if (e.ts > bucket.lastTs) bucket.lastTs = e.ts;
    }
    return [...map.entries()]
      .map(([intent, b]) => ({ intent, ...b, total: b.raised + b.delivered + b.blocked + b.failed }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [windowed]);

  // ─── App health ──────────────────────────────────────────────────────────

  type AppHealth = {
    appId: string;
    title: string;
    msgsOut: number;
    msgsIn: number;
    intentsRaised: number;
    intentsHandled: number;
    errors: number;
    blocked: number;
    lastTs: number;
  };
  const appHealth = useMemo<AppHealth[]>(() => {
    const map = new Map<string, AppHealth>();
    const ensure = (id: string): AppHealth => {
      let r = map.get(id);
      if (!r) {
        r = {
          appId: id,
          title: appLabel(apps, id),
          msgsOut: 0,
          msgsIn: 0,
          intentsRaised: 0,
          intentsHandled: 0,
          errors: 0,
          blocked: 0,
          lastTs: 0,
        };
        map.set(id, r);
      }
      return r;
    };
    for (const e of windowed) {
      if (e.sourceAppId) {
        const r = ensure(e.sourceAppId);
        if (BROADCAST_KINDS.has(e.kind) || e.kind === 'intent.raised') r.msgsOut++;
        if (e.kind === 'intent.raised') r.intentsRaised++;
        if (isError(e)) r.errors++;
        if (isBlocked(e)) r.blocked++;
        if (e.ts > r.lastTs) r.lastTs = e.ts;
      }
      if (e.targetAppId) {
        const r = ensure(e.targetAppId);
        if (e.kind === 'context.delivered' || e.kind === 'intent.delivered') r.msgsIn++;
        if (e.kind === 'intent.delivered') r.intentsHandled++;
        if (e.ts > r.lastTs) r.lastTs = e.ts;
      }
    }
    return [...map.values()].sort((a, b) => (b.msgsOut + b.msgsIn) - (a.msgsOut + a.msgsIn));
  }, [windowed, apps]);

  // ─── Export ──────────────────────────────────────────────────────────────

  const exportCsv = useCallback(() => {
    const header = ['ts_iso', 'kind', 'status', 'sourceAppId', 'targetAppId', 'channelId', 'contextType', 'intentName', 'message'];
    const lines = [header.join(',')];
    for (const e of windowed) {
      lines.push([
        new Date(e.ts).toISOString(),
        e.kind,
        e.status,
        e.sourceAppId ?? '',
        e.targetAppId ?? '',
        e.channelId ?? '',
        e.contextType ?? '',
        e.intentName ?? '',
        e.message,
      ].map(escapeCsv).join(','));
    }
    downloadBlob(`interop-activity-${windowKey}-${Date.now()}.csv`, 'text/csv', lines.join('\n'));
  }, [windowed, windowKey]);

  const exportJson = useCallback(() => {
    downloadBlob(`interop-activity-${windowKey}-${Date.now()}.json`, 'application/json', JSON.stringify({
      window: windowKey,
      windowMs,
      generatedAt: Date.now(),
      eventCount: windowed.length,
      events: windowed,
      kpis,
    }, null, 2));
  }, [windowed, windowKey, windowMs, kpis]);

  // ─── Layout ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto pr-0.5 scrollbar-thin">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-2">
          <Activity className="h-4 w-4 self-center text-[color:var(--shell-accent)]" />
          <span className="text-base font-black text-foreground">Intelligence</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {kpis.total.toLocaleString()} events · live
          </span>
        </div>
        <div className="inline-flex gap-0.5 rounded-lg border border-border bg-muted p-1">
          {(Object.keys(WINDOW_MS) as WindowKey[]).map((k) => (
            <Button
              key={k}
              onClick={() => setWindowKey(k)}
              size="xs"
              variant={windowKey === k ? 'default' : 'ghost'}
            >
              {WINDOW_LABELS[k]}
            </Button>
          ))}
        </div>
        <div className="flex-1" />
        <Button onClick={exportCsv} size="sm" variant="outline" title="Download windowed activity as CSV">
          <Download /> CSV
        </Button>
        <Button onClick={exportJson} size="sm" variant="outline" title="Download windowed activity as JSON">
          <Download /> JSON
        </Button>
        <Button
          onClick={() => {
            if (!window.confirm('Clear the persisted activity buffer? In-memory events stay until the next refresh.')) return;
            try { window.localStorage.removeItem(STORAGE_KEY_EVENTS); } catch { /* noop */ }
            try { window.localStorage.removeItem(STORAGE_KEY_LOGS); } catch { /* noop */ }
            eventsRef.current = [];
            logsRef.current = [];
            setEvents([]);
            setLogs([]);
          }}
          size="sm"
          variant="ghost"
          title="Wipe the persisted Intelligence buffer (localStorage) and current in-memory events"
        >
          <Trash2 /> Reset
        </Button>
      </div>

      {/* Drill-down filter chips — render when any filter is active. */}
      {filterActive && (
        <Card className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-muted-foreground">
            Filter
          </span>
          {(['app', 'channel', 'intent', 'contextType'] as const).map((dim) => {
            const value = filter[dim];
            if (!value) return null;
            const label = dim === 'app' ? appLabel(apps, value) : value;
            return (
              <Button
                key={dim}
                type="button"
                onClick={() => setFilter((f) => ({ ...f, [dim]: undefined }))}
                title={`Remove ${dim} filter`}
                size="xs"
                variant="outline"
                className="h-6 rounded-full border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] px-2.5 text-[11px] font-bold text-foreground hover:bg-[color:color-mix(in_srgb,var(--shell-accent)_24%,transparent)]"
              >
                <span className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground">{dim}</span>
                <span className="tabular-nums">{label}</span>
                <span className="text-muted-foreground">×</span>
              </Button>
            );
          })}
          <Button type="button" onClick={() => setFilter({})} variant="ghost" size="xs" className="ml-auto">
            Clear all
          </Button>
        </Card>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <KpiTile label="Events/sec (60s)" value={kpis.eventsPerSec} hint={`${kpis.total} in ${WINDOW_LABELS[windowKey]}`} accent="good" delta={deltas?.eventsPerSec} />
        <KpiTile label="Broadcasts" value={kpis.broadcasts.toLocaleString()} hint={`${kpis.channelCount} channels active`} delta={deltas?.broadcasts} />
        <KpiTile label="Intents raised" value={kpis.intentsRaised.toLocaleString()} hint={`${kpis.intentsDelivered} delivered`} accent="good" delta={deltas?.intentsRaised} />
        <KpiTile label="Active apps" value={kpis.activeAppCount.toString()} hint={`${apps.length} registered`} delta={deltas?.activeAppCount} />
        <KpiTile label="Blocked" value={kpis.blocked.toLocaleString()} hint={`${kpis.blockedRate}% of traffic`} accent={kpis.blocked > 0 ? 'warn' : 'muted'} delta={deltas?.blocked} />
        <KpiTile label="Errors" value={kpis.errors.toLocaleString()} hint={`${kpis.errorRate}% error rate`} accent={kpis.errors > 0 ? 'bad' : 'muted'} delta={deltas?.errors} />
        <KpiTile label="Log warnings" value={kpis.logWarnings.toLocaleString()} hint={`${kpis.logErrors} errors`} accent={kpis.logWarnings > 0 ? 'warn' : 'muted'} />
      </div>

      {/* Sparkline */}
      <InsightsSection
        title={`Events / 5s · last 5 min`}
        icon={Activity}
        meta={
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[color:var(--shell-accent)]" />
              all
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              errors + blocked
            </span>
            {anomalyBuckets.length > 0 && (
              <Badge variant="destructive" className="gap-1">
                <TriangleAlert className="h-3 w-3" />
                {anomalyBuckets.length} anomal{anomalyBuckets.length === 1 ? 'y' : 'ies'}
              </Badge>
            )}
          </span>
        }
      >
        <CardContent className="flex flex-col gap-1">
          <Sparkline series={sparklineSeries} accent="var(--shell-accent)" height={60} anomalies={anomalyBuckets} gradientId="spark-main" />
          <Sparkline series={errorSparklineSeries} accent="#ef4444" height={36} gradientId="spark-err" />
          <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
            <span>5m ago</span><span>now</span>
          </div>
        </CardContent>
      </InsightsSection>

      {/* Two-column: Channels + Intents */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-3">
        {/* Channels */}
        <InsightsSection
          title="Channel heatmap"
          icon={Radio}
          meta={<span className="tabular-nums">{channels.length} active</span>}
        >
          {channels.length === 0 ? (
            <InsightsEmpty message="No channel traffic in window." />
          ) : (
            <div>
              {channels.map((ch) => {
                const pct = Math.round((ch.count / maxChannelCount) * 100);
                const active = filter.channel === ch.channelId;
                return (
                  <div
                    key={ch.channelId}
                    onClick={() => setFilter((f) => ({ ...f, channel: active ? undefined : ch.channelId }))}
                    title={active ? 'Click to clear channel filter' : `Filter to channel ${ch.channelId}`}
                    className={cn(
                      'relative cursor-pointer border-t border-border transition-colors hover:bg-[color:rgba(255,255,255,0.03)]',
                      active && 'bg-[color:rgba(64,128,232,0.10)]',
                    )}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-[color:var(--shell-accent-soft)] opacity-50"
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative grid grid-cols-[1fr_auto_auto] items-center gap-2.5 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-extrabold text-foreground">{ch.channelId}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {ch.contextTypes.slice(0, 3).join(' · ') || '—'}
                          {ch.contextTypes.length > 3 ? ` · +${ch.contextTypes.length - 3} more` : ''}
                        </div>
                      </div>
                      <div className="font-extrabold tabular-nums text-foreground">{ch.count.toLocaleString()}</div>
                      <div className="min-w-[3.5rem] text-right text-[10px] font-bold text-muted-foreground tabular-nums">
                        {ch.lastTs ? formatLogTime(ch.lastTs) : '—'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </InsightsSection>

        {/* Intents */}
        <InsightsSection
          title="Intent leaderboard"
          icon={Zap}
          meta={<span className="tabular-nums">{kpis.intentsRaised} raised · top 10</span>}
        >
          {intents.length === 0 ? (
            <InsightsEmpty message="No intents raised in window." />
          ) : (
            <div>
              {intents.map((it) => {
                const success = it.delivered;
                const broken = it.blocked + it.failed;
                const successRate = it.total > 0 ? Math.round((success / it.total) * 100) : 0;
                const active = filter.intent === it.intent;
                const rateClass =
                  broken === 0 ? 'text-emerald-500'
                  : broken > success ? 'text-rose-500'
                  : 'text-amber-500';
                return (
                  <div
                    key={it.intent}
                    onClick={() => setFilter((f) => ({ ...f, intent: active ? undefined : it.intent }))}
                    title={active ? 'Click to clear intent filter' : `Filter to intent ${it.intent}`}
                    className={cn(
                      'grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2.5 border-t border-border px-3 py-2 text-xs transition-colors hover:bg-[color:rgba(255,255,255,0.03)]',
                      active && 'bg-[color:rgba(64,128,232,0.10)]',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-extrabold text-foreground">{it.intent}</div>
                      <div className="text-[10px] font-bold text-muted-foreground">
                        raised {it.raised} · delivered {it.delivered}
                        {it.blocked > 0 ? ` · blocked ${it.blocked}` : ''}
                        {it.failed > 0 ? ` · failed ${it.failed}` : ''}
                      </div>
                    </div>
                    <div className="text-right font-extrabold tabular-nums text-foreground">{it.total}</div>
                    <div className={cn('min-w-[3.5rem] text-right text-[11px] font-extrabold tabular-nums', rateClass)}>
                      {successRate}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </InsightsSection>
      </div>

      {/* App health */}
      <InsightsSection
        title="App health"
        icon={Layers}
        meta={<span className="tabular-nums">{appHealth.length} apps active</span>}
      >
        {appHealth.length === 0 ? (
          <InsightsEmpty message="No app activity in window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-secondary">
                <tr>
                  {['App', 'Out', 'In', 'Intents raised', 'Intents handled', 'Errors', 'Blocked', 'Last seen'].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        'border-b border-border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground',
                        h === 'App' ? 'text-left' : 'text-right',
                      )}
                    >{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appHealth.map((r) => {
                  const idle = r.lastTs > 0 && now - r.lastTs > 60_000;
                  const active = filter.app === r.appId;
                  return (
                    <tr
                      key={r.appId}
                      onClick={() => setFilter((f) => ({ ...f, app: active ? undefined : r.appId }))}
                      title={active ? 'Click to clear app filter' : `Filter to ${r.title}`}
                      className={cn(
                        'cursor-pointer border-b border-border transition-colors hover:bg-[color:rgba(255,255,255,0.03)]',
                        active && 'bg-[color:rgba(64,128,232,0.10)]',
                      )}
                    >
                      <td className="px-3 py-1.5 font-extrabold text-foreground">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              idle ? 'bg-muted-foreground' : 'bg-emerald-500',
                            )}
                          />
                          {r.title}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.msgsOut}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.msgsIn}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.intentsRaised}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.intentsHandled}</td>
                      <td className={cn('px-3 py-1.5 text-right tabular-nums', r.errors > 0 ? 'font-extrabold text-rose-500' : 'text-muted-foreground')}>{r.errors}</td>
                      <td className={cn('px-3 py-1.5 text-right tabular-nums', r.blocked > 0 ? 'font-extrabold text-amber-500' : 'text-muted-foreground')}>{r.blocked}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {r.lastTs > 0 ? formatLogTime(r.lastTs) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </InsightsSection>

      {/* Log severity */}
      {logsApi && (
        <InsightsSection
          title={`Platform logs · ${WINDOW_LABELS[windowKey]}`}
          icon={FileText}
          meta={
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{windowedLogs.length} entries</span>
              {kpis.logErrors > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {kpis.logErrors}
                </Badge>
              )}
              {kpis.logWarnings > 0 && (
                <Badge variant="warning" className="gap-1">
                  <TriangleAlert className="h-3 w-3" />
                  {kpis.logWarnings}
                </Badge>
              )}
            </span>
          }
        >
          {windowedLogs.length === 0 ? (
            <InsightsEmpty message="No platform logs in window." />
          ) : (
            <div className="max-h-[220px] overflow-y-auto scrollbar-thin">
              {windowedLogs.slice(0, 100).map((l) => (
                <div
                  key={l.id}
                  className="grid grid-cols-[70px_90px_1fr] gap-2.5 border-t border-border px-3 py-1 text-[11px]"
                >
                  <span className="tabular-nums text-muted-foreground">{formatLogTime(l.ts)}</span>
                  <span
                    className="text-[10px] font-extrabold uppercase tracking-[0.06em]"
                    style={{ color: logAccent(l.level) }}
                  >{l.level}</span>
                  <span className="truncate text-foreground" title={l.message}>
                    {l.appTitle ? <span className="mr-1.5 text-muted-foreground">[{l.appTitle}]</span> : null}
                    {l.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </InsightsSection>
      )}
    </div>
  );
}
