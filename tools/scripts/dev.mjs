/**
 * Development orchestration script (ESM).
 *
 * Starts all Angular (nx serve) dev servers for the demo apps, waits for them
 * to be ready, then launches the Electron shell via electron-vite.
 *
 * Usage: node tools/scripts/dev.mjs
 */

import { spawn } from 'child_process';
import { createConnection } from 'net';

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW= '\x1b[33m';
const RESET = '\x1b[0m';

function log(prefix, msg, color = RESET) {
  process.stdout.write(`${color}[${prefix}]${RESET} ${msg}\n`);
}

/** Try once to connect to a TCP port. Returns true if open.
 *  Tries both ::1 (IPv6, default on macOS) and 127.0.0.1 (IPv4). */
function tryConnect(port) {
  const attempt = (host) =>
    new Promise((resolve) => {
      const sock = createConnection({ port, host });
      sock.setTimeout(400);
      sock.once('connect', () => { sock.destroy(); resolve(true); });
      sock.once('error',   () => { sock.destroy(); resolve(false); });
      sock.once('timeout', () => { sock.destroy(); resolve(false); });
    });
  return attempt('::1').then((ok) => ok || attempt('127.0.0.1'));
}

/** Poll a TCP port until open or timeout. */
async function waitForPort(port, label, maxMs = 60_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await tryConnect(port)) {
      log(label, `ready on :${port}`, GREEN);
      return;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  log(label, `WARNING: not ready after ${maxMs}ms, continuing anyway`, YELLOW);
}

const processes = [];

function spawnProc(name, command, args, color) {
  log(name, `${command} ${args.join(' ')}`, color);
  const proc = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  const prefix = `${color}[${name}]${RESET}`;
  proc.stdout.on('data', (d) =>
    String(d).split('\n').filter(Boolean).forEach((l) => process.stdout.write(`${prefix} ${l}\n`)),
  );
  proc.stderr.on('data', (d) =>
    String(d).split('\n').filter(Boolean).forEach((l) => process.stderr.write(`${prefix} ${l}\n`)),
  );
  processes.push(proc);
  return proc;
}

function killAll() {
  for (const p of processes) { if (!p.killed) p.kill('SIGTERM'); }
}

process.on('SIGINT',  () => { killAll(); process.exit(0); });
process.on('SIGTERM', () => { killAll(); process.exit(0); });

// ─── 1. Start Angular dev servers for each demo app ──────────────────────────

const apps = [
  { name: 'SEARCH',    port: 4001, args: ['nx', 'serve', 'customer-search',    '--port=4001', '--no-open'] },
  { name: 'PROFILE',   port: 4002, args: ['nx', 'serve', 'customer-profile',   '--port=4002', '--no-open'] },
  { name: 'PORTFOLIO', port: 4003, args: ['nx', 'serve', 'portfolio-view',     '--port=4003', '--no-open'] },
  { name: 'MARKET',    port: 4004, args: ['nx', 'serve', 'market-watch',       '--port=4004', '--no-open'] },
  { name: 'PAYMENT',   port: 4005, args: ['nx', 'serve', 'payment-action',     '--port=4005', '--no-open'] },
  { name: 'TICKET',    port: 4006, args: ['nx', 'serve', 'order-ticket',       '--port=4006', '--no-open'] },
  { name: 'BLOTTER',   port: 4007, args: ['nx', 'serve', 'order-blotter',      '--port=4007', '--no-open'] },
  { name: 'CHART',     port: 4008, args: ['nx', 'serve', 'chart',              '--port=4008', '--no-open'] },
  { name: 'NEWS',      port: 4009, args: ['nx', 'serve', 'news',               '--port=4009', '--no-open'] },
  { name: 'RFQ',       port: 4010, args: ['nx', 'serve', 'rfq-quote',          '--port=4010', '--no-open'] },
  { name: 'FUNDS',     port: 4011, args: ['nx', 'serve', 'funds-allocations',  '--port=4011', '--no-open'] },
  { name: 'ORDERS',    port: 4012, args: ['nx', 'serve', 'incoming-orders',    '--port=4012', '--no-open'] },
  { name: 'AUDIT',     port: 4013, args: ['nx', 'serve', 'audit-log',          '--port=4013', '--no-open'] },
  { name: 'THEME',     port: 4014, args: ['nx', 'serve', 'theme-toggle',       '--port=4014', '--no-open'] },
];

for (const app of apps.filter((a) => a.port > 0)) {
  spawnProc(app.name, 'npx', app.args, CYAN);
}

// Plain static demo apps (no framework / no nx serve) — served by a tiny static server.
const staticApps = [
  { name: 'CONFORM', port: 4015, root: 'apps/fdc3-conformance' },
];
for (const s of staticApps) {
  spawnProc(s.name, 'node', ['tools/scripts/serve-static.mjs', s.root, String(s.port)], CYAN);
  apps.push({ name: s.name, port: s.port });
}

// ─── 2. Wait for all Angular dev servers ─────────────────────────────────────

log('DEV', 'Waiting for Angular dev servers to be ready…', YELLOW);
await Promise.all(apps.filter((a) => a.port > 0).map((a) => waitForPort(a.port, a.name)));

// ─── 3. Launch Electron via electron-vite ────────────────────────────────────

log('SHELL', 'Launching Electron shell…', YELLOW);
spawnProc(
  'SHELL',
  'npx',
  ['electron-vite', 'dev', '--config', 'apps/desktop-shell/electron.vite.config.ts'],
  GREEN,
);
