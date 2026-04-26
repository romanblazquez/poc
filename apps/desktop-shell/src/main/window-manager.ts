import { BrowserWindow, webContents } from 'electron';
import type { Rectangle } from 'electron';
import path from 'path';
import type { AppDefinition } from '@fdc3-poc/fdc3-core';
import type { WindowState } from '@fdc3-poc/workspace-engine';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Returns the correct URL for an app window.
 * In dev: Vite dev server on the app's configured port.
 * In production: file:// path to the built index.html.
 */
function resolveAppUrl(app: AppDefinition): string {
  if (isDev) {
    return `http://localhost:${app.devPort}`;
  }
  // Production: apps are bundled next to the binary
  return app.url;
}

function getShellUrl(): string {
  if (isDev) {
    return 'http://localhost:5173'; // electron-vite renderer dev server
  }
  return `file://${path.join(__dirname, '../renderer/index.html')}`;
}

function appendQuery(url: string, query: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

export interface WindowEntry {
  window: BrowserWindow;
  appId: string;
}

const SNAP_THRESHOLD = 18;
const ATTACH_THRESHOLD = 6;
const SNAP_DEBOUNCE_MS = 120;

/**
 * WindowManager — owns all BrowserWindow lifecycles.
 *
 * Responsibilities:
 * - Create windows with secure defaults (contextIsolation, no nodeIntegration)
 * - Inject the preload script into every window
 * - Track webContentsId → { window, appId }
 * - Open / focus apps
 * - Snapshot bounds for workspace persistence
 */
export class WindowManager {
  private readonly windows = new Map<number, WindowEntry>();
  private readonly lastBounds = new Map<number, Rectangle>();
  private readonly snapTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly preloadPath: string;
  private isApplyingMagnetism = false;

  constructor(private readonly appDefs: AppDefinition[]) {
    this.preloadPath = path.join(__dirname, '../preload/index.js');
  }

  createShellWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: 1600,
      height: 960,
      minWidth: 900,
      minHeight: 600,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        sandbox: false, // required so the preload can use ipcRenderer
      },
      title: 'FDC3 Desktop Shell',
      backgroundColor: '#0f0f1a',
      show: false,
    });

    win.loadURL(getShellUrl()).catch(console.error);
    win.once('ready-to-show', () => win.show());

    if (isDev) {
      win.webContents.openDevTools({ mode: 'detach' });
    }

    this.register(win, 'shell');
    return win;
  }

  createWorkspaceWindow(workspaceWindowId: string, title: string): BrowserWindow {
    const win = new BrowserWindow({
      width: 1800,
      height: 1040,
      minWidth: 1100,
      minHeight: 700,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        sandbox: false,
      },
      title,
      backgroundColor: '#090916',
      show: false,
    });

    win.loadURL(appendQuery(getShellUrl(), `workspaceWindowId=${encodeURIComponent(workspaceWindowId)}`)).catch(console.error);
    win.once('ready-to-show', () => win.show());
    this.register(win, `workspace:${workspaceWindowId}`);
    return win;
  }

  openApp(appId: string): BrowserWindow | null {
    // Focus existing window if already open
    const existing = this.findByAppId(appId);
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return existing;
    }

    const def = this.appDefs.find((a) => a.appId === appId);
    if (!def) {
      console.error(`[WindowManager] Unknown appId: ${appId}`);
      return null;
    }

    const layout = def.initialLayout ?? { width: 800, height: 600 };
    const win = new BrowserWindow({
      width: layout.width,
      height: layout.height,
      x: layout.x,
      y: layout.y,
      minWidth: 380,
      minHeight: 300,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
      title: def.title,
      backgroundColor: '#ffffff',
      show: false,
    });

    // Deny any attempt by the app to open new windows
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    win.loadURL(resolveAppUrl(def)).catch(console.error);
    win.once('ready-to-show', () => win.show());

    this.register(win, appId);
    return win;
  }

  private register(win: BrowserWindow, appId: string): void {
    const id = win.webContents.id;
    this.windows.set(id, { window: win, appId });
    this.lastBounds.set(id, win.getBounds());

    if (appId !== 'shell') {
      win.on('move', () => {
        this.handleWindowMove(win);
      });
    }

    win.on('closed', () => {
      const timer = this.snapTimers.get(id);
      if (timer) clearTimeout(timer);
      this.windows.delete(id);
      this.lastBounds.delete(id);
      this.snapTimers.delete(id);
    });
  }

  findByAppId(appId: string): BrowserWindow | null {
    for (const entry of this.windows.values()) {
      if (entry.appId === appId && !entry.window.isDestroyed()) {
        return entry.window;
      }
    }
    return null;
  }

  closeAppsNotIn(appIds: Set<string>): void {
    for (const entry of this.windows.values()) {
      if (entry.appId === 'shell' || appIds.has(entry.appId) || entry.window.isDestroyed()) continue;
      entry.window.close();
    }
  }

  getEntry(webContentsId: number): WindowEntry | undefined {
    return this.windows.get(webContentsId);
  }

  getAllWebContentsIds(): number[] {
    return [
      ...new Set([
        ...this.windows.keys(),
        ...webContents.getAllWebContents().filter((contents) => !contents.isDestroyed()).map((contents) => contents.id),
      ]),
    ];
  }

  getPreloadPath(): string {
    return this.preloadPath;
  }

  sendTo(webContentsId: number, channel: string, ...args: unknown[]): void {
    const entry = this.windows.get(webContentsId);
    if (entry && !entry.window.isDestroyed()) {
      entry.window.webContents.send(channel, ...args);
      return;
    }

    const contents = webContents.fromId(webContentsId);
    if (contents && !contents.isDestroyed()) {
      contents.send(channel, ...args);
    }
  }

  /** Snapshot current window state for workspace persistence. */
  snapshot(): WindowState[] {
    return [...this.windows.entries()]
      .filter(([, e]) => !e.window.isDestroyed())
      .map(([, entry]) => ({
        appId: entry.appId,
        channelId: null, // filled in by IpcRouter which owns channel state
        bounds: entry.window.getBounds(),
        isMinimized: entry.window.isMinimized(),
      }));
  }

  restoreWindow(state: WindowState): void {
    if (state.appId === 'shell') return; // shell is always created at startup
    const win = this.openApp(state.appId);
    if (win) {
      win.setBounds(state.bounds);
      this.lastBounds.set(win.webContents.id, win.getBounds());
    }
  }

  private handleWindowMove(activeWindow: BrowserWindow): void {
    if (activeWindow.isDestroyed() || activeWindow.isMinimized()) return;

    const activeId = activeWindow.webContents.id;
    const previous = this.lastBounds.get(activeId);
    const current = activeWindow.getBounds();

    if (!this.isApplyingMagnetism && previous) {
      const deltaX = current.x - previous.x;
      const deltaY = current.y - previous.y;
      if (deltaX !== 0 || deltaY !== 0) {
        this.moveAttachedWindows(activeId, previous, deltaX, deltaY);
      }
    }

    this.lastBounds.set(activeId, activeWindow.getBounds());
    this.scheduleSnap(activeWindow);
  }

  private scheduleSnap(activeWindow: BrowserWindow): void {
    const activeId = activeWindow.webContents.id;
    const existingTimer = this.snapTimers.get(activeId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.snapTimers.delete(activeId);
      this.snapToNearbyWindows(activeWindow);
    }, SNAP_DEBOUNCE_MS);

    this.snapTimers.set(activeId, timer);
  }

  private moveAttachedWindows(
    activeId: number,
    previousActiveBounds: Rectangle,
    deltaX: number,
    deltaY: number,
  ): void {
    const attachedIds = this.getAttachedWindowIds(activeId, previousActiveBounds);
    if (attachedIds.length === 0) return;

    this.isApplyingMagnetism = true;
    try {
      for (const attachedId of attachedIds) {
        const entry = this.windows.get(attachedId);
        if (!entry || entry.window.isDestroyed() || entry.window.isMinimized()) continue;

        const bounds = entry.window.getBounds();
        const nextBounds = { ...bounds, x: bounds.x + deltaX, y: bounds.y + deltaY };
        entry.window.setBounds(nextBounds, false);
        this.lastBounds.set(attachedId, nextBounds);
      }
    } finally {
      this.isApplyingMagnetism = false;
    }
  }

  private getAttachedWindowIds(activeId: number, activeBounds: Rectangle): number[] {
    const attached = new Set<number>();
    const queue: Array<{ id: number; bounds: Rectangle }> = [{ id: activeId, bounds: activeBounds }];
    const previousBounds = new Map(this.lastBounds);
    previousBounds.set(activeId, activeBounds);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      for (const [candidateId, candidateBounds] of previousBounds.entries()) {
        if (candidateId === current.id || candidateId === activeId || attached.has(candidateId)) continue;

        const candidateEntry = this.windows.get(candidateId);
        const candidate = candidateEntry?.window;
        if (!candidateEntry || candidateEntry.appId === 'shell' || !candidate || candidate.isDestroyed() || candidate.isMinimized()) continue;

        if (areAttached(current.bounds, candidateBounds)) {
          attached.add(candidateId);
          queue.push({ id: candidateId, bounds: candidateBounds });
        }
      }
    }

    return [...attached];
  }

  private snapToNearbyWindows(activeWindow: BrowserWindow): void {
    if (this.isApplyingMagnetism || activeWindow.isDestroyed() || activeWindow.isMinimized()) return;

    const activeBounds = activeWindow.getBounds();
    let nextX = activeBounds.x;
    let nextY = activeBounds.y;

    for (const entry of this.windows.values()) {
      const target = entry.window;
      if (entry.appId === 'shell' || target.id === activeWindow.id || target.isDestroyed() || target.isMinimized()) continue;

      const targetBounds = target.getBounds();
      const verticalOverlap = rangesOverlap(
        activeBounds.y,
        activeBounds.y + activeBounds.height,
        targetBounds.y,
        targetBounds.y + targetBounds.height,
      );
      const horizontalOverlap = rangesOverlap(
        activeBounds.x,
        activeBounds.x + activeBounds.width,
        targetBounds.x,
        targetBounds.x + targetBounds.width,
      );

      if (verticalOverlap) {
        const activeLeftToTargetRight = Math.abs(activeBounds.x - (targetBounds.x + targetBounds.width));
        const activeRightToTargetLeft = Math.abs(activeBounds.x + activeBounds.width - targetBounds.x);
        if (activeLeftToTargetRight <= SNAP_THRESHOLD) nextX = targetBounds.x + targetBounds.width;
        if (activeRightToTargetLeft <= SNAP_THRESHOLD) nextX = targetBounds.x - activeBounds.width;
      }

      if (horizontalOverlap) {
        const activeTopToTargetBottom = Math.abs(activeBounds.y - (targetBounds.y + targetBounds.height));
        const activeBottomToTargetTop = Math.abs(activeBounds.y + activeBounds.height - targetBounds.y);
        if (activeTopToTargetBottom <= SNAP_THRESHOLD) nextY = targetBounds.y + targetBounds.height;
        if (activeBottomToTargetTop <= SNAP_THRESHOLD) nextY = targetBounds.y - activeBounds.height;
      }
    }

    if (nextX === activeBounds.x && nextY === activeBounds.y) return;

    this.isApplyingMagnetism = true;
    try {
      const nextBounds = { ...activeBounds, x: nextX, y: nextY };
      activeWindow.setBounds(nextBounds, false);
      this.lastBounds.set(activeWindow.webContents.id, nextBounds);
    } finally {
      this.isApplyingMagnetism = false;
    }
  }
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

function areAttached(a: Rectangle, b: Rectangle): boolean {
  const verticalOverlap = rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height);
  const horizontalOverlap = rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width);

  const leftToRight = Math.abs(a.x - (b.x + b.width)) <= ATTACH_THRESHOLD;
  const rightToLeft = Math.abs(a.x + a.width - b.x) <= ATTACH_THRESHOLD;
  const topToBottom = Math.abs(a.y - (b.y + b.height)) <= ATTACH_THRESHOLD;
  const bottomToTop = Math.abs(a.y + a.height - b.y) <= ATTACH_THRESHOLD;

  return (verticalOverlap && (leftToRight || rightToLeft)) || (horizontalOverlap && (topToBottom || bottomToTop));
}
