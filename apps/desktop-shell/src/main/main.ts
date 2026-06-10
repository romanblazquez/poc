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

import { app, BrowserWindow, session } from 'electron';
import fs from 'fs';
import path from 'path';

import { setupSecurity, configureSession } from './security.js';
import { AppRegistryLoader } from './app-registry-loader.js';
import { WindowManager } from './window-manager.js';
import { IpcRouter } from './ipc-router.js';
import { WorkspaceManager } from './workspace-manager.js';
import { ThemeManager } from './theme-manager.js';
import { ShellAssetsLoader } from './shell-assets-loader.js';
import { ManagerService } from './manager-service.js';
import { BridgeService } from './bridge-service.js';
import { EnvironmentStore } from './environment-store.js';
import { RbacStore } from './rbac-store.js';
import { ChannelManager } from '@fdc3-poc/channel-engine';
import { IntentRegistry } from '@fdc3-poc/intent-engine';
import type { AppDirectoryFile } from '@fdc3-poc/app-registry';

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
  const configRoot = isDev
    ? path.join(__dirname, '../../../../config')
    : path.join(process.resourcesPath, 'config');

  const configPath = path.join(configRoot, 'app-directory.json');
  const shellManifestPath = path.join(configRoot, 'assets', 'desktop-shell.manifest.json');

  const appDefs = AppRegistryLoader.load(configPath);
  const shellManifest = ShellAssetsLoader.load(shellManifestPath, app.getVersion());

  // Pre-warm the persistent session for every known app so that Electron
  // initialises the disk cache before any webview requests it. Also applies
  // cache-friendly headers (critical in dev where the Angular dev server
  // sends Cache-Control: no-store for every request).
  for (const appDef of appDefs) {
    const ses = session.fromPartition(`persist:workspace-${appDef.appId}`);
    configureSession(ses, isDev);
  }

  // Build the full AppDirectoryFile shape ManagerService needs so it can read
  // optional directoryVersion / directoryLabel; falls back to a minimal
  // wrapper around the applications array when the file is unreadable
  // (e.g. AppRegistryLoader already produced the embedded sample fallback).
  const initialDirectoryFile: AppDirectoryFile = (() => {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AppDirectoryFile>;
      if (parsed && parsed.version === '1.0' && Array.isArray(parsed.applications)) {
        return {
          version: '1.0',
          directoryVersion: parsed.directoryVersion,
          directoryLabel: parsed.directoryLabel,
          applications: appDefs,
        };
      }
    } catch {
      // fall through
    }
    return { version: '1.0', applications: appDefs };
  })();
  const managerService = new ManagerService(initialDirectoryFile, 'local');
  const bridgeService = new BridgeService();
  const environmentStore = new EnvironmentStore();
  const rbacStore = new RbacStore();

  // Apply the active env's persisted app directory (overrides bundled config).
  const envApps = environmentStore.loadActiveAppDirectory();
  if (envApps && envApps.length > 0) {
    appDefs.splice(0, appDefs.length, ...envApps);
  }

  // Apply dock icon early to avoid a brief default Electron icon flash on macOS.
  if (process.platform === 'darwin' && shellManifest.iconDockPath && app.dock) {
    try {
      app.dock.setIcon(shellManifest.iconDockPath);
    } catch (error) {
      console.warn(`[main] Could not set dock icon early: ${(error as Error).message}`);
    }
  }

  // 3. Core engines
  const channelManager = new ChannelManager();
  const intentRegistry = new IntentRegistry();

  // 4. Window manager
  const windowManager = new WindowManager(appDefs, shellManifest);

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
    managerService,
    bridgeService,
    environmentStore,
    rbacStore,
  );
  ipcRouter.register();

  // If a remote directory URL is configured in the persisted settings,
  // kick off an opportunistic check on boot — surfaces the "Update available"
  // banner as soon as the renderer connects without blocking startup.
  if (managerService.getSettings().directoryUrl) {
    void managerService.checkForUpdates();
  }
  if (bridgeService.getSettings().enabled) {
    void bridgeService.scan();
  }

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
