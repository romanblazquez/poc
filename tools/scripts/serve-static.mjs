/**
 * Minimal zero-dependency static file server (ESM).
 *
 * Serves a directory over HTTP for plain (non-Angular) demo apps such as the
 * FDC3 conformance console, which deliberately has no build step or framework.
 *
 * Usage: node tools/scripts/serve-static.mjs <rootDir> <port>
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';

const root = process.argv[2];
const port = Number(process.argv[3]);
const host = '127.0.0.1';

if (!root || !Number.isInteger(port)) {
  process.stderr.write('usage: serve-static.mjs <rootDir> <port>\n');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    // Strip query/hash, prevent path traversal above root.
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(root, rel === '/' || rel === '' ? 'index.html' : rel);
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': TYPES[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(port, host, () => {
  process.stdout.write(`static server for ${root} on http://${host}:${port}\n`);
});
