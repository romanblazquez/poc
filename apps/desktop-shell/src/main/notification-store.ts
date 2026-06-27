import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { NotificationRaiseInput, NotificationSeverity, ShellNotification } from '@fdc3-poc/fdc3-core';

const RING_CAP = 500;
const DEFAULT_TTL_MS = 5_000;
const VALID_SEVERITIES: NotificationSeverity[] = ['info', 'success', 'warning', 'error'];

export type NotificationStoreListener = (snapshot: ShellNotification[]) => void;

/**
 * Notification store — persisted ring buffer.
 *
 * Persistence: notifications survive app restarts. The store is written to
 * `<userData>/notifications.json` on every mutation.
 *
 * Dismissal vs deletion: `dismiss()` / `dismissAll()` hides a notification
 * from the active tray but keeps it in the persisted history. `list()` returns
 * only visible items; `listHistory()` returns everything including dismissed.
 * Hard deletion is never triggered by user action — only `purgeOlderThan()`
 * (called on startup) trims entries older than 30 days.
 */
export class NotificationStore {
  private notifications: ShellNotification[] = [];
  private readonly listeners = new Set<NotificationStoreListener>();
  private persistPath: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

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
    this.scheduleSave();
    this.emit();
    return notification;
  }

  /** Returns only non-dismissed notifications (the active tray). */
  list(limit?: number): ShellNotification[] {
    const visible = this.notifications.filter((n) => !n.dismissed);
    return typeof limit === 'number' ? visible.slice(0, limit) : visible;
  }

  /** Returns all notifications including dismissed (for the history/audit view). */
  listHistory(limit?: number): ShellNotification[] {
    return typeof limit === 'number' ? this.notifications.slice(0, limit) : [...this.notifications];
  }

  unreadCount(): number {
    return this.notifications.filter((n) => !n.read && !n.dismissed).length;
  }

  markRead(id: string): boolean {
    const found = this.notifications.find((n) => n.id === id);
    if (!found || found.read) return false;
    found.read = true;
    this.scheduleSave();
    this.emit();
    return true;
  }

  markAllRead(): void {
    let changed = false;
    for (const n of this.notifications) {
      if (!n.read) { n.read = true; changed = true; }
    }
    if (changed) { this.scheduleSave(); this.emit(); }
  }

  /** Hide a notification from the active tray — keeps it in history. */
  dismiss(id: string): boolean {
    const found = this.notifications.find((n) => n.id === id);
    if (!found || found.dismissed) return false;
    found.dismissed = true;
    found.read = true;
    this.scheduleSave();
    this.emit();
    return true;
  }

  /** Hide all active notifications — keeps them in history. */
  dismissAll(): void {
    let changed = false;
    for (const n of this.notifications) {
      if (!n.dismissed) { n.dismissed = true; n.read = true; changed = true; }
    }
    if (changed) { this.scheduleSave(); this.emit(); }
  }

  /** Restore all dismissed notifications back to the active tray. */
  restoreAll(): void {
    let changed = false;
    for (const n of this.notifications) {
      if (n.dismissed) { n.dismissed = false; changed = true; }
    }
    if (changed) { this.scheduleSave(); this.emit(); }
  }

  /** Hard-delete entries older than `ageDays` (called once on startup). */
  purgeOlderThan(ageDays = 30): void {
    const cutoff = Date.now() - ageDays * 24 * 60 * 60 * 1000;
    const before = this.notifications.length;
    this.notifications = this.notifications.filter((n) => n.ts >= cutoff);
    if (this.notifications.length !== before) this.scheduleSave();
  }

  subscribe(listener: NotificationStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─── persistence ──────────────────────────────────────────────────────────

  private getPersistPath(): string {
    if (this.persistPath) return this.persistPath;
    const userData = app.getPath('userData');
    this.persistPath = path.join(userData, 'notifications.json');
    return this.persistPath;
  }

  private load(): void {
    try {
      const p = this.getPersistPath();
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (Array.isArray(raw)) {
          this.notifications = raw.slice(0, RING_CAP);
        }
      }
    } catch {
      this.notifications = [];
    }
    this.purgeOlderThan(30);
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persist();
    }, 250);
  }

  private persist(): void {
    try {
      const p = this.getPersistPath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(this.notifications, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[notifications] persist failed:', e);
    }
  }

  // ─── internal ─────────────────────────────────────────────────────────────

  private emit(): void {
    const snap = this.list();
    for (const l of this.listeners) {
      try { l(snap); } catch (err) { console.warn('[notifications] listener threw', err); }
    }
  }
}
