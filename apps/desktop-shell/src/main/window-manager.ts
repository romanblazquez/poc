import { app, BrowserWindow, webContents } from 'electron';
import type { BrowserWindowConstructorOptions, Rectangle } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import type { AppDefinition } from '@fdc3-poc/fdc3-core';
import type { WindowState } from '@fdc3-poc/workspace-engine';
import { IpcEvents } from '@fdc3-poc/interop-electron-adapter';
import type { ShellManifest } from './shell-assets-loader.js';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Returns the correct URL for an app window.
 * In dev: Vite dev server on the app's configured port.
 * In production: the app-directory URL, which may be file:// or http(s)://.
 */
function resolveAppUrl(app: AppDefinition): string {
  const baseUrl = isDev && app.devPort > 0
    ? `http://localhost:${app.devPort}`
    : app.url;
  return appendQuery(baseUrl, `fdc3AppId=${encodeURIComponent(app.appId)}`);
}

function appendQuery(url: string, query: string): string {
  const hashIndex = url.indexOf('#');
  const baseUrl = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${query}${hash}`;
}

export function resolveAppIdentityFromUrl(url: string, appDefs: AppDefinition[]): string | undefined {
  try {
    const parsed = new URL(url);
    const appId = parsed.searchParams.get('fdc3AppId');
    if (appId && appDefs.some((app) => app.appId === appId)) {
      return appId;
    }

    const port = parseInt(parsed.port, 10);
    if (port) {
      const byPort = appDefs.find((app) => app.devPort === port)?.appId;
      if (byPort) return byPort;
    }

    // External apps may redirect and drop query params. Fall back to matching
    // by origin/path against the configured app URL.
    const normalizedPath = normalizePath(parsed.pathname);
    for (const app of appDefs) {
      if (!/^https?:\/\//i.test(app.url)) continue;
      try {
        const appUrl = new URL(app.url);
        if (appUrl.origin !== parsed.origin) continue;
        const appPath = normalizePath(appUrl.pathname);
        if (normalizedPath === appPath || normalizedPath.startsWith(`${appPath}/`)) {
          return app.appId;
        }
      } catch {
        // Ignore malformed configured URLs.
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : '/';
}

function getShellUrl(): string {
  if (isDev) {
    return 'http://localhost:5173'; // electron-vite renderer dev server
  }
  return pathToFileURL(path.join(__dirname, '../renderer/index.html')).href;
}

export interface WindowEntry {
  window: BrowserWindow;
  appId: string;
}

export interface AppLifecycleSnapshot {
  appId: string;
  running: boolean;
  isMinimized: boolean;
  webContentsId: number | null;
}

export interface DetachedWorkspacePayload {
  id: string;
  name: string;
  panelIds: string[];
  layout: unknown | null;
  channelId: string | null;
  theme: string;
  sourceWorkspaceId?: string;
  targetX?: number;
  targetY?: number;
}

const SNAP_THRESHOLD = 18;
const ATTACH_THRESHOLD = 6;
const SNAP_DEBOUNCE_MS = 120;
const CUSTOM_TITLE_BAR_HEIGHT = 38; // Windows titleBarOverlay height; macOS uses trafficLightPosition (height ignored)

function customTitleBarOptions(backgroundColor: string): Partial<BrowserWindowConstructorOptions> {
  return {
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 6, y: 12 } } // x:6 = VS Code pattern; y=(36-12)/2=12 centers 12px circles
      : {
          titleBarOverlay: {
            color: backgroundColor,
            symbolColor: '#b8c4e8',
            height: CUSTOM_TITLE_BAR_HEIGHT,
          },
        }),
  };
}

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
  private readonly detachedWorkspaces = new Map<string, DetachedWorkspacePayload>();
  private readonly preloadPath: string;
  private isApplyingMagnetism = false;

  private getWindowIcon(): string | undefined {
    return this.shellManifest.iconWindowPath;
  }

  constructor(
    private readonly appDefs: AppDefinition[],
    private readonly shellManifest: ShellManifest,
  ) {
    this.preloadPath = path.join(__dirname, '../preload/index.js');
    // Magnetic behavior is disabled for workspace composition, but keep helpers compiled for optional app windows.
    void this.handleWindowMove;
  }

  createShellWindow(): BrowserWindow {
    const shellIcon = this.getWindowIcon();
    const win = new BrowserWindow({
      width: 1600,
      height: 960,
      minWidth: 900,
      minHeight: 600,
      ...customTitleBarOptions('#0f0f1a'),
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        sandbox: false, // required so the preload can use ipcRenderer
      },
      title: this.shellManifest.title,
      backgroundColor: '#0f0f1a',
      ...(shellIcon ? { icon: shellIcon } : {}),
      show: false,
    });

    if (process.platform === 'darwin' && this.shellManifest.iconDockPath && app.dock) {
      try {
        app.dock.setIcon(this.shellManifest.iconDockPath);
      } catch (error) {
        console.warn(`[WindowManager] Could not apply dock icon: ${(error as Error).message}`);
      }
    }

    win.loadURL(getShellUrl()).catch(console.error);
    win.once('ready-to-show', () => win.show());

    if (isDev) {
      win.webContents.openDevTools({ mode: 'detach' });
    }

    this.register(win, 'shell');
    return win;
  }

  focusOrCreateShellWindow(): BrowserWindow {
    const existing = this.findByAppId('shell');
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return existing;
    }
    return this.createShellWindow();
  }

  createWorkspaceWindow(payload: DetachedWorkspacePayload): BrowserWindow {
    this.detachedWorkspaces.set(payload.id, payload);
    const shellIcon = this.getWindowIcon();

    const win = new BrowserWindow({
      width: 1800,
      height: 1040,
      minWidth: 1100,
      minHeight: 700,
      ...(payload.targetX !== undefined && payload.targetY !== undefined
        ? { x: payload.targetX, y: payload.targetY }
        : {}),
      ...customTitleBarOptions('#090916'),
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        sandbox: false,
      },
      title: payload.name,
      backgroundColor: '#090916',
      ...(shellIcon ? { icon: shellIcon } : {}),
      show: false,
    });

    win.loadURL(appendQuery(getShellUrl(), `detachedWorkspaceId=${encodeURIComponent(payload.id)}`)).catch(console.error);

    const showWin = () => {
      if (win.isDestroyed() || win.isVisible()) return;
      win.show();
      win.focus();
    };
    win.once('ready-to-show', showWin);
    // ready-to-show can silently not fire on Windows — use did-finish-load and a
    // timeout as belt-and-suspenders fallbacks so the window always becomes visible.
    win.webContents.once('did-finish-load', showWin);
    const fallback = setTimeout(showWin, 3000);
    win.once('show', () => clearTimeout(fallback));

    this.register(win, `workspace:${payload.id}`);
    win.on('closed', () => this.returnDetachedWorkspace(payload.id));
    return win;
  }

  getWorkspaceWindowPayload(workspaceWindowId: string): DetachedWorkspacePayload | null {
    return this.detachedWorkspaces.get(workspaceWindowId) ?? null;
  }

  updateWorkspaceWindowPayload(payload: DetachedWorkspacePayload): void {
    this.detachedWorkspaces.set(payload.id, payload);
  }

  recallWorkspaceWindow(workspaceWindowId: string): boolean {
    const win = this.findByAppId(`workspace:${workspaceWindowId}`);
    if (!win || win.isDestroyed()) return false;
    win.close();
    return true;
  }

  private returnDetachedWorkspace(workspaceWindowId: string): void {
    const payload = this.detachedWorkspaces.get(workspaceWindowId);
    this.detachedWorkspaces.delete(workspaceWindowId);
    if (!payload) return;

    const shell = this.findByAppId('shell');
    if (!shell || shell.isDestroyed()) return;
    if (shell.isMinimized()) shell.restore();
    shell.focus();
    shell.webContents.send(IpcEvents.WORKSPACE_WINDOW_CLOSED, payload);
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
    const shellIcon = this.getWindowIcon();
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
      ...(shellIcon ? { icon: shellIcon } : {}),
      show: false,
    });

    // Deny any attempt by the app to open new windows
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    win.loadURL(resolveAppUrl(def)).catch(console.error);

    const showAppWin = () => {
      if (win.isDestroyed() || win.isVisible()) return;
      win.show();
    };
    win.once('ready-to-show', showAppWin);
    win.webContents.once('did-finish-load', showAppWin);
    const fallback = setTimeout(showAppWin, 3000);
    win.once('show', () => clearTimeout(fallback));

    this.register(win, appId);
    return win;
  }

  restartApp(appId: string): boolean {
    const exists = this.appDefs.some((appDef) => appDef.appId === appId);
    if (!exists) return false;

    const existing = this.findByAppId(appId);
    if (!existing || existing.isDestroyed()) {
      return !!this.openApp(appId);
    }

    existing.once('closed', () => {
      this.openApp(appId);
    });
    existing.close();
    return true;
  }

  private register(win: BrowserWindow, appId: string): void {
    const id = win.webContents.id;
    this.windows.set(id, { window: win, appId });
    this.lastBounds.set(id, win.getBounds());

    win.on('closed', () => {
      const timer = this.snapTimers.get(id);
      if (timer) clearTimeout(timer);
      this.windows.delete(id);
      this.lastBounds.delete(id);
      this.snapTimers.delete(id);
    });

    const sendFullscreenState = () => this.sendWindowFullscreenState(win);
    win.webContents.once('did-finish-load', sendFullscreenState);
    win.on('enter-full-screen', sendFullscreenState);
    win.on('leave-full-screen', sendFullscreenState);
    win.on('enter-html-full-screen', sendFullscreenState);
    win.on('leave-html-full-screen', sendFullscreenState);
  }

  private sendWindowFullscreenState(win: BrowserWindow): void {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send(IpcEvents.WINDOW_FULLSCREEN_CHANGED, this.isFullscreen(win));
  }

  private isFullscreen(win: BrowserWindow): boolean {
    return win.isFullScreen() || (process.platform === 'darwin' && win.isSimpleFullScreen());
  }

  findByAppId(appId: string): BrowserWindow | null {
    for (const entry of this.windows.values()) {
      if (entry.appId === appId && !entry.window.isDestroyed()) {
        return entry.window;
      }
    }
    return null;
  }

  getAppLifecycle(): AppLifecycleSnapshot[] {
    return this.appDefs.map((appDef) => {
      const win = this.findByAppId(appDef.appId);
      return {
        appId: appDef.appId,
        running: !!win,
        isMinimized: !!win?.isMinimized(),
        webContentsId: win && !win.isDestroyed() ? win.webContents.id : null,
      };
    });
  }

  closeAppsNotIn(appIds: Set<string>): void {
    for (const entry of this.windows.values()) {
      if (entry.appId === 'shell' || appIds.has(entry.appId) || entry.window.isDestroyed()) continue;
      entry.window.close();
    }
  }

  closeByWebContentsId(webContentsId: number): boolean {
    const entry = this.windows.get(webContentsId);
    if (entry && entry.appId !== 'shell' && !entry.window.isDestroyed()) {
      entry.window.close();
      return true;
    }

    const contents = webContents.fromId(webContentsId);
    if (contents && !contents.isDestroyed()) {
      contents.close();
      return true;
    }

    return false;
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

  // Deprecated: replaced by single-window Dockview workspace.
  // Do not use for main workspace runtime.
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
