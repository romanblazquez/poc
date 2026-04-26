/**
 * FDC3 Desktop Shell — Electron Main Process entry point.
 *
 * Bootstraps the entire desktop interoperability shell:
 *   1. Security hardening
 *   2. App registry load
 *   3. Channel manager
 *   4. Intent registry
 *   5. Window manager
 *   6. IPC router (wires all FDC3 handlers)
 *   7. Workspace manager
 *   8. Shell window creation
 *   9. Optional workspace restore
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';

import { setupSecurity } from './security.js';
import { AppRegistryLoader } from './app-registry-loader.js';
import { WindowManager } from './window-manager.js';
import { IpcRouter } from './ipc-router.js';
import { WorkspaceManager } from './workspace-manager.js';
import { ThemeManager } from './theme-manager.js';
import { ChannelManager } from '@fdc3-poc/channel-engine';
import { IntentRegistry } from '@fdc3-poc/intent-engine';

const isDev = process.env.NODE_ENV === 'development';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  // 1. Security
  setupSecurity();

  // 2. App directory
  const configPath = isDev
    ? path.join(__dirname, '../../../../config/app-directory.json')
    : path.join(process.resourcesPath, 'config', 'app-directory.json');

  const appDefs = AppRegistryLoader.load(configPath);

  // 3. Core engines
  const channelManager = new ChannelManager();
  const intentRegistry = new IntentRegistry();

  // 4. Window manager
  const windowManager = new WindowManager(appDefs);

  // 5. Workspace manager
  const workspaceManager = new WorkspaceManager(windowManager, channelManager);

  // 6. Theme manager (global persisted theme)
  const themeManager = new ThemeManager();

  // 7. IPC router — must be registered before any window loads
  const ipcRouter = new IpcRouter(
    windowManager,
    channelManager,
    intentRegistry,
    workspaceManager,
    themeManager,
    appDefs,
  );
  ipcRouter.register();

  // Clean up engine state when a window closes
  app.on('web-contents-created', (_, wc) => {
    wc.on('destroyed', () => {
      ipcRouter.cleanupWindow(wc.id);
    });
  });

  // 8. Create the shell launcher window
  windowManager.createShellWindow();

  // 9. Do not auto-restore external workspace windows.
  // The current UX keeps all apps embedded in the single shell window via Dockview.

  // macOS: re-create window when dock icon clicked with no windows open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createShellWindow();
    }
  });
}

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Focus existing window if second instance is launched
app.on('second-instance', () => {
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0) {
    const win = wins[0];
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

bootstrap().catch((err) => {
  console.error('[main] Bootstrap failed:', err);
  app.quit();
});
