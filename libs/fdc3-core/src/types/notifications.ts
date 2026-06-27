import type { Fdc3Context } from './context.js';

/**
 * Shell notifications — a platform-level (not FDC3) service exposed to every
 * hosted app via `window.notifications`. Mirrors io.Connect's notification
 * surface: apps raise a notification with a title + severity, the shell shows
 * a toast (auto-dismissing) and keeps it in a persistent drawer until acked.
 *
 * Intentionally kept separate from the FDC3 surface so it can evolve at the
 * shell's own pace without dragging the interop contract.
 */
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

/**
 * Optional action attached to a notification. Clicking the toast (or the
 * drawer row) marks the notification read, then executes the action.
 *
 * `intent`      — raises a FDC3 intent via `window.fdc3.raiseIntent`.
 * `shellAction` — triggers a built-in shell command without FDC3.
 *   'applyUpdate'  — immediately applies the pending directory update.
 *   'openManager'  — opens the Manager / Distribution console.
 *   'openUrl'      — opens `url` in the default browser.
 */
export interface NotificationAction {
  intent?: string;
  context?: Fdc3Context;
  label?: string;
  shellAction?: 'applyUpdate' | 'openManager' | 'openUrl' | 'installShellUpdate';
  url?: string;
}

export interface NotificationRaiseInput {
  title: string;
  body?: string;
  severity?: NotificationSeverity;
  action?: NotificationAction;
  /** Optional override; otherwise auto-stamped from the raiser's appId. */
  sourceAppId?: string;
  /** Display title of the raiser; auto-resolved from the app directory when not given. */
  sourceTitle?: string;
  /** TTL in ms for auto-dismiss. Defaults to 5000ms. 0 = sticky. */
  ttlMs?: number;
}

export interface ShellNotification {
  id: string;
  ts: number;
  title: string;
  body?: string;
  severity: NotificationSeverity;
  sourceAppId?: string;
  sourceTitle?: string;
  action?: NotificationAction;
  ttlMs: number;
  read: boolean;
  dismissed: boolean;
}

/**
 * The shape exposed on `window.notifications`. Renderer + every hosted app
 * preload-injects the same surface.
 */
export interface NotificationsApi {
  raise(input: NotificationRaiseInput): Promise<string>;
  list(limit?: number): Promise<ShellNotification[]>;
  /** Returns all notifications including dismissed — for the history/audit view. */
  listHistory(limit?: number): Promise<ShellNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  dismiss(id: string): Promise<void>;
  /** Hides all active notifications from the tray; keeps history. Replaces clearAll. */
  dismissAll(): Promise<void>;
  unreadCount(): Promise<number>;
  /** Subscribe to any change (raise / mark / dismiss). Returns unsubscribe fn. */
  onChanged(handler: (snapshot: ShellNotification[]) => void): () => void;
}
