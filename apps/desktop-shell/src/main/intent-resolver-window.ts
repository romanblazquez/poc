import { BrowserWindow } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import type { Fdc3Context } from '@fdc3-poc/fdc3-core';
import type { IntentResolverCandidate } from '@fdc3-poc/intent-engine';

const isDev = process.env.NODE_ENV === 'development';

export interface IntentResolverPayload {
  intent: string;
  context?: Fdc3Context;
  contextType?: string;
  contextName?: string;
  theme?: string;
  candidates: IntentResolverCandidate[];
}

interface Pending {
  payload: IntentResolverPayload;
  resolve(choice: IntentResolverCandidate | null): void;
  window: BrowserWindow;
}

function getResolverUrl(): string {
  if (isDev) return 'http://localhost:5173/intent-resolver.html';
  return pathToFileURL(path.join(__dirname, '../renderer/intent-resolver.html')).href;
}

/**
 * Opens a small modal window for the user to pick an intent handler.
 * Each call returns a Promise that resolves with the choice (or null on cancel).
 *
 * Several resolvers may be in flight at once — each one is keyed by the
 * resolver window's webContents id so the IPC handlers can route correctly.
 */
export class IntentResolverWindowManager {
  private readonly pending = new Map<number, Pending>();
  private readonly preloadPath: string;

  constructor() {
    this.preloadPath = path.join(__dirname, '../preload/index.js');
  }

  show(
    payload: IntentResolverPayload,
    parent?: BrowserWindow,
  ): Promise<IntentResolverCandidate | null> {
    const win = new BrowserWindow({
      width: 460,
      height: 480,
      parent,
      modal: !!parent,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: `Resolve: ${payload.intent}`,
      backgroundColor: '#15182b',
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    win.setMenuBarVisibility(false);
    win.loadURL(getResolverUrl()).catch(console.error);
    win.once('ready-to-show', () => win.show());

    return new Promise((resolve) => {
      const wcId = win.webContents.id;
      this.pending.set(wcId, {
        payload,
        window: win,
        resolve: (choice) => {
          this.pending.delete(wcId);
          if (!win.isDestroyed()) win.close();
          resolve(choice);
        },
      });
      win.on('closed', () => {
        const entry = this.pending.get(wcId);
        if (entry) {
          this.pending.delete(wcId);
          // Window closed without an explicit pick → treat as cancel.
          resolve(null);
        }
      });
    });
  }

  getPayload(webContentsId: number): IntentResolverPayload | null {
    const entry = this.pending.get(webContentsId);
    return entry ? entry.payload : null;
  }

  pick(webContentsId: number, appId: string, instanceId?: number): void {
    const entry = this.pending.get(webContentsId);
    if (!entry) return;
    const candidate = entry.payload.candidates.find(
      (c) => c.appId === appId && (instanceId === undefined || c.instanceId === instanceId),
    );
    entry.resolve(candidate ?? null);
  }

  cancel(webContentsId: number): void {
    const entry = this.pending.get(webContentsId);
    if (entry) entry.resolve(null);
  }
}
