import type { Fdc3DesktopAgent } from '../fdc3-types';

/**
 * Minimal FDC3 2.1 `getAgent()` discovery shim.
 *
 * The real spec uses an `identityUrl` + a postMessage handshake to ask the host
 * frame (parent, opener, top) "are you an FDC3 desktop agent?". A full
 * implementation would also remember the chosen agent per `identityUrl` and
 * negotiate channels.
 *
 * For this POC we keep the surface narrow: if the page already has a
 * `window.fdc3` global (the synchronous shell path), use it. Otherwise look
 * for a `getAgent` function on `window` published by another container
 * (io.Connect, Glue42, Cosaic) and call it with a timeout. The timeout
 * protects us from frames that never respond.
 */
export interface GetAgentOptions {
  identityUrl?: string;
  timeoutMs?: number;
}

interface HostWindow {
  fdc3?: Fdc3DesktopAgent;
  getAgent?: (opts: { identityUrl?: string }) => Promise<Fdc3DesktopAgent>;
}

/**
 * Returns the discovered `Fdc3DesktopAgent`, or `null` if neither
 * `window.fdc3` nor `window.getAgent()` is available before the timeout.
 */
export async function getAgentOrNull(opts: GetAgentOptions = {}): Promise<Fdc3DesktopAgent | null> {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as HostWindow;
  if (w.fdc3) return w.fdc3;
  if (typeof w.getAgent !== 'function') return null;

  const timeoutMs = opts.timeoutMs ?? 750;
  const getAgent = w.getAgent;
  return new Promise<Fdc3DesktopAgent | null>((resolve) => {
    let resolved = false;
    const t = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);
    getAgent({ identityUrl: opts.identityUrl ?? window.location.href })
      .then((agent) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(t);
          resolve(agent ?? null);
        }
      })
      .catch(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(t);
          resolve(null);
        }
      });
  });
}
