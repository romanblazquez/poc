import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  AppLogEvent,
  AppLogLevel,
  InteropActivityEvent,
  InteropActivityKind,
  InteropSnapshot,
  PlatformLogsApi,
} from '@fdc3-poc/fdc3-core';
import type { AppEntry } from '../App.js';

/**
 * Insights — the io.Insights-class telemetry dashboard. Aggregates the live
 * activity + log streams the shell already publishes into rolling KPIs, a
 * time-series sparkline, channel/intent/app leaderboards, and a per-app
 * health table. Exports the buffered events as CSV or JSON so a compliance
 * team can take an audit trail off the desk.
 *
 * The component is the analytical complement to the Command Center: where
 * Command Center is a live feed, Insights is the aggregated, sliced,
 * exportable view of the same data.
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

// ─── Styling primitives (no extra dep — match the rest of the shell) ───────

const SECTION: CSSProperties = {
  background: 'linear-gradient(180deg, var(--shell-panel), var(--shell-panel-2))',
  border: '1px solid var(--shell-border)',
  borderRadius: 12,
  boxShadow: 'var(--shell-shadow)',
  overflow: 'hidden',
};
const SECTION_HEADER: CSSProperties = {
  alignItems: 'center',
  borderBottom: '1px solid var(--shell-border)',
  color: 'var(--shell-muted)',
  display: 'flex',
  fontSize: 11,
  fontWeight: 900,
  justifyContent: 'space-between',
  letterSpacing: 0.7,
  padding: '10px 12px',
  textTransform: 'uppercase',
};
const SECTION_BODY: CSSProperties = { padding: 12 };

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
    <div
      style={{
        ...SECTION,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minHeight: 78,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--shell-muted)', fontWeight: 800 }}>{label}</div>
        {delta && delta.label !== '·' && (
          <div style={{ fontSize: 10, fontWeight: 800, color: deltaColor, fontVariantNumeric: 'tabular-nums' }}>
            {delta.label}
          </div>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--shell-muted)', fontWeight: 600 }}>{hint}</div>}
    </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, height: '100%', overflow: 'auto' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--shell-text)', letterSpacing: 0.4 }}>Insights</span>
          <span style={{ fontSize: 11, color: 'var(--shell-muted)' }}>
            {kpis.total.toLocaleString()} events in window · live
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--shell-panel-2)', borderRadius: 8, border: '1px solid var(--shell-border)' }}>
          {(Object.keys(WINDOW_MS) as WindowKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setWindowKey(k)}
              style={{
                padding: '4px 10px',
                background: windowKey === k ? 'var(--shell-accent-soft)' : 'transparent',
                border: 'none',
                borderRadius: 5,
                color: windowKey === k ? 'var(--shell-text)' : 'var(--shell-muted)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.3,
              }}
            >
              {WINDOW_LABELS[k]}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={exportCsv}
          style={{ padding: '6px 12px', fontSize: 11, fontWeight: 800, background: 'var(--shell-panel-2)', border: '1px solid var(--shell-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--shell-text)' }}
          title="Download windowed activity as CSV"
        >📥 CSV</button>
        <button
          onClick={exportJson}
          style={{ padding: '6px 12px', fontSize: 11, fontWeight: 800, background: 'var(--shell-panel-2)', border: '1px solid var(--shell-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--shell-text)' }}
          title="Download windowed activity as JSON"
        >📥 JSON</button>
        <button
          onClick={() => {
            if (!window.confirm('Clear the persisted activity buffer? In-memory events stay until the next refresh.')) return;
            try { window.localStorage.removeItem(STORAGE_KEY_EVENTS); } catch { /* noop */ }
            try { window.localStorage.removeItem(STORAGE_KEY_LOGS); } catch { /* noop */ }
            // Drop in-memory too so the UI matches localStorage.
            eventsRef.current = [];
            logsRef.current = [];
            setEvents([]);
            setLogs([]);
          }}
          style={{ padding: '6px 10px', fontSize: 11, fontWeight: 800, background: 'transparent', border: '1px solid var(--shell-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--shell-muted)' }}
          title="Wipe the persisted Insights buffer (localStorage) and current in-memory events"
        >🗑 Reset</button>
      </div>

      {/* Drill-down filter chips — render when any filter is active. */}
      {filterActive && (
        <div style={{ ...SECTION, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--shell-muted)', fontWeight: 800 }}>
            Filter
          </span>
          {(['app', 'channel', 'intent', 'contextType'] as const).map((dim) => {
            const value = filter[dim];
            if (!value) return null;
            const label = dim === 'app' ? appLabel(apps, value) : value;
            return (
              <button
                key={dim}
                type="button"
                onClick={() => setFilter((f) => ({ ...f, [dim]: undefined }))}
                title={`Remove ${dim} filter`}
                style={{
                  background: 'var(--shell-accent-soft)',
                  border: '1px solid var(--shell-accent-border)',
                  borderRadius: 999,
                  color: 'var(--shell-text)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ color: 'var(--shell-muted)', textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.6 }}>{dim}</span>
                <span>{label}</span>
                <span style={{ color: 'var(--shell-muted)', fontWeight: 900 }}>×</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFilter({})}
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--shell-muted)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              marginLeft: 'auto',
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <KpiTile label="Events/sec (60s)" value={kpis.eventsPerSec} hint={`${kpis.total} in ${WINDOW_LABELS[windowKey]}`} accent="good" delta={deltas?.eventsPerSec} />
        <KpiTile label="Broadcasts" value={kpis.broadcasts.toLocaleString()} hint={`${kpis.channelCount} channels active`} delta={deltas?.broadcasts} />
        <KpiTile label="Intents raised" value={kpis.intentsRaised.toLocaleString()} hint={`${kpis.intentsDelivered} delivered`} accent="good" delta={deltas?.intentsRaised} />
        <KpiTile label="Active apps" value={kpis.activeAppCount.toString()} hint={`${apps.length} registered`} delta={deltas?.activeAppCount} />
        <KpiTile label="Blocked" value={kpis.blocked.toLocaleString()} hint={`${kpis.blockedRate}% of traffic`} accent={kpis.blocked > 0 ? 'warn' : 'muted'} delta={deltas?.blocked} />
        <KpiTile label="Errors" value={kpis.errors.toLocaleString()} hint={`${kpis.errorRate}% error rate`} accent={kpis.errors > 0 ? 'bad' : 'muted'} delta={deltas?.errors} />
        <KpiTile label="Log warnings" value={kpis.logWarnings.toLocaleString()} hint={`${kpis.logErrors} errors`} accent={kpis.logWarnings > 0 ? 'warn' : 'muted'} />
      </div>

      {/* Sparkline */}
      <div style={SECTION}>
        <div style={SECTION_HEADER}>
          <span>Events / 5s · last 5 min</span>
          <span style={{ display: 'flex', gap: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--shell-accent)' }} />
              all
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
              errors + blocked
            </span>
            {anomalyBuckets.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ef4444', fontWeight: 800 }}>
                ▾ {anomalyBuckets.length} anomal{anomalyBuckets.length === 1 ? 'y' : 'ies'}
              </span>
            )}
          </span>
        </div>
        <div style={{ padding: '8px 12px' }}>
          <Sparkline series={sparklineSeries} accent="var(--shell-accent)" height={60} anomalies={anomalyBuckets} gradientId="spark-main" />
          <div style={{ marginTop: -8 }}>
            <Sparkline series={errorSparklineSeries} accent="#ef4444" height={36} gradientId="spark-err" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--shell-muted)', fontWeight: 700, marginTop: 4 }}>
            <span>5m ago</span><span>now</span>
          </div>
        </div>
      </div>

      {/* Two-column: Channels + Intents */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
        {/* Channels */}
        <div style={SECTION}>
          <div style={SECTION_HEADER}><span>Channel heatmap</span><span>{channels.length} active</span></div>
          {channels.length === 0 ? (
            <div style={{ ...SECTION_BODY, color: 'var(--shell-muted)', fontSize: 12, textAlign: 'center', padding: '24px 12px' }}>
              No channel traffic in window.
            </div>
          ) : (
            <div>
              {channels.map((ch) => {
                const pct = Math.round((ch.count / maxChannelCount) * 100);
                return (
                  <div
                    key={ch.channelId}
                    onClick={() => setFilter((f) => ({ ...f, channel: f.channel === ch.channelId ? undefined : ch.channelId }))}
                    title={filter.channel === ch.channelId ? 'Click to clear channel filter' : `Filter to channel ${ch.channelId}`}
                    style={{
                      position: 'relative',
                      borderTop: '1px solid var(--shell-border)',
                      cursor: 'pointer',
                      background: filter.channel === ch.channelId ? 'rgba(64, 128, 232, 0.10)' : undefined,
                    }}
                  >
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'var(--shell-accent-soft)', opacity: 0.5 }} />
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, padding: '8px 12px', fontSize: 12, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: 'var(--shell-text)', fontSize: 12 }}>{ch.channelId}</div>
                        <div style={{ fontSize: 10, color: 'var(--shell-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ch.contextTypes.slice(0, 3).join(' · ') || '—'}
                          {ch.contextTypes.length > 3 ? ` · +${ch.contextTypes.length - 3} more` : ''}
                        </div>
                      </div>
                      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'var(--shell-text)' }}>{ch.count.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: 'var(--shell-muted)', fontWeight: 700, minWidth: 56, textAlign: 'right' }}>
                        {ch.lastTs ? formatLogTime(ch.lastTs) : '—'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Intents */}
        <div style={SECTION}>
          <div style={SECTION_HEADER}><span>Intent leaderboard (top 10)</span><span>{kpis.intentsRaised} raised</span></div>
          {intents.length === 0 ? (
            <div style={{ ...SECTION_BODY, color: 'var(--shell-muted)', fontSize: 12, textAlign: 'center', padding: '24px 12px' }}>
              No intents raised in window.
            </div>
          ) : (
            <div>
              {intents.map((it) => {
                const success = it.delivered;
                const broken = it.blocked + it.failed;
                const successRate = it.total > 0 ? Math.round((success / it.total) * 100) : 0;
                return (
                  <div
                    key={it.intent}
                    onClick={() => setFilter((f) => ({ ...f, intent: f.intent === it.intent ? undefined : it.intent }))}
                    title={filter.intent === it.intent ? 'Click to clear intent filter' : `Filter to intent ${it.intent}`}
                    style={{
                      borderTop: '1px solid var(--shell-border)',
                      padding: '8px 12px',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      gap: 10,
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: filter.intent === it.intent ? 'rgba(64, 128, 232, 0.10)' : undefined,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: 'var(--shell-text)', fontSize: 12 }}>{it.intent}</div>
                      <div style={{ fontSize: 10, color: 'var(--shell-muted)', fontWeight: 700 }}>
                        raised {it.raised} · delivered {it.delivered}
                        {it.blocked > 0 ? ` · blocked ${it.blocked}` : ''}
                        {it.failed > 0 ? ` · failed ${it.failed}` : ''}
                      </div>
                    </div>
                    <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'var(--shell-text)', textAlign: 'right' }}>{it.total}</div>
                    <div style={{ minWidth: 56, textAlign: 'right', fontSize: 11, fontWeight: 800, color: broken === 0 ? 'var(--shell-positive)' : broken > success ? '#ef4444' : '#f59e0b' }}>{successRate}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* App health */}
      <div style={SECTION}>
        <div style={SECTION_HEADER}>
          <span>App health</span>
          <span>{appHealth.length} apps active</span>
        </div>
        {appHealth.length === 0 ? (
          <div style={{ ...SECTION_BODY, color: 'var(--shell-muted)', fontSize: 12, textAlign: 'center', padding: '24px 12px' }}>
            No app activity in window.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: 'var(--shell-panel-2)' }}>
                <tr>
                  {['App', 'Out', 'In', 'Intents raised', 'Intents handled', 'Errors', 'Blocked', 'Last seen'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'App' ? 'left' : 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--shell-muted)', fontWeight: 800, borderBottom: '1px solid var(--shell-border)' }}>{h}</th>
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
                      onClick={() => setFilter((f) => ({ ...f, app: f.app === r.appId ? undefined : r.appId }))}
                      title={active ? 'Click to clear app filter' : `Filter to ${r.title}`}
                      style={{
                        borderBottom: '1px solid var(--shell-border)',
                        cursor: 'pointer',
                        background: active ? 'rgba(64, 128, 232, 0.10)' : undefined,
                      }}
                    >
                      <td style={{ padding: '6px 12px', fontWeight: 800, color: 'var(--shell-text)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: idle ? 'var(--shell-muted)' : 'var(--shell-positive)' }} />
                          {r.title}
                        </div>
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.msgsOut}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.msgsIn}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.intentsRaised}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.intentsHandled}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.errors > 0 ? '#ef4444' : 'var(--shell-muted)', fontWeight: r.errors > 0 ? 800 : 500 }}>{r.errors}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.blocked > 0 ? '#f59e0b' : 'var(--shell-muted)', fontWeight: r.blocked > 0 ? 800 : 500 }}>{r.blocked}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--shell-muted)' }}>
                        {r.lastTs > 0 ? formatLogTime(r.lastTs) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log severity */}
      {logsApi && (
        <div style={SECTION}>
          <div style={SECTION_HEADER}>
            <span>Platform logs · {WINDOW_LABELS[windowKey]}</span>
            <span>{windowedLogs.length} entries · {kpis.logErrors} errors · {kpis.logWarnings} warnings</span>
          </div>
          {windowedLogs.length === 0 ? (
            <div style={{ ...SECTION_BODY, color: 'var(--shell-muted)', fontSize: 12, textAlign: 'center', padding: '24px 12px' }}>
              No platform logs in window.
            </div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {windowedLogs.slice(0, 100).map((l) => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '70px 90px 1fr', gap: 10, padding: '4px 12px', fontSize: 11, borderTop: '1px solid var(--shell-border)' }}>
                  <span style={{ color: 'var(--shell-muted)', fontVariantNumeric: 'tabular-nums' }}>{formatLogTime(l.ts)}</span>
                  <span style={{ color: logAccent(l.level), fontWeight: 800, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.6 }}>{l.level}</span>
                  <span style={{ color: 'var(--shell-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.message}>
                    {l.appTitle ? <span style={{ color: 'var(--shell-muted)', marginRight: 6 }}>[{l.appTitle}]</span> : null}
                    {l.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
