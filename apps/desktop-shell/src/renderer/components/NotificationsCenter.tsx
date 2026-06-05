import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Fdc3Context, NotificationRaiseInput, NotificationsApi, ShellNotification } from '@fdc3-poc/fdc3-core';

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

function NotificationToast({ notification, onOpen, onHide }: ToastProps): React.JSX.Element {
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
    <button
      type="button"
      onClick={() => onOpen(notification)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--shell-panel)',
        border: `1px solid ${accent}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 8,
        boxShadow: '0 18px 50px rgba(0,0,0,0.36)',
        color: 'var(--shell-text)',
        cursor: 'pointer',
        display: 'block',
        padding: '10px 12px',
        textAlign: 'left',
        width: 340,
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 4 }}>
        <span style={{ color: accent, fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>
          {notification.severity}
        </span>
        <span style={{ color: 'var(--shell-muted)', fontSize: 10, fontWeight: 700, marginLeft: 'auto' }}>
          {sourceLabel(notification)}
        </span>
      </div>
      <div style={{ color: 'var(--shell-text)', fontSize: 13, fontWeight: 850, lineHeight: 1.25 }}>
        {notification.title}
      </div>
      {notification.body && (
        <div style={{ color: 'var(--shell-muted)', fontSize: 11, fontWeight: 600, lineHeight: 1.35, marginTop: 4 }}>
          {notification.body}
        </div>
      )}
      {notification.action?.label && (
        <div style={{ color: 'var(--shell-accent-text)', fontSize: 10, fontWeight: 800, marginTop: 6 }}>
          {notification.action.label}
        </div>
      )}
    </button>
  );
}

export function NotificationsCenter({ open, onOpenChange }: NotificationsCenterProps): React.JSX.Element | null {
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
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        title="Notifications (Cmd/Ctrl+B)"
        style={{
          alignItems: 'center',
          background: open ? 'var(--shell-accent-soft)' : 'var(--shell-panel-2)',
          border: `1px solid ${open ? 'var(--shell-accent-border)' : 'var(--shell-border)'}`,
          borderRadius: 6,
          color: open ? 'var(--shell-accent-text)' : 'var(--shell-text)',
          cursor: 'pointer',
          display: 'inline-flex',
          fontSize: 11,
          fontWeight: 850,
          gap: 6,
          height: 22,
          padding: '0 9px',
        }}
      >
        <span>Alerts</span>
        {unreadCount > 0 && (
          <span
            style={{
              alignItems: 'center',
              background: '#ef4444',
              borderRadius: 999,
              color: '#fff',
              display: 'inline-flex',
              fontSize: 10,
              fontWeight: 900,
              height: 16,
              justifyContent: 'center',
              minWidth: 16,
              padding: '0 4px',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <div
        aria-live="polite"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          position: 'fixed',
          right: 12,
          top: 42,
          zIndex: 9200,
        }}
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
        <div
          style={{
            background: 'linear-gradient(180deg, var(--shell-panel), var(--shell-panel-2))',
            border: '1px solid var(--shell-border)',
            borderRadius: 10,
            boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            color: 'var(--shell-text)',
            maxHeight: 'calc(100vh - 64px)',
            overflow: 'hidden',
            position: 'fixed',
            right: 12,
            top: 42,
            width: 420,
            zIndex: 9100,
          }}
        >
          <div
            style={{
              alignItems: 'center',
              borderBottom: '1px solid var(--shell-border)',
              display: 'flex',
              gap: 8,
              padding: '10px 12px',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 900 }}>Notifications</div>
              <div style={{ color: 'var(--shell-muted)', fontSize: 10, fontWeight: 700 }}>
                {unreadCount} unread / {items.length} active
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => { void raiseDemoNotification(); }} style={drawerButtonStyle()}>
              Test
            </button>
            <button type="button" onClick={() => { void api.markAllRead(); }} style={drawerButtonStyle()}>
              Mark read
            </button>
            <button type="button" onClick={() => { void api.clearAll(); }} style={drawerButtonStyle()}>
              Clear
            </button>
          </div>

          <div style={{ maxHeight: 'calc(100vh - 126px)', overflow: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ color: 'var(--shell-muted)', fontSize: 12, padding: 18 }}>
                No notifications yet.
              </div>
            ) : items.map((notification) => {
              const accent = severityColor(notification.severity);
              return (
                <div
                  key={notification.id}
                  style={{
                    borderBottom: '1px solid var(--shell-border)',
                    display: 'grid',
                    gap: 8,
                    gridTemplateColumns: '6px 1fr auto',
                    padding: '10px 12px',
                  }}
                >
                  <span style={{ background: accent, borderRadius: 999, height: 36, marginTop: 2, width: 4 }} />
                  <button
                    type="button"
                    onClick={() => { void openNotification(notification); }}
                    style={{
                      background: 'transparent',
                      border: 0,
                      color: 'inherit',
                      cursor: 'pointer',
                      minWidth: 0,
                      padding: 0,
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 3 }}>
                      {!notification.read && (
                        <span style={{ background: accent, borderRadius: 999, height: 7, width: 7 }} />
                      )}
                      <span style={{ color: accent, fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>
                        {notification.severity}
                      </span>
                      <span style={{ color: 'var(--shell-muted)', fontSize: 10, fontWeight: 700, marginLeft: 'auto' }}>
                        {formatTime(notification.ts)}
                      </span>
                    </div>
                    <div style={{ color: 'var(--shell-text)', fontSize: 12.5, fontWeight: notification.read ? 700 : 900 }}>
                      {notification.title}
                    </div>
                    {notification.body && (
                      <div style={{ color: 'var(--shell-muted)', fontSize: 11, fontWeight: 600, lineHeight: 1.35, marginTop: 3 }}>
                        {notification.body}
                      </div>
                    )}
                    <div style={{ color: 'var(--shell-muted)', fontSize: 10, fontWeight: 700, marginTop: 5 }}>
                      {sourceLabel(notification)}
                      {notification.action?.intent ? ` -> ${notification.action.intent}` : ''}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { void api.dismiss(notification.id); }}
                    title="Dismiss"
                    style={{
                      alignSelf: 'start',
                      background: 'transparent',
                      border: '1px solid var(--shell-border)',
                      borderRadius: 6,
                      color: 'var(--shell-muted)',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 900,
                      height: 24,
                      width: 24,
                    }}
                  >
                    x
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function drawerButtonStyle(): React.CSSProperties {
  return {
    background: 'var(--shell-panel-2)',
    border: '1px solid var(--shell-border)',
    borderRadius: 6,
    color: 'var(--shell-text)',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 850,
    height: 24,
    padding: '0 8px',
  };
}
