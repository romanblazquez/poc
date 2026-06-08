import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, X, CheckCircle2, AlertTriangle, XCircle, Info, Check, Trash2, Lock, LockOpen, PanelLeft, PanelRight, PanelBottom } from 'lucide-react';
import type { Fdc3Context, NotificationRaiseInput, NotificationsApi, ShellNotification } from '@fdc3-poc/fdc3-core';
import { Button } from './ui/button.js';
import { cn } from '../lib/utils.js';

// ── API helpers ───────────────────────────────────────────────────────────────

interface NotificationFdc3 {
  raiseIntent(intent: string, context?: Fdc3Context): Promise<unknown>;
}
function getNotificationsApi(): NotificationsApi | undefined {
  return (window as unknown as { notifications?: NotificationsApi }).notifications;
}
function getFdc3(): NotificationFdc3 | undefined {
  return (window as unknown as { fdc3?: NotificationFdc3 }).fdc3;
}

// ── Severity helpers ──────────────────────────────────────────────────────────

type Severity = ShellNotification['severity'];


function severityColor(s: Severity): string {
  if (s === 'success') return 'var(--shell-positive)';
  if (s === 'warning') return '#f59e0b';
  if (s === 'error') return '#ef4444';
  return 'var(--shell-accent)';
}

function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const cls = cn('shrink-0', className);
  if (severity === 'success') return <CheckCircle2 className={cls} style={{ color: severityColor('success') }} />;
  if (severity === 'warning') return <AlertTriangle className={cls} style={{ color: severityColor('warning') }} />;
  if (severity === 'error') return <XCircle className={cls} style={{ color: severityColor('error') }} />;
  return <Info className={cls} style={{ color: severityColor('info') }} />;
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sourceLabel(n: ShellNotification): string {
  return n.sourceTitle ?? n.sourceAppId ?? 'Desktop';
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastProps {
  notification: ShellNotification;
  onOpen(n: ShellNotification): void;
  onDismiss(id: string): void;
}


function NotificationToast({ notification, onOpen, onDismiss }: ToastProps) {
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());
  const remainingRef = useRef(notification.ttlMs);
  const rafRef = useRef<number>(0);
  const accent = severityColor(notification.severity);

  useEffect(() => {
    if (notification.ttlMs <= 0) return;

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / notification.ttlMs) * 100);
      setProgress(pct);
      if (pct > 0) rafRef.current = requestAnimationFrame(tick);
      else onDismiss(notification.id);
    };

    if (!hovered) {
      startRef.current = Date.now() - (notification.ttlMs - remainingRef.current);
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
      remainingRef.current = (progress / 100) * notification.ttlMs;
    }

    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, notification.id, notification.ttlMs]);

  return (
    <div
      className="animate-in slide-in-from-right-4 fade-in-0 relative w-[360px] overflow-hidden rounded-xl border bg-card shadow-2xl duration-300"
      style={{ borderColor: `${accent}55` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl" style={{ background: accent }} />

      <div className="pl-4 pr-3 pt-3 pb-2.5">
        {/* Header row */}
        <div className="mb-1.5 flex items-center gap-2">
          <SeverityIcon severity={notification.severity} className="size-3.5" />
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: accent }}>
            {notification.severity}
          </span>
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground">
            {sourceLabel(notification)}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDismiss(notification.id); }}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>

        {/* Body */}
        <button
          type="button"
          onClick={() => onOpen(notification)}
          className="block w-full text-left"
        >
          <div className="text-sm font-black leading-snug text-foreground">{notification.title}</div>
          {notification.body && (
            <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
              {notification.body}
            </div>
          )}
          {notification.action?.label && (
            <div className="mt-1.5 text-[11px] font-black tracking-wide" style={{ color: accent }}>
              {notification.action.label} →
            </div>
          )}
        </button>
      </div>

      {/* TTL progress bar */}
      {notification.ttlMs > 0 && (
        <div className="h-0.5 w-full bg-border/40">
          <div
            className="h-full transition-none"
            style={{ width: `${progress}%`, background: accent, opacity: 0.6 }}
          />
        </div>
      )}
    </div>
  );
}

// ── Drawer notification row ───────────────────────────────────────────────────

function NotificationRow({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: ShellNotification;
  onOpen(n: ShellNotification): void;
  onDismiss(id: string): void;
}) {
  const accent = severityColor(notification.severity);
  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 border-b border-border/60 px-4 py-3 transition-colors hover:bg-muted/40',
        notification.read && 'opacity-60',
      )}
    >
      {/* Unread dot */}
      {!notification.read && (
        <span className="absolute left-2 top-4 h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
      )}

      <SeverityIcon severity={notification.severity} className="mt-0.5 size-4" />

      <button
        type="button"
        onClick={() => onOpen(notification)}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={cn('text-[12px] leading-snug text-foreground', !notification.read && 'font-black')}>
            {notification.title}
          </span>
        </div>
        {notification.body && (
          <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {notification.body}
          </span>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground/70">{sourceLabel(notification)}</span>
          {notification.action?.intent && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-[10px] font-bold" style={{ color: accent }}>{notification.action.intent}</span>
            </>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground/50">{formatTime(notification.ts)}</span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        title="Dismiss"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface NotificationsCenterProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

type FilterTab = 'all' | 'unread' | 'error' | 'warning';

export function NotificationsCenter({ open, onOpenChange }: NotificationsCenterProps): JSX.Element | null {
  const api = getNotificationsApi();
  const [items, setItems] = useState<ShellNotification[]>([]);
  const [hiddenToastIds, setHiddenToastIds] = useState<Set<string>>(() => new Set());
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [pulse, setPulse] = useState(false);
  const [locked, setLocked] = useState(false);
  const [position, setPosition] = useState<'left' | 'right' | 'bottom'>(() => {
    const s = window.localStorage.getItem('fdc3.shell.notifications-panel.position');
    return (s === 'left' || s === 'right' || s === 'bottom') ? s : 'right';
  });
  const prevCountRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset lock when drawer closes
  useEffect(() => { if (!open) setLocked(false); }, [open]);

  // Outside-click closes panel (when unlocked) — document listener, not backdrop onMouseDown
  useEffect(() => {
    if (!open || locked) return;
    const onMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, locked, onOpenChange]);

  const savePosition = (pos: 'left' | 'right' | 'bottom') => {
    setPosition(pos);
    window.localStorage.setItem('fdc3.shell.notifications-panel.position', pos);
  };

  useEffect(() => {
    if (!api) return;
    let alive = true;
    void api.list().then((snapshot) => { if (alive) setItems(snapshot); });
    const unsub = api.onChanged((snapshot) => {
      if (alive) {
        setItems(snapshot);
        const unread = snapshot.filter((n) => !n.read && !n.dismissed).length;
        if (unread > prevCountRef.current) {
          setPulse(true);
          setTimeout(() => setPulse(false), 1000);
        }
        prevCountRef.current = unread;
      }
    });
    return () => { alive = false; unsub(); };
  }, [api]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read && !n.dismissed).length, [items]);

  const toastItems = useMemo(
    () => items.filter((n) => !n.read && !n.dismissed && !hiddenToastIds.has(n.id)).slice(0, 4),
    [hiddenToastIds, items],
  );

  const filteredDrawerItems = useMemo(() => {
    return items.filter((n) => {
      if (n.dismissed) return false;
      if (filterTab === 'unread') return !n.read;
      if (filterTab === 'error') return n.severity === 'error';
      if (filterTab === 'warning') return n.severity === 'warning';
      return true;
    });
  }, [items, filterTab]);

  const hideToast = useCallback((id: string) => {
    setHiddenToastIds((prev) => new Set(prev).add(id));
  }, []);

  const openNotification = useCallback(async (notification: ShellNotification) => {
    hideToast(notification.id);
    onOpenChange(true);
    await api?.markRead(notification.id);
    const action = notification.action;
    if (action?.intent) {
      await getFdc3()?.raiseIntent(action.intent, action.context);
    }
  }, [api, hideToast, onOpenChange]);

  const dismissNotification = useCallback(async (id: string) => {
    hideToast(id);
    await api?.dismiss(id);
  }, [api, hideToast]);

  const raiseDemoNotification = useCallback(async () => {
    const severities: Severity[] = ['info', 'success', 'warning', 'error'];
    const titles = [
      'Order filled — AAPL 500 @ $182.40',
      'Risk limit approaching — desk utilization 87%',
      'Compliance flag — position exceeds threshold',
      'FDC3 intent resolved — ViewInstrument',
    ];
    const i = Math.floor(Math.random() * 4);
    const demo: NotificationRaiseInput = {
      title: titles[i],
      body: 'Demo notification from the Desktop Shell. Apps can raise actionable alerts via window.notifications.',
      severity: severities[i],
      ttlMs: 6000,
      sourceTitle: 'Desktop Shell',
    };
    await api?.raise(demo);
  }, [api]);

  if (!api) return null;

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'error', label: 'Errors' },
    { id: 'warning', label: 'Warnings' },
  ];

  return (
    <>
      {/* ── Bell trigger button ── */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        title="Notifications (⌘B)"
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-md transition-colors',
          open
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {unreadCount > 0
          ? <BellRing className={cn('size-4', pulse && 'animate-bounce')} />
          : <Bell className="size-4" />}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-black leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Toast stack — floats over everything ── */}
      <div
        aria-live="polite"
        className="fixed z-[9200] flex flex-col-reverse gap-2.5 transition-all duration-300 ease-out"
        style={{
          right: '20px',
          bottom: (position === 'bottom' && open) ? '420px' : '24px',
        }}
      >
        {toastItems.map((n) => (
          <NotificationToast
            key={n.id}
            notification={n}
            onOpen={(notif) => { void openNotification(notif); }}
            onDismiss={(id) => { void dismissNotification(id); }}
          />
        ))}
      </div>

      {/* ── Backdrop — visual only, pointer-events-none; closing handled by document mousedown ── */}
      {!locked && (
        <div
          className={cn(
            'fixed inset-0 z-[9050] bg-black/30 backdrop-blur-[2px] pointer-events-none transition-opacity duration-300',
            open ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}

      {/* ── Drawer (position: left | right | bottom) ── */}
      <div
        ref={panelRef}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className={cn(
          'fixed z-[9100] flex flex-col bg-card shadow-2xl transition-transform duration-300 ease-out',
          position === 'right'  && 'right-0 top-0 h-screen w-[400px]',
          position === 'left'   && 'left-0 top-0 h-screen w-[400px]',
          position === 'bottom' && 'bottom-0 left-0 right-0 h-[400px] w-full',
          position === 'right'  && (open ? 'translate-x-0' : 'translate-x-full'),
          position === 'left'   && (open ? 'translate-x-0' : '-translate-x-full'),
          position === 'bottom' && (open ? 'translate-y-0' : 'translate-y-full'),
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-black text-foreground">Notifications</h2>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              {' · '}
              {items.filter((n) => !n.dismissed).length} total
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Position picker */}
            <div className="flex overflow-hidden rounded-md border">
              {([
                { pos: 'left',   Icon: PanelLeft   },
                { pos: 'bottom', Icon: PanelBottom  },
                { pos: 'right',  Icon: PanelRight   },
              ] as const).map(({ pos, Icon }) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => savePosition(pos)}
                  title={`Dock ${pos}`}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center border-r last:border-r-0 transition-colors',
                    position === pos
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-3" />
                </button>
              ))}
            </div>
            {/* Lock */}
            <button
              type="button"
              onClick={() => setLocked((v) => !v)}
              title={locked ? 'Unlock — backdrop and auto-close restored' : 'Lock — keep open, no backdrop'}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                locked
                  ? 'bg-primary/15 text-primary hover:bg-primary/25'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            </button>
            <Button type="button" onClick={() => { void raiseDemoNotification(); }} size="xs" variant="ghost" title="Raise test notification">
              Test
            </Button>
            <Button
              type="button"
              onClick={() => { void api.markAllRead(); }}
              size="xs"
              variant="ghost"
              title="Mark all as read"
              disabled={unreadCount === 0}
            >
              <Check className="size-3" />
            </Button>
            <Button
              type="button"
              onClick={() => { void api.clearAll(); }}
              size="xs"
              variant="ghost"
              title="Clear all"
              disabled={items.length === 0}
            >
              <Trash2 className="size-3" />
            </Button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex shrink-0 border-b">
          {TABS.map((tab) => {
            const count = tab.id === 'all'
              ? items.filter((n) => !n.dismissed).length
              : tab.id === 'unread'
                ? items.filter((n) => !n.read && !n.dismissed).length
                : items.filter((n) => !n.dismissed && n.severity === (tab.id === 'error' ? 'error' : 'warning')).length;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-[11px] font-bold transition-colors',
                  filterTab === tab.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span className={cn(
                    'rounded-full px-1.5 py-0 text-[9px] font-black',
                    filterTab === tab.id ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notification list */}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {filteredDrawerItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <Bell className="size-8 text-muted-foreground/20" />
              <p className="text-sm font-bold text-muted-foreground">
                {filterTab === 'all' ? 'No notifications yet' : `No ${filterTab} notifications`}
              </p>
            </div>
          ) : (
            filteredDrawerItems.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onOpen={(notif) => { void openNotification(notif); }}
                onDismiss={(id) => { void dismissNotification(id); }}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-5 py-3">
          <p className="text-[10px] text-muted-foreground/50">
            Notifications are raised via <code className="font-mono">window.notifications.raise()</code>
          </p>
        </div>
      </div>
    </>
  );
}
