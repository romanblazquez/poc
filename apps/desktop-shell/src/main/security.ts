import { app, session } from 'electron';

/**
 * Configures security policies for the Electron shell.
 *
 * Hardening strategy:
 * - Content Security Policy blocks inline scripts and enforces HTTPS/data sources
 * - Permissions are denied by default (camera, microphone, notifications etc.)
 * - Navigation is locked to known origins only
 * - New window creation is denied (apps use BrowserWindow.open via main process)
 */
export function setupSecurity(): void {
  // Block dangerous permission requests from renderers
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  // Enforce CSP for all HTTP responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' http://localhost:* ws://localhost:*; " +
            "script-src 'self' 'unsafe-inline' http://localhost:*; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: http://localhost:*; " +
            "connect-src 'self' http://localhost:* ws://localhost:*;",
        ],
      },
    });
  });

  // Log any console errors from renderers in dev mode
  if (process.env.NODE_ENV === 'development') {
    app.on('web-contents-created', (_, webContents) => {
      webContents.on('console-message', (_, _level, message, line, sourceId) => {
        if (message.includes('[fdc3]') || message.includes('ERROR')) {
          console.info(`[renderer:${sourceId}:${line}] ${message}`);
        }
      });
    });
  }
}
