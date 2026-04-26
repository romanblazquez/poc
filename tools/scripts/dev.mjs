/**
 * Development orchestration script (ESM).
 *
 * Starts all Vite dev servers for the demo apps, waits for them to be ready,
 * then launches the Electron shell via electron-vite.
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
async function waitForPort(port, label, maxMs = 40_000) {
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

// ─── 1. Start Vite dev servers for each demo app ─────────────────────────────

const apps = [
  { name: 'SEARCH',    port: 4001, config: 'apps/customer-search/vite.config.ts' },
  { name: 'PROFILE',   port: 4002, config: 'apps/customer-profile/vite.config.ts' },
  { name: 'PORTFOLIO', port: 4003, config: 'apps/portfolio-view/vite.config.ts' },
  { name: 'MARKET',    port: 4004, config: 'apps/market-watch/vite.config.ts' },
  { name: 'PAYMENT',   port: 4005, config: 'apps/payment-action/vite.config.ts' },
  { name: 'FUNDS',     port: 4011, config: 'apps/funds-allocations/vite.config.ts' },
  { name: 'ORDERS',    port: 4012, config: 'apps/incoming-orders/vite.config.ts' },
  { name: 'AUDIT',     port: 4013, config: 'apps/audit-log/vite.config.ts' },
  { name: 'THEME',     port: 4014, config: 'apps/theme-toggle/vite.config.ts' },
];

for (const app of apps) {
  spawnProc(app.name, 'npx', ['vite', '--config', app.config], CYAN);
}

// ─── 2. Wait for all Vite servers ───────────────────────────────────────────

log('DEV', 'Waiting for Vite dev servers to be ready…', YELLOW);
await Promise.all(apps.map((a) => waitForPort(a.port, a.name)));

// ─── 3. Launch Electron via electron-vite ────────────────────────────────────

log('SHELL', 'Launching Electron shell…', YELLOW);
spawnProc(
  'SHELL',
  'npx',
  ['electron-vite', 'dev', '--config', 'apps/desktop-shell/electron.vite.config.ts'],
  GREEN,
);
