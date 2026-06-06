import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Fdc3Context, NotificationRaiseInput, NotificationsApi, ShellNotification } from '@fdc3-poc/fdc3-core';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader } from './ui/card.js';

interface NotificationFdc3 {
  raiseIntent(intent: string, context?: Fdc3Context): Promise<unknown>;
}

interface NotificationsCenterProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

function getNotificationsApi(): NotificationsApi | undefined {
  return (window as unknown as { notifications?: NotificationsApi }).notifications;
}

function getFdc3(): NotificationFdc3 | undefined {
  return (window as unknown as { fdc3?: NotificationFdc3 }).fdc3;
}

function severityVariant(severity: ShellNotification['severity']): 'default' | 'success' | 'warning' | 'destructive' {
  if (severity === 'success') return 'success';
  if (severity === 'warning') return 'warning';
  if (severity === 'error') return 'destructive';
  return 'default';
}

function severityColor(severity: ShellNotification['severity']): string {
  if (severity === 'success') return 'var(--shell-positive)';
  if (severity === 'warning') return '#f59e0b';
  if (severity === 'error') return '#ef4444';
  return 'var(--shell-accent)';
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function sourceLabel(notification: ShellNotification): string {
  return notification.sourceTitle ?? notification.sourceAppId ?? 'Desktop';
}

interface ToastProps {
  notification: ShellNotification;
  onOpen(notification: ShellNotification): void;
  onHide(id: string): void;
}

function NotificationToast({ notification, onOpen, onHide }: ToastProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const remainingRef = useRef(notification.ttlMs);

  useEffect(() => {
    remainingRef.current = notification.ttlMs;
  }, [notification.id, notification.ttlMs]);

  useEffect(() => {
    if (notification.ttlMs <= 0 || hovered) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onHide(notification.id), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [hovered, notification.id, notification.ttlMs, onHide]);

  const accent = severityColor(notification.severity);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onOpen(notification)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex h-auto w-[340px] flex-col items-start gap-1 whitespace-normal rounded-lg border bg-card p-3 text-left text-card-foreground shadow-2xl hover:bg-secondary"
      style={{ borderColor: accent, borderLeftWidth: 4 }}
    >
      <div className="flex w-full items-center gap-2">
        <Badge variant={severityVariant(notification.severity)}>{notification.severity}</Badge>
        <span className="ml-auto truncate text-[10px] font-bold text-muted-foreground">
          {sourceLabel(notification)}
        </span>
      </div>
      <div className="text-sm font-black leading-snug text-foreground">{notification.title}</div>
      {notification.body && (
        <div className="line-clamp-2 text-xs font-bold leading-snug text-muted-foreground">{notification.body}</div>
      )}
      {notification.action?.label && (
        <div className="text-[10px] font-black uppercase tracking-[0.05em] text-[color:var(--shell-accent-text)]">
          {notification.action.label}
        </div>
      )}
    </Button>
  );
}

export function NotificationsCenter({ open, onOpenChange }: NotificationsCenterProps): JSX.Element | null {
  const api = getNotificationsApi();
  const [items, setItems] = useState<ShellNotification[]>([]);
  const [hiddenToastIds, setHiddenToastIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!api) return;
    let alive = true;
    void api.list().then((snapshot) => {
      if (alive) setItems(snapshot);
    });
    const unsub = api.onChanged((snapshot) => {
      if (alive) setItems(snapshot);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [api]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read && !n.dismissed).length, [items]);
  const toastItems = useMemo(
    () => items
      .filter((n) => !n.read && !n.dismissed && !hiddenToastIds.has(n.id))
      .slice(0, 4),
    [hiddenToastIds, items],
  );

  const hideToast = useCallback((id: string) => {
    setHiddenToastIds((prev) => new Set(prev).add(id));
  }, []);

  const openNotification = useCallback(async (notification: ShellNotification) => {
    hideToast(notification.id);
    await api?.markRead(notification.id);
    const action = notification.action;
    if (action?.intent) {
      await getFdc3()?.raiseIntent(action.intent, action.context);
    }
  }, [api, hideToast]);

  const raiseDemoNotification = useCallback(async () => {
    const demo: NotificationRaiseInput = {
      title: 'Risk alert acknowledged',
      body: 'Desk notification pipeline is live. Apps can raise actionable alerts through window.notifications.',
      severity: 'success',
      ttlMs: 6000,
      sourceTitle: 'Desktop Shell',
    };
    await api?.raise(demo);
  }, [api]);

  if (!api) return null;

  return (
    <>
      <Button
        type="button"
        onClick={() => onOpenChange(!open)}
        title="Notifications (Cmd/Ctrl+B)"
        size="sm"
        variant={open ? 'default' : 'secondary'}
      >
        Alerts
        {unreadCount > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-black text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      <div
        aria-live="polite"
        className="fixed right-3 top-[92px] z-[9200] flex flex-col gap-2"
      >
        {toastItems.map((notification) => (
          <NotificationToast
            key={notification.id}
            notification={notification}
            onHide={hideToast}
            onOpen={(n) => { void openNotification(n); }}
          />
        ))}
      </div>

      {open && (
        <Card className="fixed right-3 top-[92px] z-[9100] flex max-h-[calc(100vh-100px)] w-[420px] flex-col">
          <CardHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Notifications</div>
              <div className="text-[11px] text-muted-foreground">
                {unreadCount} unread · {items.length} active
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" onClick={() => { void raiseDemoNotification(); }} size="xs" variant="ghost">Test</Button>
              <Button type="button" onClick={() => { void api.markAllRead(); }} size="xs" variant="ghost">Mark read</Button>
              <Button type="button" onClick={() => { void api.clearAll(); }} size="xs" variant="ghost">Clear</Button>
            </div>
          </CardHeader>

          <CardContent className="scrollbar-thin min-h-0 overflow-y-auto p-0">
            {items.length === 0 ? (
              <div className="p-5 text-sm font-bold text-muted-foreground">No notifications yet.</div>
            ) : items.map((notification) => {
              const accent = severityColor(notification.severity);
              return (
                <div key={notification.id} className="grid grid-cols-[6px_1fr_auto] gap-2 border-b p-3">
                  <span className="mt-0.5 h-9 w-1 rounded-full" style={{ background: accent }} />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { void openNotification(notification); }}
                    className="flex h-auto min-w-0 flex-col items-start gap-1 justify-start whitespace-normal bg-transparent p-0 text-left hover:bg-transparent"
                  >
                    <div className="flex w-full items-center gap-2">
                      {!notification.read && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
                      <Badge variant={severityVariant(notification.severity)}>{notification.severity}</Badge>
                      <span className="ml-auto text-[10px] font-bold text-muted-foreground">{formatTime(notification.ts)}</span>
                    </div>
                    <div className={notification.read ? 'text-sm font-bold text-foreground' : 'text-sm font-black text-foreground'}>
                      {notification.title}
                    </div>
                    {notification.body && (
                      <div className="text-xs font-bold leading-snug text-muted-foreground">{notification.body}</div>
                    )}
                    <div className="text-[10px] font-bold text-muted-foreground">
                      {sourceLabel(notification)}
                      {notification.action?.intent ? ` → ${notification.action.intent}` : ''}
                    </div>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => { void api.dismiss(notification.id); }}
                    title="Dismiss"
                    size="xs"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 p-0 text-muted-foreground"
                  >
                    ×
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
