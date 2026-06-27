#!/usr/bin/env node
/**
 * App Directory Distribution Server — port 4476
 *
 * Serves role-filtered app directories and streams live update notifications
 * to connected Electron shells via Server-Sent Events.
 *
 * Endpoints:
 *   GET  /              → server status
 *   GET  /manifest      → full version manifest
 *   GET  /directory     → ?role=Trader&env=dev  filtered AppDefinition[]
 *   GET  /roles         → list all role configs
 *   GET  /roles/:role   → single role config
 *   GET  /events        → SSE stream (push notifications on version change)
 *   POST /push          → push new version, notify all SSE clients
 *                         body: { version, role?, env?, notes? }
 *                         header: x-admin-token (matches ADMIN_TOKEN env var)
 *
 * Usage:
 *   node tools/scripts/app-directory-server.mjs [--port 4476]
 *   ADMIN_TOKEN=secret node tools/scripts/app-directory-server.mjs
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const CONFIG = path.join(ROOT, 'config');
const RELEASES_DIR = path.join(ROOT, 'releases');

const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1]
  ?? (process.argv.indexOf('--port') >= 0 ? process.argv[process.argv.indexOf('--port') + 1] : null)
  ?? 4476);

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-admin-token';

// ─── ANSI colours ──────────────────────────────────────────────────────────
const C = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', bold: '\x1b[1m', dim: '\x1b[2m' };
const log = (msg, color = C.reset) => console.log(`${color}[dir-server]${C.reset} ${msg}`);

// ─── SSE client registry ───────────────────────────────────────────────────
/** @type {Map<string, http.ServerResponse>} */
const sseClients = new Map();
let clientIdSeq = 0;

function sseNotify(event) {
  const data = `event: update\ndata: ${JSON.stringify(event)}\n\n`;
  for (const [id, res] of sseClients) {
    try {
      res.write(data);
    } catch {
      sseClients.delete(id);
    }
  }
  log(`SSE broadcast → ${sseClients.size} clients: ${JSON.stringify(event)}`, C.cyan);
}

// ─── Config helpers ────────────────────────────────────────────────────────

function loadManifest() {
  const p = path.join(CONFIG, 'distribution', 'manifest.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return { versions: { global: '0.0.0', roles: {}, envs: {} }, changelog: [] }; }
}

function saveManifest(manifest) {
  const p = path.join(CONFIG, 'distribution', 'manifest.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

function loadBaseDirectory(env = 'dev') {
  const candidates = [
    path.join(CONFIG, `app-directory-${env}.json`),
    path.join(CONFIG, 'app-directory.json'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return Array.isArray(raw) ? raw : (raw.applications ?? []);
    } catch { /* fall through */ }
  }
  return [];
}

function loadRoleConfig(role) {
  const p = path.join(CONFIG, 'roles', `${role}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
}

function listRoles() {
  try {
    return fs.readdirSync(path.join(CONFIG, 'roles'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch { return []; }
}

/**
 * Filter a full app directory to only the apps allowed for a role,
 * injecting the `roles` field and tagging with shellFeatures in a
 * top-level wrapper so the shell can apply feature gating.
 */
function buildRoleDirectory(allApps, roleConfig) {
  if (!roleConfig) return allApps;
  const allowed = new Set(roleConfig.apps ?? []);
  const blocked = new Set(roleConfig.rbac?.blockedApps ?? []);
  return allApps.filter((a) => {
    if (blocked.has(a.appId)) return false;
    if (allowed.size > 0 && !allowed.has(a.appId)) return false;
    return true;
  });
}

// ─── Request handlers ──────────────────────────────────────────────────────

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body, null, 2));
}

function handleStatus(req, res) {
  const manifest = loadManifest();
  const roles = listRoles();
  json(res, 200, {
    ok: true,
    server: 'fdc3-app-directory-server',
    version: '1.0.0',
    port: PORT,
    connectedClients: sseClients.size,
    globalVersion: manifest.versions?.global ?? 'unknown',
    roles,
    uptime: Math.round(process.uptime()),
  });
}

function handleManifest(req, res) {
  json(res, 200, loadManifest());
}

function handleDirectory(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const role = url.searchParams.get('role') ?? null;
  const env = url.searchParams.get('env') ?? 'dev';

  const allApps = loadBaseDirectory(env);
  const roleConfig = role ? loadRoleConfig(role) : null;
  const apps = buildRoleDirectory(allApps, roleConfig);

  const manifest = loadManifest();
  const version = (role ? manifest.versions?.roles?.[role] : null) ?? manifest.versions?.global ?? '0.0.0';
  const latestEntry = manifest.changelog?.[0];
  const isMandatory = latestEntry?.version === version && latestEntry?.mandatory === true;
  const countdownSecs = latestEntry?.mandatoryCountdownSecs ?? 60;
  const mandatoryDeadline = isMandatory ? (latestEntry?.mandatoryDeadline ?? null) : null;

  // Must conform to AppDirectoryFile: version="1.0" (schema), directoryVersion=semver
  json(res, 200, {
    version: '1.0',
    directoryVersion: version,
    directoryLabel: `${role ?? 'all'}-${env}`,
    mandatory: isMandatory,
    mandatoryCountdownSecs: isMandatory ? countdownSecs : undefined,
    mandatoryDeadline,
    shellFeatures: roleConfig?.shellFeatures ?? null,
    workspace: roleConfig?.workspace ?? null,
    applications: apps,
  });
}

function handleRoleList(req, res) {
  const roles = listRoles();
  const configs = roles.map((r) => {
    const cfg = loadRoleConfig(r);
    return {
      role: r,
      description: cfg?._description ?? '',
      appCount: cfg?.apps?.length ?? 0,
      shellFeatures: cfg?.shellFeatures ?? {},
    };
  });
  json(res, 200, { roles: configs });
}

function handleRoleDetail(req, res, role) {
  const cfg = loadRoleConfig(role);
  if (!cfg) return json(res, 404, { error: `Role "${role}" not found` });
  json(res, 200, cfg);
}

function handleEvents(req, res) {
  const id = String(++clientIdSeq);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId: id, server: 'fdc3-dir-server' })}\n\n`);
  sseClients.set(id, res);
  log(`SSE client connected: ${id} (total: ${sseClients.size})`, C.green);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); }
    catch { clearInterval(heartbeat); sseClients.delete(id); }
  }, 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(id);
    log(`SSE client disconnected: ${id} (total: ${sseClients.size})`, C.dim);
  });
}

function handleReleases(req, res, subpath) {
  // subpath examples: "Trader/latest.json", "Trader/1.2.0/FDC3-Desktop-Shell-Trader-1.2.0.dmg"
  const filePath = path.join(RELEASES_DIR, subpath);
  // Prevent path traversal
  if (!filePath.startsWith(RELEASES_DIR)) return json(res, 403, { error: 'Forbidden' });

  if (!fs.existsSync(filePath)) return json(res, 404, { error: `Release file not found: ${subpath}` });

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    // Return directory listing as JSON
    const files = fs.readdirSync(filePath).map(f => ({ name: f, size: fs.statSync(path.join(filePath, f)).size }));
    return json(res, 200, { path: subpath, files });
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.json' ? 'application/json' :
    ext === '.md' ? 'text/markdown' :
    ext === '.dmg' ? 'application/octet-stream' :
    ext === '.exe' ? 'application/octet-stream' :
    ext === '.appimage' ? 'application/octet-stream' :
    'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleBuildTrigger(req, res) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return json(res, 401, { error: 'Unauthorized' });

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

    const { role, version, env = 'prod', notes = '', mandatory = false, mandatoryDeadline = null, countdown = 60 } = payload;
    if (!role) return json(res, 400, { error: '"role" is required' });
    if (!version) return json(res, 400, { error: '"version" is required' });

    const flags = [
      `--role ${role}`,
      `--version ${version}`,
      `--env ${env}`,
      notes ? `--notes "${notes.replace(/"/g, '\\"')}"` : '',
      mandatory ? '--mandatory' : '',
      mandatory && mandatoryDeadline ? `--deadline "${mandatoryDeadline}"` : '',
      `--countdown ${countdown}`,
      '--push',
    ].filter(Boolean).join(' ');

    const buildScript = path.join(__dirname, 'build-role.mjs');
    const cmd = `node ${buildScript} ${flags}`;

    log(`Build triggered: ${cmd}`, C.yellow);

    // Fire-and-forget — client gets immediate ACK, watches SSE for completion
    const child = spawn('node', [buildScript, ...flags.split(' ')], {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ADMIN_TOKEN },
    });

    const buildId = `build-${Date.now()}`;
    let output = '';
    child.stdout?.on('data', d => { output += d; });
    child.stderr?.on('data', d => { output += d; });
    child.on('exit', (code) => {
      const ok = code === 0;
      log(`Build ${buildId} ${ok ? 'succeeded' : `failed (code ${code})`}`, ok ? C.green : C.red);
      sseNotify({ type: 'build', buildId, role, version, ok, output: output.slice(-2000) });
    });

    json(res, 202, { ok: true, buildId, message: `Build started for ${role} v${version}. Watch SSE /events for completion.` });
  });
}

function handleAdmin(req, res) {
  const dashboardPath = path.join(__dirname, 'admin-dashboard.html');
  if (!fs.existsSync(dashboardPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('admin-dashboard.html not found next to app-directory-server.mjs');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(dashboardPath, 'utf-8'));
}

async function handlePush(req, res) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return json(res, 401, { error: 'Unauthorized — x-admin-token header required' });
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body); }
    catch { return json(res, 400, { error: 'Invalid JSON body' }); }

    const { version, role, env, notes, mandatory = false, mandatoryCountdownSecs = 60, mandatoryDeadline = null } = payload;
    if (!version) return json(res, 400, { error: '"version" field is required' });

    const manifest = loadManifest();
    manifest.updatedAt = new Date().toISOString();

    if (role) {
      manifest.versions.roles = manifest.versions.roles ?? {};
      manifest.versions.roles[role] = version;
    } else {
      manifest.versions.global = version;
      // Bump all roles if no specific role given
      for (const r of listRoles()) {
        manifest.versions.roles = manifest.versions.roles ?? {};
        manifest.versions.roles[r] = version;
      }
      if (env) {
        manifest.versions.envs = manifest.versions.envs ?? {};
        manifest.versions.envs[env] = version;
      }
    }

    manifest.changelog = manifest.changelog ?? [];
    manifest.changelog.unshift({
      version,
      date: new Date().toISOString(),
      notes: notes ?? '',
      roles: role ? [role] : ['*'],
      envs: env ? [env] : ['dev', 'uat', 'prod'],
      mandatory: Boolean(mandatory),
      mandatoryCountdownSecs: mandatory ? Number(mandatoryCountdownSecs) : undefined,
      mandatoryDeadline: mandatory && mandatoryDeadline ? mandatoryDeadline : null,
    });

    try {
      saveManifest(manifest);
    } catch (err) {
      return json(res, 500, { error: `Failed to save manifest: ${err.message}` });
    }

    const event = { type: 'version', version, role: role ?? '*', env: env ?? '*', changedAt: Date.now(), notes: notes ?? '', mandatory: Boolean(mandatory), mandatoryDeadline: mandatory && mandatoryDeadline ? mandatoryDeadline : null };
    sseNotify(event);

    log(`Version pushed: ${version}${role ? ` (role: ${role})` : ''}${env ? ` (env: ${env})` : ''}`, C.yellow);
    json(res, 200, { ok: true, ...event });
  });
}

// ─── Router ────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;
  const method = req.method?.toUpperCase();

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-admin-token,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
    return res.end();
  }

  if (method === 'GET' && pathname === '/') return handleStatus(req, res);
  if (method === 'GET' && pathname === '/manifest') return handleManifest(req, res);
  if (method === 'GET' && pathname === '/directory') return handleDirectory(req, res);
  if (method === 'GET' && pathname === '/roles') return handleRoleList(req, res);
  if (method === 'GET' && pathname.startsWith('/roles/')) {
    const role = decodeURIComponent(pathname.slice('/roles/'.length));
    return handleRoleDetail(req, res, role);
  }
  if (method === 'GET' && pathname === '/events') return handleEvents(req, res);
  if (method === 'POST' && pathname === '/push') return handlePush(req, res);
  if (method === 'GET' && (pathname === '/admin' || pathname === '/admin/')) return handleAdmin(req, res);
  if (method === 'GET' && pathname.startsWith('/releases/')) {
    const subpath = pathname.slice('/releases/'.length);
    return handleReleases(req, res, subpath);
  }
  if (method === 'GET' && (pathname === '/releases' || pathname === '/releases/')) {
    // List all available roles in the registry
    if (!fs.existsSync(RELEASES_DIR)) return json(res, 200, { roles: [] });
    const roles = fs.readdirSync(RELEASES_DIR).filter(f => fs.statSync(path.join(RELEASES_DIR, f)).isDirectory());
    return json(res, 200, { roles });
  }
  if (method === 'POST' && pathname === '/build') return handleBuildTrigger(req, res);


  json(res, 404, { error: `No route for ${method} ${pathname}` });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`${C.bold}App Directory Server running at http://127.0.0.1:${PORT}${C.reset}`, C.green);
  log(`  GET  /              → server status`, C.dim);
  log(`  GET  /manifest      → version manifest`, C.dim);
  log(`  GET  /directory?role=Trader&env=dev  → filtered app directory`, C.dim);
  log(`  GET  /roles         → all role configs`, C.dim);
  log(`  GET  /roles/:role   → single role config`, C.dim);
  log(`  GET  /events        → SSE update stream`, C.dim);
  log(`  POST /push          → push version + notify clients (x-admin-token: ${ADMIN_TOKEN})`, C.dim);
  log(`  GET  /admin         → distribution console (web UI)`, C.dim);
  log(`  GET  /releases/:role/latest.json  → latest build manifest`, C.dim);
  log(`  GET  /releases/:role/:ver/:file   → download built artefact`, C.dim);
  log(`  POST /build         → trigger role build (x-admin-token: ${ADMIN_TOKEN})`, C.dim);
  log(``, C.reset);
  log(`Point the Electron shell's Manager → Directory URL to:`, C.yellow);
  log(`  http://127.0.0.1:${PORT}/directory?role=<ROLE>&env=<ENV>`, C.yellow);
});

server.on('error', (err) => {
  log(`Server error: ${err.message}`, C.red);
  process.exit(1);
});

process.on('SIGINT', () => {
  log('Shutting down...', C.dim);
  for (const [, res] of sseClients) { try { res.end(); } catch { /* ignore */ } }
  server.close(() => process.exit(0));
});
