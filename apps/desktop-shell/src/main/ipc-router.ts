import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import type { Fdc3Context, IntentResolution } from '@fdc3-poc/fdc3-core';
import { IpcEvents } from '@fdc3-poc/interop-electron-adapter';
import type { ChannelManager } from '@fdc3-poc/channel-engine';
import type { IntentRegistry } from '@fdc3-poc/intent-engine';
import { IntentResolver } from '@fdc3-poc/intent-engine';
import type { WindowManager } from './window-manager.js';
import type { DetachedWorkspacePayload } from './window-manager.js';
import type { WorkspaceManager } from './workspace-manager.js';
import type { AppDefinition } from '@fdc3-poc/fdc3-core';

/**
 * IpcRouter — the heart of the FDC3 main-process implementation.
 *
 * Handles every ipcMain.handle() call from renderer preloads and routes
 * context, intents, and channel commands to the correct windows.
 */
export class IpcRouter {
  private readonly intentResolver: IntentResolver;
  private readonly pendingIntentResults = new Map<string, (result?: Fdc3Context) => void>();

  constructor(
    private readonly windowManager: WindowManager,
    private readonly channelManager: ChannelManager,
    private readonly intentRegistry: IntentRegistry,
    private readonly workspaceManager: WorkspaceManager,
    private readonly appDirectory: AppDefinition[],
  ) {
    this.intentResolver = new IntentResolver();
  }

  register(): void {
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
    this.handleOpenWorkspaceWindow();
    this.handleGetWorkspaceWindowPayload();
    this.handleUpdateWorkspaceWindowPayload();
    this.handleRecallWorkspaceWindow();
    this.handleCloseCurrentWindow();
  }

  // ─── Context broadcasting ─────────────────────────────────────────────────

  private handleBroadcast(): void {
    ipcMain.handle(IpcEvents.BROADCAST, (event, context: Fdc3Context) => {
      const senderId = event.sender.id;
      const channelId = this.channelManager.getCurrentChannelId(senderId);

      if (!channelId) {
        // No channel: global broadcast to ALL windows except sender
        for (const id of this.windowManager.getAllWebContentsIds()) {
          if (id !== senderId) {
            this.windowManager.sendTo(id, IpcEvents.CONTEXT_UPDATE, context);
          }
        }
        return;
      }

      // Channel broadcast: only windows on the same channel
      this.channelManager.recordBroadcast(channelId, context);
      const targets = this.channelManager.getWindowsInChannel(channelId);
      for (const targetId of targets) {
        if (targetId !== senderId) {
          this.windowManager.sendTo(targetId, IpcEvents.CONTEXT_UPDATE, context);
        }
      }
    });
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
      async (_event, { intent, context }: { intent: string; context?: Fdc3Context }) => {
        const expectsCompletion = intent === 'StartPayment';
        const requestId = expectsCompletion ? randomUUID() : undefined;

        const resolution = await this.intentResolver.resolve({
          intent,
          context,
          registry: this.intentRegistry,
          appDirectory: this.appDirectory,
          deliverToWindow: (targetId, intentName, ctx) => {
            this.windowManager.sendTo(targetId, IpcEvents.INTENT_FIRE, {
              intent: intentName,
              context: ctx,
              requestId,
            });
          },
          openApp: (appId, ctx) => {
            const win = this.windowManager.openApp(appId);
            if (!win) throw new Error(`Failed to open app: ${appId}`);

            // Wait for the app to register its intent listener (up to 1.2s),
            // then deliver — or deliver on timeout if no listener shows up.
            return new Promise<void>((resolve) => {
              const timeout = setTimeout(() => {
                win.webContents.send(IpcEvents.INTENT_FIRE, { intent, context: ctx, requestId });
                resolve();
              }, 1200);

              const checkInterval = setInterval(() => {
                if (this.intentRegistry.hasListeners(intent)) {
                  clearInterval(checkInterval);
                  clearTimeout(timeout);
                  this.windowManager.sendTo(win.webContents.id, IpcEvents.INTENT_FIRE, {
                    intent,
                    context: ctx,
                    requestId,
                  });
                  resolve();
                }
              }, 100);
            });
          },
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
      const entry = this.windowManager.getEntry(senderId);
      const appId = entry?.appId ?? 'unknown';
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
      this.channelManager.joinChannel(event.sender.id, channelId);

      // Deliver last-value cache to the newly joined window
      const lastCtx = this.channelManager.getLastContext(channelId);
      if (lastCtx) {
        this.windowManager.sendTo(event.sender.id, IpcEvents.CONTEXT_UPDATE, lastCtx);
      }

      // Notify all windows on the channel about the membership change
      const channelObj = this.channelManager.getCurrentChannel(event.sender.id);
      this.windowManager.sendTo(event.sender.id, IpcEvents.CHANNEL_CHANGED, channelObj);
    });
  }

  private handleLeaveChannel(): void {
    ipcMain.handle(IpcEvents.LEAVE_CHANNEL, (event) => {
      this.channelManager.leaveChannel(event.sender.id);
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
        const win = this.windowManager.openApp(appId);
        if (win && context) {
          // Send context once the window is ready
          win.webContents.once('did-finish-load', () => {
            win.webContents.send(IpcEvents.CONTEXT_UPDATE, context);
          });
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
      }));
    });
  }

  private handleGetPreloadPath(): void {
    ipcMain.handle(IpcEvents.GET_PRELOAD_PATH, () => {
      return this.windowManager.getPreloadPath();
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

  /** Call when a webContents is destroyed to clean up registrations. */
  cleanupWindow(webContentsId: number): void {
    this.channelManager.removeWindow(webContentsId);
    this.intentRegistry.removeWindow(webContentsId);
  }
}
