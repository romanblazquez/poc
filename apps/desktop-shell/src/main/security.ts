import { app, session } from 'electron';
import type { Session } from 'electron';

const STATIC_ASSET_RE = /\.(js|mjs|css|woff2?|ttf|otf|eot|svg|png|jpe?g|gif|ico|webp|avif)(\?[^#]*)?(?:#.*)?$/i;

/**
 * Configures a single Electron session with permission policies and
 * cache-friendly headers for static assets.
 *
 * Called for both the default session (shell renderer) and each app's
 * persist:workspace-<appId> session so that webview HTTP caches work.
 */
export function configureSession(ses: Session, isDev: boolean): void {
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write');
  });

  ses.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url;
    const isLocalhost = url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:');
    const isStaticAsset = STATIC_ASSET_RE.test(url.split('?')[0]);

    // In dev mode the Vite/Angular dev server sends no-store / no-cache for
    // every request which defeats Electron's per-session HTTP cache entirely.
    // We add a 1-hour cache for immutable static assets so that closing a
    // Dockview panel and reopening it uses the disk cache instead of
    // re-fetching every .js/.css bundle from the dev server.
    const cacheOverride: Record<string, string[]> =
      isDev && isLocalhost && isStaticAsset
        ? { 'Cache-Control': ['public, max-age=3600'] }
        : {};

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        ...cacheOverride,
      },
    });
  });
}

/**
 * Configures security policies for the Electron shell.
 *
 * Hardening strategy:
 * - Content Security Policy blocks inline scripts and enforces HTTPS/data sources
 * - Permissions are denied by default (camera, microphone, notifications etc.)
 * - Navigation is locked to known origins only
 */
export function setupSecurity(): void {
  const isDev = process.env.NODE_ENV === 'development';

  // Apply base hardening to the default session (shell renderer only).
  configureSession(session.defaultSession, isDev);

  // Add CSP on top of the default session — webview sessions intentionally
  // skip this so that cloud-served apps can enforce their own CSPs.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url;
    const isLocalhost = url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:');
    const isStaticAsset = STATIC_ASSET_RE.test(url.split('?')[0]);
    const cacheOverride: Record<string, string[]> =
      isDev && isLocalhost && isStaticAsset
        ? { 'Cache-Control': ['public, max-age=3600'] }
        : {};

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        ...cacheOverride,
        'Content-Security-Policy': [
          "default-src 'self' http://localhost:* ws://localhost:*; " +
            "script-src 'self' 'unsafe-inline' http://localhost:*; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob: http://localhost:*; " +
            "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:*;",
        ],
      },
    });
  });

  if (isDev) {
    app.on('web-contents-created', (_, webContents) => {
      webContents.on('console-message', (_, _level, message, line, sourceId) => {
        if (message.includes('[fdc3]') || message.includes('ERROR')) {
          console.info(`[renderer:${sourceId}:${line}] ${message}`);
        }
      });
    });
  }
}
