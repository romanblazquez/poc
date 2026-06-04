import { app, BrowserWindow, ipcMain, webContents, screen } from 'electron';
import type { WebContents } from 'electron';
import { randomUUID } from 'crypto';
import type { AppIntent, AppLogEvent, AppLogLevel, AppLogOrigin, AppLogRuntime, Fdc3Context, FlowPolicy, ImplementationMetadata, IntentResolution, InteropActivityEvent, InteropActivityKind, InteropActivityStatus, InteropRouteSnapshot, InteropSnapshot, PrivateChannelMarker, RuntimeAppSnapshot, RuntimeChannelSnapshot, ThemeContext, ThemeName } from '@fdc3-poc/fdc3-core';
import { NoAppsFoundError } from '@fdc3-poc/fdc3-core';
import { IpcEvents } from '@fdc3-poc/interop-electron-adapter';
import type { ChannelManager } from '@fdc3-poc/channel-engine';
import { AppChannelStore, PrivateChannelStore } from '@fdc3-poc/channel-engine';
import type { AppChannelMeta, PrivateChannelLifecycleEvent } from '@fdc3-poc/channel-engine';
import type { IntentRegistry } from '@fdc3-poc/intent-engine';
import { IntentResolver } from '@fdc3-poc/intent-engine';
import { AppRegistry } from '@fdc3-poc/app-registry';
import { IntentResolverWindowManager } from './intent-resolver-window.js';
import { resolveAppIdentityFromUrl, type WindowManager } from './window-manager.js';
import type { DetachedWorkspacePayload } from './window-manager.js';
import type { WorkspaceManager } from './workspace-manager.js';
import type { ThemeManager } from './theme-manager.js';
import type { AppDefinition } from '@fdc3-poc/fdc3-core';

/**
 * IpcRouter — the heart of the FDC3 main-process implementation.
 *
 * Handles every ipcMain.handle() call from renderer preloads and routes
 * context, intents, and channel commands to the correct windows.
 */
export class IpcRouter {
  private static readonly ACTIVITY_LIMIT = 250;
  private static readonly APP_LOG_LIMIT = 500;
  private readonly intentResolver: IntentResolver;
  private readonly pendingIntentResults = new Map<string, (result?: Fdc3Context) => void>();
  private readonly activityLog: InteropActivityEvent[] = [];
  private readonly appLogs: AppLogEvent[] = [];
  private readonly logCaptureWebContentsIds = new Set<number>();
  private appLogCaptureRegistered = false;
  /** Routing policy pushed by the renderer Interop Flow designer. null = unrestricted. */
  private flowPolicy: FlowPolicy | null = null;
  /** Read-only registry used by FDC3 discovery (findIntent / findIntentsByContext). */
  private readonly appRegistry: AppRegistry;
  /** FDC3 App Channels (`getOrCreateChannel`). Separate from user channels. */
  private readonly appChannels = new AppChannelStore();
  /** FDC3 PrivateChannels (`createPrivateChannel` + intent-result delivery). */
  private readonly privateChannels = new PrivateChannelStore();
  /** Modal resolver windows shown when more than one app handles a raised intent. */
  private readonly intentResolverWindows = new IntentResolverWindowManager();

  /**
   * Resolve an appId for any webContents — BrowserWindow apps (via the registry)
   * and webview-embedded apps (via fdc3AppId query or dev-port lookup).
   */
  private getAppIdForWebContents(webContentsId: number): string | undefined {
    const entry = this.windowManager.getEntry(webContentsId);
    if (entry) return entry.appId;

    const wc = webContents.fromId(webContentsId);
    if (!wc || wc.isDestroyed()) return undefined;
    return resolveAppIdentityFromUrl(wc.getURL(), this.appDirectory);
  }

  constructor(
    private readonly windowManager: WindowManager,
    private readonly channelManager: ChannelManager,
    private readonly intentRegistry: IntentRegistry,
    private readonly workspaceManager: WorkspaceManager,
    private readonly themeManager: ThemeManager,
    private readonly appDirectory: AppDefinition[],
  ) {
    this.intentResolver = new IntentResolver();
    this.appRegistry = new AppRegistry(appDirectory);
  }

  private emitActivity(input: {
    kind: InteropActivityKind;
    status: InteropActivityStatus;
    message: string;
    sourceAppId?: string;
    targetAppId?: string;
    appId?: string;
    channelId?: string | null;
    contextType?: string;
    intentName?: string;
    payload?: unknown;
  }): void {
    const event: InteropActivityEvent = {
      id: randomUUID(),
      ts: Date.now(),
      ...input,
    };
    this.activityLog.unshift(event);
    if (this.activityLog.length > IpcRouter.ACTIVITY_LIMIT) {
      this.activityLog.length = IpcRouter.ACTIVITY_LIMIT;
    }
    for (const id of this.windowManager.getAllWebContentsIds()) {
      this.windowManager.sendTo(id, IpcEvents.INTEROP_ACTIVITY, event);
    }
  }

  private registerAppLogCapture(): void {
    if (this.appLogCaptureRegistered) return;
    this.appLogCaptureRegistered = true;

    for (const contents of webContents.getAllWebContents()) {
      this.attachAppLogCapture(contents);
    }

    app.on('web-contents-created', (_event, contents) => {
      this.attachAppLogCapture(contents);
    });
  }

  private attachAppLogCapture(contents: WebContents): void {
    if (contents.isDestroyed() || this.logCaptureWebContentsIds.has(contents.id)) return;
    this.logCaptureWebContentsIds.add(contents.id);

    contents.on('console-message', (_event, level, message, line, sourceId) => {
      this.emitAppLog(contents, {
        level: this.normalizeConsoleLevel(level),
        origin: 'console',
        message,
        line,
        sourceUrl: sourceId,
      });
    });

    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return; // -3 = aborted navigation, common during reloads.
      this.emitAppLog(contents, {
        level: 'error',
        origin: 'navigation',
        message: `Navigation failed (${errorCode}): ${errorDescription}`,
        sourceUrl: validatedURL,
      });
    });

    contents.on('render-process-gone', (_event, details) => {
      this.emitAppLog(contents, {
        level: 'error',
        origin: 'renderer',
        message: `Renderer process gone: ${details.reason}${details.exitCode !== undefined ? ` (${details.exitCode})` : ''}`,
      });
    });

    contents.on('destroyed', () => {
      this.logCaptureWebContentsIds.delete(contents.id);
    });
  }

  private normalizeConsoleLevel(level: number): AppLogLevel {
    if (level >= 3) return 'error';
    if (level === 2) return 'warning';
    if (level === 1) return 'info';
    return 'debug';
  }

  private emitAppLog(
    contents: WebContents,
    input: { level: AppLogLevel; origin: AppLogOrigin; message: string; category?: string; data?: unknown; line?: number; sourceUrl?: string },
  ): void {
    const pageUrl = contents.isDestroyed() ? undefined : contents.getURL();
    const entry = this.windowManager.getEntry(contents.id);
    const resolvedAppId =
      entry?.appId ??
      (pageUrl ? resolveAppIdentityFromUrl(pageUrl, this.appDirectory) : undefined) ??
      (input.sourceUrl ? resolveAppIdentityFromUrl(input.sourceUrl, this.appDirectory) : undefined);
    const appId = resolvedAppId ?? 'unknown';
    const event: AppLogEvent = {
      id: randomUUID(),
      ts: Date.now(),
      appId,
      appTitle: this.appTitle(appId),
      runtime: this.resolveLogRuntime(contents, appId),
      webContentsId: contents.id,
      level: input.level,
      origin: input.origin,
      message: this.trimLogMessage(input.message),
      category: input.category,
      data: input.data,
      line: input.line && input.line > 0 ? input.line : undefined,
      sourceUrl: input.sourceUrl || undefined,
      pageUrl,
    };

    this.appLogs.unshift(event);
    if (this.appLogs.length > IpcRouter.APP_LOG_LIMIT) {
      this.appLogs.length = IpcRouter.APP_LOG_LIMIT;
    }

    for (const id of this.windowManager.getAllWebContentsIds()) {
      if (this.canReceiveAppLog(id, event)) {
        this.windowManager.sendTo(id, IpcEvents.APP_LOG, event);
      }
    }
  }

  private canManageAppLogs(webContentsId: number): boolean {
    const appId = this.getAppIdForWebContents(webContentsId);
    return appId === 'shell' || appId?.startsWith('workspace:') === true;
  }

  private canReceiveAppLog(webContentsId: number, log: AppLogEvent): boolean {
    if (this.canManageAppLogs(webContentsId)) return true;
    return this.getAppIdForWebContents(webContentsId) === log.appId;
  }

  private resolveLogRuntime(contents: WebContents, appId: string): AppLogRuntime {
    const entry = this.windowManager.getEntry(contents.id);
    if (entry?.appId === 'shell') return 'shell';
    if (entry?.appId.startsWith('workspace:')) return 'workspace';
    if (entry) return 'standalone';
    if (appId !== 'unknown') return 'embedded';

    const url = contents.isDestroyed() ? '' : contents.getURL();
    if (url.startsWith('http://') || url.startsWith('https://')) return 'external';
    return 'unknown';
  }

  private trimLogMessage(message: string): string {
    const maxLength = 2_000;
    return message.length > maxLength ? `${message.slice(0, maxLength)}...` : message;
  }

  private normalizeAppLogLevel(level: unknown): AppLogLevel {
    if (level === 'error') return 'error';
    if (level === 'warning' || level === 'warn') return 'warning';
    if (level === 'debug') return 'debug';
    return 'info';
  }

  private appTitle(appId: string | undefined): string {
    if (!appId) return 'unknown';
    return this.appDirectory.find((app) => app.appId === appId)?.title ?? appId;
  }

  private isRegisteredApp(appId: string | undefined): appId is string {
    return !!appId && this.appDirectory.some((entry) => entry.appId === appId);
  }

  private routeKey(sourceAppId: string, signal: string, targetAppId: string): string {
    return `${sourceAppId}:${signal}:${targetAppId}`;
  }

  private isContextRouteAllowedForApp(sourceAppId: string | undefined, contextType: string, targetAppId: string | undefined): boolean {
    if (!this.flowPolicy || !this.flowPolicy.enabled || !sourceAppId || !targetAppId) return true;
    return !this.flowPolicy.disabledContextRoutes.includes(this.routeKey(sourceAppId, contextType, targetAppId));
  }

  private isIntentRouteAllowedForApp(sourceAppId: string | undefined, intentName: string, targetAppId: string | undefined): boolean {
    if (!this.flowPolicy || !this.flowPolicy.enabled || !sourceAppId || !targetAppId) return true;
    return !this.flowPolicy.disabledIntentRoutes.includes(this.routeKey(sourceAppId, intentName, targetAppId));
  }

  register(): void {
    this.registerAppLogCapture();
    this.handleBroadcast();
    this.handleRaiseIntent();
    this.handleAddContextListener();
    this.handleRemoveContextListener();
    this.handleAddIntentListener();
    this.handleRemoveIntentListener();
    this.handleCompleteIntent();
    this.handleJoinChannel();
    this.handleLeaveChannel();
    this.handleGetCurrentChannel();
    this.handleGetUserChannels();
    this.handleOpenApp();
    this.handleGetWindowId();
    this.handleSaveWorkspace();
    this.handleGetAppList();
    this.handleGetPreloadPath();
    this.handleGetTheme();
    this.handleSetTheme();
    this.handleSetFlowPolicy();
    this.handleGetInteropSnapshot();
    this.handleAppLogWrite();
    this.handleGetAppLogs();
    this.handleClearAppLogs();
    this.handleOpenWorkspaceWindow();
    this.handleGetWorkspaceWindowPayload();
    this.handleUpdateWorkspaceWindowPayload();
    this.handleRecallWorkspaceWindow();
    this.handleCloseCurrentWindow();
    this.handleGetDisplays();
    this.handleGetInfo();
    this.handleFindIntent();
    this.handleFindIntentsByContext();
    this.handleGetOrCreateAppChannel();
    this.handleAppChannelBroadcast();
    this.handleAppChannelAddListener();
    this.handleAppChannelRemoveListener();
    this.handleAppChannelGetCurrentContext();
    this.handleCreatePrivateChannel();
    this.handlePrivateChannelConnect();
    this.handlePrivateChannelBroadcast();
    this.handlePrivateChannelAddListener();
    this.handlePrivateChannelRemoveListener();
    this.handlePrivateChannelGetCurrentContext();
    this.handlePrivateChannelDisconnect();
    this.handleIntentResolverGetPayload();
    this.handleIntentResolverPick();
    this.handleIntentResolverCancel();
    this.handleGetZoom();
    this.handleSetZoom();
    this.handleGetWindowFullscreen();
  }

  // ─── Global zoom (shell-chrome) ───────────────────────────────────────────

  /** Active zoom factor applied to every webContents. 1.0 = 100%. */
  private zoomFactor = 1;
  private static readonly ZOOM_MIN = 0.5;
  private static readonly ZOOM_MAX = 2.0;
  private static readonly ZOOM_STEP = 0.1;

  private clampZoom(f: number): number {
    if (!Number.isFinite(f)) return 1;
    return Math.min(IpcRouter.ZOOM_MAX, Math.max(IpcRouter.ZOOM_MIN, Math.round(f * 100) / 100));
  }

  private broadcastZoom(): void {
    // Push to every webContents — covers shell, detached app windows, AND
    // embedded <webview> apps. `webContents.getAllWebContents()` is the
    // electron-side global registry; webview tags create their own entries.
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue;
      try { wc.send(IpcEvents.ZOOM_CHANGED, this.zoomFactor); } catch { /* defensive */ }
    }
  }

  private handleGetZoom(): void {
    ipcMain.handle(IpcEvents.GET_ZOOM, () => this.zoomFactor);
  }

  private handleSetZoom(): void {
    ipcMain.handle(IpcEvents.SET_ZOOM, (_event, factor: number) => {
      this.zoomFactor = this.clampZoom(factor);
      this.broadcastZoom();
      return this.zoomFactor;
    });
    void IpcRouter.ZOOM_STEP; // referenced by the renderer; defined here so the constant lives in one place
  }

  private handleGetWindowFullscreen(): void {
    ipcMain.handle(IpcEvents.GET_WINDOW_FULLSCREEN, (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      return Boolean(win && !win.isDestroyed() && (win.isFullScreen() || (process.platform === 'darwin' && win.isSimpleFullScreen())));
    });
  }

  // ─── Context broadcasting ─────────────────────────────────────────────────

  private handleBroadcast(): void {
    ipcMain.handle(IpcEvents.BROADCAST, (event, context: Fdc3Context) => {
      const senderId = event.sender.id;
      const senderAppId = this.getAppIdForWebContents(senderId);
      const channelId = this.channelManager.getCurrentChannelId(senderId);
      // FDC3 2.0 OriginatingAppMetadata — delivered as the listener's 2nd arg.
      const sourceMetadata = senderAppId ? { source: { appId: senderAppId } } : undefined;
      this.emitActivity({
        kind: 'context.broadcasted',
        status: 'ok',
        sourceAppId: senderAppId,
        channelId,
        contextType: context.type,
        message: `${this.appTitle(senderAppId)} broadcast ${context.type}${channelId ? ` on ${channelId}` : ' globally'}`,
        payload: context,
      });

      if (!channelId) {
        // No channel: global broadcast to ALL windows except sender
        for (const id of this.windowManager.getAllWebContentsIds()) {
          if (id === senderId) continue;
          const targetAppId = this.getAppIdForWebContents(id);
          if (this.isContextRouteAllowed(senderAppId, context.type, id)) {
            this.windowManager.sendTo(id, IpcEvents.CONTEXT_UPDATE, context, sourceMetadata);
            if (this.isRegisteredApp(targetAppId)) {
              this.emitActivity({
                kind: 'context.delivered',
                status: 'ok',
                sourceAppId: senderAppId,
                targetAppId,
                contextType: context.type,
                message: `${context.type} delivered to ${this.appTitle(targetAppId)}`,
              });
            }
          } else if (this.isRegisteredApp(targetAppId)) {
            this.emitActivity({
              kind: 'context.blocked',
              status: 'blocked',
              sourceAppId: senderAppId,
              targetAppId,
              contextType: context.type,
              message: `${context.type} blocked from ${this.appTitle(senderAppId)} to ${this.appTitle(targetAppId)}`,
            });
          }
        }
        return;
      }

      // Channel broadcast: only windows on the same channel
      this.channelManager.recordBroadcast(channelId, context);
      const targets = this.channelManager.getWindowsInChannel(channelId);
      for (const targetId of targets) {
        if (targetId === senderId) continue;
        const targetAppId = this.getAppIdForWebContents(targetId);
        if (this.isContextRouteAllowed(senderAppId, context.type, targetId)) {
          this.windowManager.sendTo(targetId, IpcEvents.CONTEXT_UPDATE, context, sourceMetadata);
          if (this.isRegisteredApp(targetAppId)) {
            this.emitActivity({
              kind: 'context.delivered',
              status: 'ok',
              sourceAppId: senderAppId,
              targetAppId,
              channelId,
              contextType: context.type,
              message: `${context.type} delivered to ${this.appTitle(targetAppId)} on ${channelId}`,
            });
          }
        } else if (this.isRegisteredApp(targetAppId)) {
          this.emitActivity({
            kind: 'context.blocked',
            status: 'blocked',
            sourceAppId: senderAppId,
            targetAppId,
            channelId,
            contextType: context.type,
            message: `${context.type} blocked from ${this.appTitle(senderAppId)} to ${this.appTitle(targetAppId)}`,
          });
        }
      }
    });
  }

  /**
   * Returns true when the broadcast from sourceAppId of contextType to the
   * target window is permitted by the current flow policy.
   * Falls through (returns true) when no policy is active.
   */
  private isContextRouteAllowed(sourceAppId: string | undefined, contextType: string, targetWebContentsId: number): boolean {
    if (!this.flowPolicy || !this.flowPolicy.enabled || !sourceAppId) return true;
    const targetAppId = this.getAppIdForWebContents(targetWebContentsId);
    return this.isContextRouteAllowedForApp(sourceAppId, contextType, targetAppId);
  }

  /**
   * Returns true when an intent delivery from sourceAppId to targetWebContentsId
   * is permitted by the current flow policy.
   */
  private isIntentRouteAllowed(sourceAppId: string | undefined, intentName: string, targetWebContentsId: number): boolean {
    if (!this.flowPolicy || !this.flowPolicy.enabled || !sourceAppId) return true;
    const targetAppId = this.getAppIdForWebContents(targetWebContentsId);
    return this.isIntentRouteAllowedForApp(sourceAppId, intentName, targetAppId);
  }

  // ─── Context listener registration ──────────────────────────────────────

  private handleAddContextListener(): void {
    ipcMain.handle(IpcEvents.ADD_CONTEXT_LISTENER, (_event, _contextType: string) => {
      // The preload manages the actual handler dispatch; main just needs to know
      // the window is interested for debugging / future server-push scenarios.
      return true;
    });
  }

  private handleRemoveContextListener(): void {
    ipcMain.handle(IpcEvents.REMOVE_CONTEXT_LISTENER, (_event, _contextType: string) => {
      return true;
    });
  }

  // ─── Intent routing ───────────────────────────────────────────────────────

  private handleRaiseIntent(): void {
    ipcMain.handle(
      IpcEvents.RAISE_INTENT,
      async (event, { intent, context }: { intent: string; context?: Fdc3Context }) => {
        const senderAppId = this.getAppIdForWebContents(event.sender.id);
        const expectsCompletion = intent === 'StartPayment';
        const requestId = expectsCompletion ? randomUUID() : undefined;
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        this.emitActivity({
          kind: 'intent.raised',
          status: 'ok',
          sourceAppId: senderAppId,
          intentName: intent,
          contextType: context?.type,
          message: `${this.appTitle(senderAppId)} raised ${intent}`,
          payload: context,
        });

        let resolution: IntentResolution;
        try {
          resolution = await this.intentResolver.resolve({
            intent,
            context,
            registry: this.intentRegistry,
            appDirectory: this.appDirectory,
            chooseHandler: (intentName, ctx, candidates) =>
              this.intentResolverWindows.show(
                {
                  intent: intentName,
                  context: ctx,
                  contextType: ctx?.type,
                  contextName: typeof ctx?.name === 'string' ? ctx?.name : undefined,
                  theme: this.themeManager.getTheme(),
                  candidates,
                },
                parentWindow,
              ),
            deliverToWindow: (targetId, intentName, ctx) => {
              const targetAppId = this.getAppIdForWebContents(targetId);
              if (!this.isIntentRouteAllowed(senderAppId, intentName, targetId)) {
                this.emitActivity({
                  kind: 'intent.blocked',
                  status: 'blocked',
                  sourceAppId: senderAppId,
                  targetAppId,
                  intentName: intentName,
                  contextType: ctx?.type,
                  message: `${intentName} blocked from ${this.appTitle(senderAppId)} to ${this.appTitle(targetAppId)}`,
                });
                return;
              }
              this.windowManager.sendTo(targetId, IpcEvents.INTENT_FIRE, {
                intent: intentName,
                context: ctx,
                requestId,
              });
              this.emitActivity({
                kind: 'intent.delivered',
                status: 'ok',
                sourceAppId: senderAppId,
                targetAppId,
                intentName: intentName,
                contextType: ctx?.type,
                message: `${intentName} delivered to ${this.appTitle(targetAppId)}`,
              });
            },
            openApp: (appId, ctx) => {
              const wasRunning = !!this.windowManager.findByAppId(appId);
              const win = this.windowManager.openApp(appId);
              if (!win) throw new Error(`Failed to open app: ${appId}`);
              this.emitActivity({
                kind: wasRunning ? 'app.focused' : 'app.opened',
                status: 'ok',
                appId,
                message: `${this.appTitle(appId)} ${wasRunning ? 'focused' : 'opened'} for ${intent}`,
              });

              const deliver = (): void => {
                if (!this.isIntentRouteAllowed(senderAppId, intent, win.webContents.id)) {
                  this.emitActivity({
                    kind: 'intent.blocked',
                    status: 'blocked',
                    sourceAppId: senderAppId,
                    targetAppId: appId,
                    intentName: intent,
                    contextType: ctx?.type,
                    message: `${intent} blocked from ${this.appTitle(senderAppId)} to ${this.appTitle(appId)}`,
                  });
                  return;
                }
                win.webContents.send(IpcEvents.INTENT_FIRE, { intent, context: ctx, requestId });
                this.emitActivity({
                  kind: 'intent.delivered',
                  status: 'ok',
                  sourceAppId: senderAppId,
                  targetAppId: appId,
                  intentName: intent,
                  contextType: ctx?.type,
                  message: `${intent} delivered to ${this.appTitle(appId)}`,
                });
              };

              // Wait for the app to register its intent listener (up to 1.2s),
              // then deliver — or deliver on timeout if no listener shows up.
              return new Promise<void>((resolve) => {
                let done = false;
                const finish = (timer: ReturnType<typeof setTimeout>, interval: ReturnType<typeof setInterval>): void => {
                  if (done) return;
                  done = true;
                  clearTimeout(timer);
                  clearInterval(interval);
                  deliver();
                  resolve();
                };
                const timeout = setTimeout(() => {
                  finish(timeout, checkInterval);
                }, 1200);

                const checkInterval = setInterval(() => {
                  if (this.intentRegistry.hasListeners(intent)) {
                    finish(timeout, checkInterval);
                  }
                }, 100);
              });
            },
          });
        } catch (error) {
          this.emitActivity({
            kind: 'intent.failed',
            status: 'error',
            sourceAppId: senderAppId,
            intentName: intent,
            contextType: context?.type,
            message: `${intent} failed: ${error instanceof Error ? error.message : String(error)}`,
          });
          throw error;
        }

        this.emitActivity({
          kind: 'intent.resolved',
          status: 'ok',
          sourceAppId: senderAppId,
          targetAppId: resolution.source.appId,
          intentName: intent,
          contextType: context?.type,
          message: `${intent} resolved to ${this.appTitle(resolution.source.appId)}`,
        });

        if (!expectsCompletion || !requestId) {
          return resolution;
        }

        const result = await new Promise<Fdc3Context | undefined>((resolve) => {
          this.pendingIntentResults.set(requestId, resolve);
        });

        this.pendingIntentResults.delete(requestId);
        return { ...resolution, result } satisfies IntentResolution;
      },
    );
  }

  private handleCompleteIntent(): void {
    ipcMain.handle(
      IpcEvents.COMPLETE_INTENT,
      (_event, { requestId, result }: { requestId: string; result?: Fdc3Context }) => {
        const resolve = this.pendingIntentResults.get(requestId);
        if (!resolve) return false;
        resolve(result);
        return true;
      },
    );
  }

  private handleAddIntentListener(): void {
    ipcMain.handle(IpcEvents.ADD_INTENT_LISTENER, (event, intent: string) => {
      const senderId = event.sender.id;
      const appId = this.getAppIdForWebContents(senderId) ?? 'unknown';
      this.intentRegistry.registerListener(senderId, appId, intent);
    });
  }

  private handleRemoveIntentListener(): void {
    ipcMain.handle(IpcEvents.REMOVE_INTENT_LISTENER, (event, intent: string) => {
      this.intentRegistry.unregisterListener(event.sender.id, intent);
    });
  }

  // ─── User channels ────────────────────────────────────────────────────────

  private handleJoinChannel(): void {
    ipcMain.handle(IpcEvents.JOIN_CHANNEL, (event, channelId: string) => {
      const appId = this.getAppIdForWebContents(event.sender.id);
      this.channelManager.joinChannel(event.sender.id, channelId);
      this.emitActivity({
        kind: 'channel.joined',
        status: 'ok',
        appId,
        channelId,
        message: `${this.appTitle(appId)} joined ${channelId}`,
      });

      // Deliver last-value cache to the newly joined window
      const lastCtx = this.channelManager.getLastContext(channelId);
      if (lastCtx) {
        this.windowManager.sendTo(event.sender.id, IpcEvents.CONTEXT_UPDATE, lastCtx);
        this.emitActivity({
          kind: 'context.delivered',
          status: 'ok',
          targetAppId: appId,
          channelId,
          contextType: lastCtx.type,
          message: `Last ${lastCtx.type} delivered to ${this.appTitle(appId)} on join`,
        });
      }

      // Notify all windows on the channel about the membership change
      const channelObj = this.channelManager.getCurrentChannel(event.sender.id);
      this.windowManager.sendTo(event.sender.id, IpcEvents.CHANNEL_CHANGED, channelObj);
    });
  }

  private handleLeaveChannel(): void {
    ipcMain.handle(IpcEvents.LEAVE_CHANNEL, (event) => {
      const appId = this.getAppIdForWebContents(event.sender.id);
      const channelId = this.channelManager.getCurrentChannelId(event.sender.id);
      this.channelManager.leaveChannel(event.sender.id);
      this.emitActivity({
        kind: 'channel.left',
        status: 'ok',
        appId,
        channelId,
        message: `${this.appTitle(appId)} left ${channelId ?? 'current channel'}`,
      });
      this.windowManager.sendTo(event.sender.id, IpcEvents.CHANNEL_CHANGED, null);
    });
  }

  private handleGetCurrentChannel(): void {
    ipcMain.handle(IpcEvents.GET_CURRENT_CHANNEL, (event) => {
      return this.channelManager.getCurrentChannel(event.sender.id);
    });
  }

  private handleGetUserChannels(): void {
    ipcMain.handle(IpcEvents.GET_USER_CHANNELS, () => {
      return this.channelManager.getChannels();
    });
  }

  // ─── App lifecycle ────────────────────────────────────────────────────────

  private handleOpenApp(): void {
    ipcMain.handle(
      IpcEvents.OPEN_APP,
      (_event, { appId, context }: { appId: string; context?: Fdc3Context }) => {
        const wasRunning = !!this.windowManager.findByAppId(appId);
        const win = this.windowManager.openApp(appId);
        if (win) {
          this.emitActivity({
            kind: wasRunning ? 'app.focused' : 'app.opened',
            status: 'ok',
            appId,
            contextType: context?.type,
            message: `${this.appTitle(appId)} ${wasRunning ? 'focused' : 'opened'}`,
          });
        }
        if (win && context) {
          const deliverContext = (): void => {
            if (win.isDestroyed()) return;
            win.webContents.send(IpcEvents.CONTEXT_UPDATE, context);
            this.emitActivity({
              kind: 'context.delivered',
              status: 'ok',
              targetAppId: appId,
              contextType: context.type,
              message: `${context.type} delivered to ${this.appTitle(appId)} on open`,
            });
          };

          if (wasRunning) {
            deliverContext();
          } else {
            win.webContents.once('did-finish-load', deliverContext);
          }
        }
        return { opened: !!win };
      },
    );
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  private handleGetWindowId(): void {
    ipcMain.handle(IpcEvents.GET_WINDOW_ID, (event) => event.sender.id);
  }

  private handleCloseCurrentWindow(): void {
    ipcMain.handle(IpcEvents.CLOSE_CURRENT_WINDOW, (event) => {
      return this.windowManager.closeByWebContentsId(event.sender.id);
    });
  }

  private handleSaveWorkspace(): void {
    ipcMain.handle(IpcEvents.SAVE_WORKSPACE, (_event, name?: string) => {
      return this.workspaceManager.save(name ?? 'default');
    });
  }

  private handleGetAppList(): void {
    ipcMain.handle(IpcEvents.GET_APP_LIST, () => {
      return this.appDirectory.map((a) => ({
        appId: a.appId,
        title: a.title,
        description: a.description,
        icon: a.icon,
        category: a.category,
        url: a.url,
        devPort: a.devPort,
        capabilities: a.capabilities,
        listensForContexts: a.listensForContexts,
        intents: a.intents,
      }));
    });
  }

  private handleGetPreloadPath(): void {
    ipcMain.handle(IpcEvents.GET_PRELOAD_PATH, () => {
      return this.windowManager.getPreloadPath();
    });
  }

  private handleSetFlowPolicy(): void {
    ipcMain.handle(IpcEvents.SET_FLOW_POLICY, (_event, policy: FlowPolicy) => {
      this.flowPolicy = policy;
      this.emitActivity({
        kind: 'policy.updated',
        status: 'info',
        message: `Interop Flow ${policy.enabled ? 'activated' : 'deactivated'} (${policy.disabledContextRoutes.length + policy.disabledIntentRoutes.length} blocked routes)`,
        payload: policy,
      });
    });
  }

  private handleGetTheme(): void {
    ipcMain.handle(IpcEvents.GET_THEME, () => {
      return this.themeManager.getTheme();
    });
  }

  private handleSetTheme(): void {
    ipcMain.handle(IpcEvents.SET_THEME, (event, nextTheme: ThemeName) => {
      const theme = this.themeManager.setTheme(nextTheme);
      const senderAppId = this.getAppIdForWebContents(event.sender.id);

      const themeContext: ThemeContext = {
        type: 'com.demo.theme',
        name: `Theme: ${theme}`,
        theme,
      };

      for (const id of this.windowManager.getAllWebContentsIds()) {
        // THEME_CHANGED updates the shell chrome — always deliver to every window.
        this.windowManager.sendTo(id, IpcEvents.THEME_CHANGED, theme);
        // CONTEXT_UPDATE carries the FDC3 context to app listeners — respect the flow policy.
        if (this.isContextRouteAllowed(senderAppId, 'com.demo.theme', id)) {
          this.windowManager.sendTo(id, IpcEvents.CONTEXT_UPDATE, themeContext);
        }
      }

      return theme;
    });
  }

  private handleOpenWorkspaceWindow(): void {
    ipcMain.handle(IpcEvents.OPEN_WORKSPACE_WINDOW, (_event, payload: DetachedWorkspacePayload) => {
      const win = this.windowManager.createWorkspaceWindow(payload);
      return { opened: !win.isDestroyed(), id: payload.id };
    });
  }

  private handleGetWorkspaceWindowPayload(): void {
    ipcMain.handle(IpcEvents.GET_WORKSPACE_WINDOW_PAYLOAD, (_event, workspaceWindowId: string) => {
      return this.windowManager.getWorkspaceWindowPayload(workspaceWindowId);
    });
  }

  private handleUpdateWorkspaceWindowPayload(): void {
    ipcMain.handle(IpcEvents.UPDATE_WORKSPACE_WINDOW_PAYLOAD, (_event, payload: DetachedWorkspacePayload) => {
      this.windowManager.updateWorkspaceWindowPayload(payload);
      return true;
    });
  }

  private handleRecallWorkspaceWindow(): void {
    ipcMain.handle(IpcEvents.RECALL_WORKSPACE_WINDOW, (_event, workspaceWindowId: string) => {
      return this.windowManager.recallWorkspaceWindow(workspaceWindowId);
    });
  }

  private handleGetDisplays(): void {
    ipcMain.handle(IpcEvents.GET_DISPLAYS, () => {
      const displays = screen.getAllDisplays();
      const primary = screen.getPrimaryDisplay();
      return displays.map((d) => ({
        id: d.id,
        isPrimary: d.id === primary.id,
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor,
      }));
    });
  }

  private handleGetInteropSnapshot(): void {
    ipcMain.handle(IpcEvents.GET_INTEROP_SNAPSHOT, (): InteropSnapshot => this.buildInteropSnapshot());
  }

  private handleAppLogWrite(): void {
    ipcMain.handle(
      IpcEvents.APP_LOG_WRITE,
      (event, input: { level?: unknown; message?: unknown; category?: string; data?: unknown }) => {
        const message = input?.message === undefined ? '' : String(input.message);
        if (!message.trim()) return false;
        this.emitAppLog(event.sender, {
          level: this.normalizeAppLogLevel(input?.level),
          origin: 'platform',
          message,
          category: input?.category,
          data: input?.data,
        });
        return true;
      },
    );
  }

  private handleGetAppLogs(): void {
    ipcMain.handle(IpcEvents.GET_APP_LOGS, (event): AppLogEvent[] => {
      if (this.canManageAppLogs(event.sender.id)) return this.appLogs;
      const appId = this.getAppIdForWebContents(event.sender.id);
      return this.appLogs.filter((log) => log.appId === appId);
    });
  }

  private handleClearAppLogs(): void {
    ipcMain.handle(IpcEvents.CLEAR_APP_LOGS, (event): boolean => {
      if (!this.canManageAppLogs(event.sender.id)) return false;
      this.appLogs.length = 0;
      return true;
    });
  }

  private buildInteropSnapshot(): InteropSnapshot {
    const webContentsIds = this.windowManager.getAllWebContentsIds();
    const webContentsByApp = new Map<string, number[]>();
    for (const id of webContentsIds) {
      const appId = this.getAppIdForWebContents(id);
      if (!this.isRegisteredApp(appId)) continue;
      const list = webContentsByApp.get(appId) ?? [];
      list.push(id);
      webContentsByApp.set(appId, list);
    }

    const apps: RuntimeAppSnapshot[] = this.appDirectory.map((appDef) => {
      const ids = webContentsByApp.get(appDef.appId) ?? [];
      const currentChannelId = ids.map((id) => this.channelManager.getCurrentChannelId(id)).find((id) => id != null) ?? null;
      return {
        appId: appDef.appId,
        title: appDef.title,
        icon: appDef.icon,
        category: appDef.category,
        running: ids.length > 0,
        webContentsIds: ids,
        currentChannelId,
      };
    });

    const channels: RuntimeChannelSnapshot[] = this.channelManager.getChannels().map((channel) => {
      const members = this.channelManager.getWindowsInChannel(channel.id)
        .map((id) => this.getAppIdForWebContents(id))
        .filter((appId): appId is string => this.isRegisteredApp(appId));
      const lastContext = this.channelManager.getLastContext(channel.id);
      return {
        id: channel.id,
        name: channel.displayMetadata.name,
        color: channel.displayMetadata.color,
        memberAppIds: [...new Set(members)],
        lastContext: lastContext ? { type: lastContext.type, name: lastContext.name, id: lastContext.id } : null,
        trafficCount: this.activityLog.filter((event) => event.channelId === channel.id).length,
      };
    });

    const routes = this.buildRouteSnapshots();
    const blockedEvents = this.activityLog.filter((event) => event.status === 'blocked').length;
    const deliveredEvents = this.activityLog.filter((event) => event.kind === 'context.delivered' || event.kind === 'intent.delivered').length;
    const errorLogEvents = this.appLogs.filter((event) => event.level === 'error').length;
    return {
      generatedAt: Date.now(),
      activity: this.activityLog,
      appLogs: this.appLogs,
      apps,
      channels,
      routes,
      flowPolicy: this.flowPolicy,
      metrics: {
        totalEvents: this.activityLog.length,
        blockedEvents,
        deliveredEvents,
        runningApps: apps.filter((runtimeApp) => runtimeApp.running).length,
        logEvents: this.appLogs.length,
        errorLogEvents,
      },
    };
  }

  private buildRouteSnapshots(): InteropRouteSnapshot[] {
    const routes = new Map<string, InteropRouteSnapshot>();
    for (const source of this.appDirectory) {
      for (const target of this.appDirectory) {
        if (source.appId === target.appId) continue;

        for (const contextType of source.capabilities?.broadcasts ?? []) {
          if (!(target.capabilities?.listensTo ?? target.listensForContexts ?? []).includes(contextType)) continue;
          const id = this.routeKey(source.appId, contextType, target.appId);
          routes.set(`context:${id}`, {
            id: `context:${id}`,
            type: 'context',
            sourceAppId: source.appId,
            targetAppId: target.appId,
            contextType,
            allowed: this.isContextRouteAllowedForApp(source.appId, contextType, target.appId),
          });
        }

        for (const intentName of source.capabilities?.raisesIntents ?? []) {
          if (!(target.capabilities?.handlesIntents ?? []).includes(intentName)) continue;
          const id = this.routeKey(source.appId, intentName, target.appId);
          routes.set(`intent:${id}`, {
            id: `intent:${id}`,
            type: 'intent',
            sourceAppId: source.appId,
            targetAppId: target.appId,
            intentName,
            allowed: this.isIntentRouteAllowedForApp(source.appId, intentName, target.appId),
          });
        }
      }
    }
    return [...routes.values()].sort((a, b) => `${a.sourceAppId}:${a.targetAppId}`.localeCompare(`${b.sourceAppId}:${b.targetAppId}`));
  }

  // ─── Intent resolver modal window ─────────────────────────────────────────

  private handleIntentResolverGetPayload(): void {
    ipcMain.handle(IpcEvents.INTENT_RESOLVER_GET_PAYLOAD, (event) => {
      return this.intentResolverWindows.getPayload(event.sender.id);
    });
  }

  private handleIntentResolverPick(): void {
    ipcMain.handle(
      IpcEvents.INTENT_RESOLVER_PICK,
      (event, { appId, instanceId }: { appId: string; instanceId?: number }) => {
        this.intentResolverWindows.pick(event.sender.id, appId, instanceId);
      },
    );
  }

  private handleIntentResolverCancel(): void {
    ipcMain.handle(IpcEvents.INTENT_RESOLVER_CANCEL, (event) => {
      this.intentResolverWindows.cancel(event.sender.id);
    });
  }

  // ─── Private Channels (FDC3 2.0 createPrivateChannel) ──────────────────────

  private handleCreatePrivateChannel(): void {
    ipcMain.handle(IpcEvents.CREATE_PRIVATE_CHANNEL, (event): PrivateChannelMarker => {
      const id = `private:${randomUUID()}`;
      this.privateChannels.create(id, event.sender.id);
      const appId = this.getAppIdForWebContents(event.sender.id);
      this.emitActivity({
        kind: 'privateChannel.created',
        status: 'ok',
        appId,
        message: `${this.appTitle(appId)} created ${id}`,
        payload: { channelId: id },
      });
      return { __fdc3PrivateChannelId: id };
    });
  }

  /** Called by a side that just received a private-channel reference (typically the
   *  intent raiser) to register itself as a participant before broadcasting/listening. */
  private handlePrivateChannelConnect(): void {
    ipcMain.handle(IpcEvents.PRIVATE_CHANNEL_CONNECT, (event, channelId: string) => {
      if (!this.privateChannels.exists(channelId)) return false;
      this.privateChannels.ensureParticipant(channelId, event.sender.id);
      const appId = this.getAppIdForWebContents(event.sender.id);
      this.emitActivity({
        kind: 'privateChannel.connected',
        status: 'ok',
        appId,
        message: `${this.appTitle(appId)} connected to ${channelId}`,
        payload: { channelId },
      });
      return true;
    });
  }

  private handlePrivateChannelBroadcast(): void {
    ipcMain.handle(
      IpcEvents.PRIVATE_CHANNEL_BROADCAST,
      (event, { channelId, context }: { channelId: string; context: Fdc3Context }) => {
        const sourceAppId = this.getAppIdForWebContents(event.sender.id);
        this.emitActivity({
          kind: 'privateChannel.broadcasted',
          status: 'ok',
          sourceAppId,
          contextType: context.type,
          message: `${this.appTitle(sourceAppId)} broadcast ${context.type} on ${channelId}`,
          payload: { channelId, context },
        });
        const targets = this.privateChannels.broadcast(channelId, context, event.sender.id);
        for (const id of targets) {
          this.windowManager.sendTo(id, IpcEvents.PRIVATE_CHANNEL_CONTEXT, { channelId, context });
        }
      },
    );
  }

  private handlePrivateChannelAddListener(): void {
    ipcMain.handle(
      IpcEvents.PRIVATE_CHANNEL_ADD_LISTENER,
      (event, { channelId, contextType }: { channelId: string; contextType: string | null }): Fdc3Context[] => {
        const { cached, lifecycle } = this.privateChannels.addListener(channelId, contextType, event.sender.id);
        this.fanoutLifecycle(IpcEvents.PRIVATE_CHANNEL_LISTENER_ADDED, lifecycle);
        return cached;
      },
    );
  }

  private handlePrivateChannelRemoveListener(): void {
    ipcMain.handle(
      IpcEvents.PRIVATE_CHANNEL_REMOVE_LISTENER,
      (event, { channelId, contextType }: { channelId: string; contextType: string | null }) => {
        const lifecycle = this.privateChannels.removeListener(channelId, contextType, event.sender.id);
        if (lifecycle) this.fanoutLifecycle(IpcEvents.PRIVATE_CHANNEL_LISTENER_REMOVED, lifecycle);
      },
    );
  }

  private handlePrivateChannelGetCurrentContext(): void {
    ipcMain.handle(
      IpcEvents.PRIVATE_CHANNEL_GET_CURRENT_CONTEXT,
      (_event, { channelId, contextType }: { channelId: string; contextType?: string }): Fdc3Context | null => {
        return this.privateChannels.getCurrentContext(channelId, contextType);
      },
    );
  }

  private handlePrivateChannelDisconnect(): void {
    ipcMain.handle(IpcEvents.PRIVATE_CHANNEL_DISCONNECT, (event, channelId: string) => {
      const lifecycle = this.privateChannels.disconnect(channelId, event.sender.id);
      if (lifecycle) {
        for (const id of lifecycle.notify) {
          this.windowManager.sendTo(id, IpcEvents.PRIVATE_CHANNEL_DISCONNECTED, { channelId });
        }
      }
    });
  }

  private fanoutLifecycle(eventName: typeof IpcEvents.PRIVATE_CHANNEL_LISTENER_ADDED | typeof IpcEvents.PRIVATE_CHANNEL_LISTENER_REMOVED, ev: PrivateChannelLifecycleEvent): void {
    for (const id of ev.notify) {
      this.windowManager.sendTo(id, eventName, { channelId: ev.channelId, contextType: ev.contextType });
    }
  }

  // ─── App Channels (FDC3 2.0 getOrCreateChannel) ────────────────────────────

  private handleGetOrCreateAppChannel(): void {
    ipcMain.handle(IpcEvents.GET_OR_CREATE_APP_CHANNEL, (_event, channelId: string): AppChannelMeta => {
      return this.appChannels.getOrCreate(channelId);
    });
  }

  private handleAppChannelBroadcast(): void {
    ipcMain.handle(
      IpcEvents.APP_CHANNEL_BROADCAST,
      (event, { channelId, context }: { channelId: string; context: Fdc3Context }) => {
        const sourceAppId = this.getAppIdForWebContents(event.sender.id);
        this.emitActivity({
          kind: 'appChannel.broadcasted',
          status: 'ok',
          sourceAppId,
          contextType: context.type,
          message: `${this.appTitle(sourceAppId)} broadcast ${context.type} on ${channelId}`,
          payload: { channelId, context },
        });
        const targets = this.appChannels.broadcast(channelId, context);
        for (const id of targets) {
          if (id === event.sender.id) continue;
          this.windowManager.sendTo(id, IpcEvents.APP_CHANNEL_CONTEXT, { channelId, context });
        }
      },
    );
  }

  private handleAppChannelAddListener(): void {
    ipcMain.handle(
      IpcEvents.APP_CHANNEL_ADD_LISTENER,
      (event, { channelId, contextType }: { channelId: string; contextType: string | null }): Fdc3Context[] => {
        return this.appChannels.addListener(channelId, contextType, event.sender.id);
      },
    );
  }

  private handleAppChannelRemoveListener(): void {
    ipcMain.handle(
      IpcEvents.APP_CHANNEL_REMOVE_LISTENER,
      (event, { channelId, contextType }: { channelId: string; contextType: string | null }) => {
        this.appChannels.removeListener(channelId, contextType, event.sender.id);
      },
    );
  }

  private handleAppChannelGetCurrentContext(): void {
    ipcMain.handle(
      IpcEvents.APP_CHANNEL_GET_CURRENT_CONTEXT,
      (_event, { channelId, contextType }: { channelId: string; contextType?: string }): Fdc3Context | null => {
        return this.appChannels.getCurrentContext(channelId, contextType);
      },
    );
  }

  /**
   * FDC3 2.0 — `fdc3.findIntent(intent, context?, resultType?)`.
   * Returns the AppIntent for `intent`, optionally filtered by context type.
   * Rejects with `NoAppsFound` when nothing matches so callers can catch the
   * standard FDC3 error code.
   */
  private handleFindIntent(): void {
    ipcMain.handle(
      IpcEvents.FIND_INTENT,
      (_event, { intent, context, resultType: _resultType }: { intent: string; context?: Fdc3Context; resultType?: string }): AppIntent => {
        const match = this.appRegistry.findIntent(intent, context?.type);
        if (!match) throw new NoAppsFoundError();
        return match;
      },
    );
  }

  /**
   * FDC3 2.0 — `fdc3.findIntentsByContext(context, resultType?)`.
   * Returns the list of intents (and handler apps) that accept the given context type.
   * Returns an empty array when nothing matches.
   */
  private handleFindIntentsByContext(): void {
    ipcMain.handle(
      IpcEvents.FIND_INTENTS_BY_CONTEXT,
      (_event, { context, resultType: _resultType }: { context: Fdc3Context; resultType?: string }): AppIntent[] => {
        return this.appRegistry.findIntentsByContext(context.type);
      },
    );
  }

  /**
   * FDC3 2.0 — `fdc3.getInfo()`. Returns implementation metadata for the desktop
   * agent and metadata for the *calling* app (resolved via its webContents id).
   */
  private handleGetInfo(): void {
    ipcMain.handle(IpcEvents.GET_INFO, (event): ImplementationMetadata => {
      const appId = this.getAppIdForWebContents(event.sender.id) ?? 'unknown';
      const def = this.appDirectory.find((a) => a.appId === appId);
      return {
        // 2.1: getAgent() discovery + addEventListener('userChannelChanged') are implemented.
        fdc3Version: '2.1',
        provider: 'fdc3-desktop-poc',
        providerVersion: app.getVersion(),
        appMetadata: {
          appId,
          instanceId: String(event.sender.id),
          name: def?.appId ?? appId,
          title: def?.title,
          description: def?.description,
          icons: def?.icon ? [{ src: def.icon }] : undefined,
        },
        optionalFeatures: {
          // Context broadcasts carry the originating app as ContextMetadata.source.
          OriginatingAppMetadata: true,
          // join/leave/getCurrent/getUser are all implemented.
          UserChannelMembershipAPIs: true,
          // No Desktop Agent Bridging in this POC.
          DesktopAgentBridging: false,
        },
      };
    });
  }

  /** Call when a webContents is destroyed to clean up registrations. */
  cleanupWindow(webContentsId: number): void {
    this.channelManager.removeWindow(webContentsId);
    this.intentRegistry.removeWindow(webContentsId);
    this.appChannels.removeWindow(webContentsId);
    this.logCaptureWebContentsIds.delete(webContentsId);
    const events = this.privateChannels.removeWindow(webContentsId);
    for (const ev of events) {
      for (const id of ev.notify) {
        this.windowManager.sendTo(id, IpcEvents.PRIVATE_CHANNEL_DISCONNECTED, { channelId: ev.channelId });
      }
    }
  }
}
