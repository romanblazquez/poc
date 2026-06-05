import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import type { AppDefinition } from '@fdc3-poc/fdc3-core';
import type { ManagerDirectoryDiff } from '@fdc3-poc/fdc3-core';
import { formatValidationResult, validateAppDirectory } from '@fdc3-poc/app-registry';
import type { AppDirectoryFile } from '@fdc3-poc/app-registry';

const CACHE_FILE = 'directory-cache.json';

/**
 * Result returned by `fetchRemote()` — the raw parsed file plus the metadata
 * we need to track for staleness / diff / display.
 */
export interface RemoteFetchSuccess {
  ok: true;
  file: AppDirectoryFile;
  etag: string | null;
  fetchedAt: number;
}
export interface RemoteFetchFailure {
  ok: false;
  error: string;
  fetchedAt: number;
}
export type RemoteFetchResult = RemoteFetchSuccess | RemoteFetchFailure;

/**
 * Computes a structural diff between two directories. Identity = `appId`.
 * "Changed" means the JSON content of the matching apps differs — used to
 * surface the "X apps modified" line in the Manager Console update banner.
 */
export function diffDirectories(current: AppDefinition[], next: AppDefinition[]): ManagerDirectoryDiff {
  const byCurrent = new Map(current.map((a) => [a.appId, a]));
  const byNext = new Map(next.map((a) => [a.appId, a]));
  const addedApps: string[] = [];
  const removedApps: string[] = [];
  const changedApps: string[] = [];

  for (const [id, app] of byNext) {
    const existing = byCurrent.get(id);
    if (!existing) addedApps.push(id);
    else if (JSON.stringify(existing) !== JSON.stringify(app)) changedApps.push(id);
  }
  for (const id of byCurrent.keys()) {
    if (!byNext.has(id)) removedApps.push(id);
  }
  return { addedApps: addedApps.sort(), removedApps: removedApps.sort(), changedApps: changedApps.sort() };
}

/**
 * RemoteDirectoryClient — the io.Manager pull mechanism.
 *
 * Responsibilities:
 *  - Fetch a remote app-directory.json over HTTPS (or HTTP for dev).
 *  - Conditional GET via `If-None-Match` when we already have an ETag.
 *  - Validate the response with the shared `validateAppDirectory`.
 *  - Persist a copy to `userData/directory-cache.json` so the next launch
 *    survives an offline / unreachable remote.
 *  - Pure I/O — diff + apply decisions live in the caller (IpcRouter).
 *
 * Designed to be **safe by default**: a malformed or unsigned remote response
 * is rejected and the cached / local copy stays in force. Production would
 * extend this with signature verification (a separate pass).
 */
export class RemoteDirectoryClient {
  private etag: string | null = null;
  private readonly cachePath: string;

  constructor() {
    this.cachePath = path.join(app.getPath('userData'), CACHE_FILE);
  }

  /** Path the cache file is written to — exposed for diagnostics. */
  getCachePath(): string {
    return this.cachePath;
  }

  /** Best-effort read of the last successfully-fetched directory. */
  readCache(): { file: AppDirectoryFile; etag: string | null; fetchedAt: number } | null {
    try {
      if (!fs.existsSync(this.cachePath)) return null;
      const raw = fs.readFileSync(this.cachePath, 'utf-8');
      const wrapped = JSON.parse(raw) as { file: AppDirectoryFile; etag: string | null; fetchedAt: number };
      if (!wrapped || !wrapped.file) return null;
      return wrapped;
    } catch {
      return null;
    }
  }

  /** Fetch from `url`. Returns the parsed file + ETag + timestamp, or an error. */
  async fetch(url: string, signal?: AbortSignal): Promise<RemoteFetchResult> {
    const fetchedAt = Date.now();
    if (!url) return { ok: false, error: 'No directory URL configured', fetchedAt };
    let parsed: URL;
    try { parsed = new URL(url); } catch { return { ok: false, error: `Invalid URL: ${url}`, fetchedAt }; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: `Unsupported protocol: ${parsed.protocol}`, fetchedAt };
    }

    try {
      const { body, etag } = await this.httpGet(parsed, signal);
      if (etag !== null) this.etag = etag;
      let json: unknown;
      try { json = JSON.parse(body); } catch (err) {
        return { ok: false, error: `Invalid JSON in response: ${(err as Error).message}`, fetchedAt };
      }
      const validation = validateAppDirectory(json);
      if (!validation.valid) {
        return { ok: false, error: `Validation failed:\n${formatValidationResult(validation)}`, fetchedAt };
      }
      const file = json as AppDirectoryFile;
      this.writeCache(file, etag, fetchedAt);
      return { ok: true, file, etag, fetchedAt };
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? String(err), fetchedAt };
    }
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private writeCache(file: AppDirectoryFile, etag: string | null, fetchedAt: number): void {
    try {
      fs.writeFileSync(this.cachePath, JSON.stringify({ file, etag, fetchedAt }, null, 2));
    } catch (err) {
      console.warn('[remote-directory] cache write failed', err);
    }
  }

  /** Tiny HTTPS client — no extra dep. Supports conditional GET via ETag. */
  private httpGet(url: URL, signal?: AbortSignal): Promise<{ body: string; etag: string | null }> {
    return new Promise((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'fdc3-desktop-poc-manager/0.1',
      };
      if (this.etag) headers['If-None-Match'] = this.etag;

      const req = lib.request(
        {
          method: 'GET',
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          headers,
        },
        (res) => {
          // 304 = our cache is still fresh; re-use the cached body.
          if (res.statusCode === 304) {
            const cached = this.readCache();
            if (cached) {
              resolve({ body: JSON.stringify(cached.file), etag: cached.etag });
            } else {
              reject(new Error('304 Not Modified but no local cache to re-use'));
            }
            return;
          }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode ?? 'no-status'} from ${url.toString()}`));
            res.resume();
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            const etag = typeof res.headers['etag'] === 'string' ? res.headers['etag'] : null;
            resolve({ body, etag });
          });
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.setTimeout(10_000, () => req.destroy(new Error('Remote directory fetch timed out after 10s')));
      if (signal) {
        if (signal.aborted) req.destroy(new Error('aborted'));
        else signal.addEventListener('abort', () => req.destroy(new Error('aborted')));
      }
      req.end();
    });
  }
}
