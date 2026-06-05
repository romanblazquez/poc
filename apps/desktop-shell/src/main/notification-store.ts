import { randomUUID } from 'crypto';
import type { NotificationRaiseInput, NotificationSeverity, ShellNotification } from '@fdc3-poc/fdc3-core';

const RING_CAP = 200;
const DEFAULT_TTL_MS = 5_000;
const VALID_SEVERITIES: NotificationSeverity[] = ['info', 'success', 'warning', 'error'];

export type NotificationStoreListener = (snapshot: ShellNotification[]) => void;

/**
 * In-memory ring buffer of shell notifications. Apps raise via the preload
 * bridge; the store stamps `id`/`ts`/`sourceAppId` (resolved by the caller
 * from the sender's webContents) and notifies subscribers. Capped at 200
 * entries — old ones drop off the tail. Persistence across restarts is
 * deliberately NOT in v1: notifications are ephemeral, like a desk's tray.
 */
export class NotificationStore {
  private notifications: ShellNotification[] = [];
  private readonly listeners = new Set<NotificationStoreListener>();

  raise(input: NotificationRaiseInput, source?: { appId?: string; title?: string }): ShellNotification {
    const severity: NotificationSeverity =
      input.severity && VALID_SEVERITIES.includes(input.severity) ? input.severity : 'info';
    const ttlMs = typeof input.ttlMs === 'number' && input.ttlMs >= 0 ? input.ttlMs : DEFAULT_TTL_MS;
    const notification: ShellNotification = {
      id: randomUUID(),
      ts: Date.now(),
      title: String(input.title ?? '').slice(0, 200),
      body: input.body ? String(input.body).slice(0, 2000) : undefined,
      severity,
      sourceAppId: input.sourceAppId ?? source?.appId,
      sourceTitle: input.sourceTitle ?? source?.title,
      action: input.action,
      ttlMs,
      read: false,
      dismissed: false,
    };
    this.notifications = [notification, ...this.notifications].slice(0, RING_CAP);
    this.emit();
    return notification;
  }

  list(limit?: number): ShellNotification[] {
    const visible = this.notifications.filter((n) => !n.dismissed);
    return typeof limit === 'number' ? visible.slice(0, limit) : visible;
  }

  unreadCount(): number {
    return this.notifications.filter((n) => !n.read && !n.dismissed).length;
  }

  markRead(id: string): boolean {
    const found = this.notifications.find((n) => n.id === id);
    if (!found || found.read) return false;
    found.read = true;
    this.emit();
    return true;
  }

  markAllRead(): void {
    let changed = false;
    for (const n of this.notifications) {
      if (!n.read) { n.read = true; changed = true; }
    }
    if (changed) this.emit();
  }

  dismiss(id: string): boolean {
    const found = this.notifications.find((n) => n.id === id);
    if (!found || found.dismissed) return false;
    found.dismissed = true;
    this.emit();
    return true;
  }

  clearAll(): void {
    if (this.notifications.length === 0) return;
    this.notifications = [];
    this.emit();
  }

  subscribe(listener: NotificationStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.list();
    for (const l of this.listeners) {
      try { l(snap); } catch (err) { console.warn('[notifications] listener threw', err); }
    }
  }
}
