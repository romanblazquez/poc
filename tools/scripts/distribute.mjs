#!/usr/bin/env node
/**
 * distribute.mjs — FDC3 Desktop Shell: Role-Based App Distribution CLI
 *
 * Super-admin tool for managing which apps and shell features each trading role
 * can access, and for pushing version updates to connected Electron shells.
 *
 * Connects to Active Directory (LDAP) in production; falls back to a local
 * mock (config/distribution/ad-mock.json) in dev mode.
 *
 * Usage:
 *   node tools/scripts/distribute.mjs <command> [options]
 *
 * Commands:
 *   list                                List all roles with app counts and current versions
 *   status                              Show distribution server + AD connection status
 *   push [--role <r>] [--version <v>] [--env <e>] [--notes "..."]
 *                                       Push version update, notify connected shells
 *   apps --role <r>                     Show apps accessible to a role
 *   apps --role <r> --set <a1,a2,...>   Replace the full app list for a role
 *   apps --role <r> --add <app>         Add a single app to a role
 *   apps --role <r> --remove <app>      Remove a single app from a role
 *   features --role <r>                 Show shell feature flags for a role
 *   features --role <r> --set <f=true,f2=false,...>
 *                                       Set shell feature flags for a role
 *   assign --user <id> --role <r>       Assign a user to a role (writes rbac.json)
 *   users [--role <r>]                  List users (optionally filtered by role)
 *   ad status                           Show Active Directory connection status
 *   ad sync [--dry-run]                 Sync users from AD into local RBAC config
 *   ad users                            List users from AD with resolved roles
 *   ad mock --user <u> --groups <g1,g2> Add a simulated AD user
 *   serve [--port 4476]                 Start the distribution server (shortcut)
 *
 * Environment variables:
 *   AD_MODE=mock|ldap           default: mock
 *   AD_URL=ldap://dc.corp.local LDAP server URL
 *   AD_BIND_DN=CN=svc,...       Service account DN for LDAP bind
 *   AD_BIND_PW=...              Service account password
 *   AD_BASE_DN=DC=corp,...      Search base DN
 *   AD_GROUPS_OU=OU=Groups,...  Groups search base
 *   ADMIN_TOKEN=...             Token for /push endpoint (default: dev-admin-token)
 *   DIR_SERVER=http://127.0.0.1:4476  Distribution server URL
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const CONFIG = path.join(ROOT, 'config');
const DIST_CONFIG = path.join(CONFIG, 'distribution');
const ROLES_DIR = path.join(CONFIG, 'roles');

const AD_MODE = process.env.AD_MODE ?? 'mock';
const AD_URL = process.env.AD_URL ?? '';
const AD_BIND_DN = process.env.AD_BIND_DN ?? '';
const AD_BIND_PW = process.env.AD_BIND_PW ?? '';
const AD_BASE_DN = process.env.AD_BASE_DN ?? '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'dev-admin-token';
const DIR_SERVER = process.env.DIR_SERVER ?? 'http://127.0.0.1:4476';

// ─── ANSI colours ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', magenta: '\x1b[35m', blue: '\x1b[34m',
};
const col = (text, color) => `${color}${text}${C.reset}`;
const bold = (t) => col(t, C.bold);
const dim = (t) => col(t, C.dim);
const ok = (t) => col(t, C.green);
const warn = (t) => col(t, C.yellow);
const err = (t) => col(t, C.red);
const info = (t) => col(t, C.cyan);

// ─── Config I/O ────────────────────────────────────────────────────────────

function loadJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return fallback; }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function loadManifest() {
  return loadJson(path.join(DIST_CONFIG, 'manifest.json'), {
    schemaVersion: '1.0', updatedAt: new Date().toISOString(),
    versions: { global: '0.0.0', roles: {}, envs: {} }, changelog: [],
  });
}

function loadRoleConfig(role) {
  return loadJson(path.join(ROLES_DIR, `${role}.json`), null);
}

function saveRoleConfig(role, config) {
  saveJson(path.join(ROLES_DIR, `${role}.json`), config);
}

function listRoles() {
  if (!fs.existsSync(ROLES_DIR)) return [];
  return fs.readdirSync(ROLES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
}

function loadRbac() {
  const p = path.join(CONFIG, 'distribution', 'rbac-override.json');
  if (fs.existsSync(p)) return loadJson(p, { roles: {}, users: [] });
  // Fall back to electron userData rbac if available, else empty
  return { roles: {}, users: [] };
}

function saveRbac(rbac) {
  saveJson(path.join(DIST_CONFIG, 'rbac-override.json'), rbac);
}

// ─── Active Directory ──────────────────────────────────────────────────────

function loadAdMock() {
  return loadJson(path.join(DIST_CONFIG, 'ad-mock.json'), { domain: 'LOCAL', users: [] });
}

function loadGroupMap() {
  return loadJson(path.join(DIST_CONFIG, 'ad-group-map.json'), { groupToRole: {}, priorityOrder: [] });
}

function resolveRoleFromGroups(groups, groupMap) {
  const { groupToRole, priorityOrder } = groupMap;
  for (const grp of priorityOrder) {
    if (groups.includes(grp) && groupToRole[grp]) return groupToRole[grp];
  }
  // Fallback: first group match
  for (const grp of groups) {
    if (groupToRole[grp]) return groupToRole[grp];
  }
  return 'ReadOnly';
}

async function adStatus() {
  if (AD_MODE === 'mock') {
    const mock = loadAdMock();
    console.log(`${ok('AD Mode:')} mock (${mock.domain})`);
    console.log(`${info('Users:')} ${mock.users.length}`);
    console.log(dim(`  To connect to real LDAP: set AD_MODE=ldap AD_URL=ldap://... AD_BIND_DN=... AD_BIND_PW=... AD_BASE_DN=...`));
    return;
  }
  // Real LDAP: attempt a connection check
  if (!AD_URL) { console.log(err('AD_URL not set')); return; }
  console.log(`${info('AD Mode:')} ldap`);
  console.log(`${info('Server:')} ${AD_URL}`);
  console.log(`${info('Bind DN:')} ${AD_BIND_DN || warn('(not set)')}`);
  console.log(`${info('Base DN:')} ${AD_BASE_DN || warn('(not set)')}`);
  // We do a raw TCP connect to check reachability (no ldap dep required)
  const url = new URL(AD_URL);
  const port = Number(url.port) || (url.protocol === 'ldaps:' ? 636 : 389);
  const reachable = await tcpCheck(url.hostname, port);
  console.log(`${info('Reachable:')} ${reachable ? ok('yes') : err('no — cannot connect to ' + AD_URL)}`);
  if (!reachable) console.log(warn('  Check AD_URL, firewall rules, and VPN connectivity.'));
}

async function tcpCheck(host, port) {
  const net = await import('net');
  return new Promise((resolve) => {
    const sock = net.default.createConnection({ host, port });
    sock.setTimeout(3000);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
  });
}

async function adUsers() {
  if (AD_MODE !== 'mock') {
    console.log(warn('Real LDAP user listing requires the ldapjs package (not bundled in this POC).'));
    console.log(dim('  Install: npm install ldapjs'));
    console.log(dim('  Then implement the LDAP_SEARCH path below in adSync().'));
    return;
  }
  const mock = loadAdMock();
  const groupMap = loadGroupMap();
  console.log(`\n${bold('Active Directory Users')} ${dim(`(mock: ${mock.domain})`)}\n`);
  const rows = mock.users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    groups: u.groups.join(', '),
    role: resolveRoleFromGroups(u.groups, groupMap),
  }));
  printTable(rows, ['id','username','displayName','role','groups']);
}

async function adSync(dryRun = false) {
  if (AD_MODE !== 'mock') {
    console.log(warn('Real LDAP sync: see comments in adSync() for ldapjs integration point.'));
    /*
     * REAL LDAP INTEGRATION POINT — production implementation:
     *
     * import ldap from 'ldapjs';
     * const client = ldap.createClient({ url: AD_URL });
     * await bind(client, AD_BIND_DN, AD_BIND_PW);
     * const entries = await search(client, AD_BASE_DN, {
     *   scope: 'sub',
     *   filter: '(&(objectClass=user)(objectCategory=person))',
     *   attributes: ['sAMAccountName','displayName','mail','memberOf'],
     * });
     * const users = entries.map(e => ({
     *   id: e.objectGUID,
     *   username: e.sAMAccountName,
     *   displayName: e.displayName,
     *   email: e.mail,
     *   groups: Array.isArray(e.memberOf) ? e.memberOf.map(extractCN) : [],
     * }));
     * Then continue with the same resolveRoleFromGroups logic below.
     */
    return;
  }

  const mock = loadAdMock();
  const groupMap = loadGroupMap();
  const rbac = loadRbac();

  const usersToSync = mock.users.map((u) => ({
    id: u.id,
    name: u.displayName,
    role: resolveRoleFromGroups(u.groups, groupMap),
    email: u.email,
  }));

  if (dryRun) {
    console.log(`\n${bold('AD Sync')} ${warn('[DRY RUN — no changes written]')}\n`);
    printTable(usersToSync, ['id','name','role','email']);
    return;
  }

  rbac.users = usersToSync;
  saveRbac(rbac);
  console.log(ok(`\nAD sync complete — ${usersToSync.length} users written to config/distribution/rbac-override.json`));
  printTable(usersToSync, ['id','name','role','email']);
  console.log(dim(`\n  The Electron shell reads RBAC from its userData directory.`));
  console.log(dim(`  To push to a running shell: node tools/scripts/distribute.mjs push --version <v>`));
}

async function adMockAddUser(username, groups) {
  const mock = loadAdMock();
  const existing = mock.users.find((u) => u.username === username);
  const groupList = groups.split(',').map((g) => g.trim()).filter(Boolean);
  if (existing) {
    existing.groups = groupList;
    console.log(ok(`Updated mock AD user: ${username} → groups: ${groupList.join(', ')}`));
  } else {
    const id = `u${String(mock.users.length + 1).padStart(3,'0')}`;
    mock.users.push({ id, username, displayName: username, email: `${username}@${mock.domain.toLowerCase()}`, groups: groupList });
    console.log(ok(`Added mock AD user: ${username} (id: ${id}) → groups: ${groupList.join(', ')}`));
  }
  saveJson(path.join(DIST_CONFIG, 'ad-mock.json'), mock);
  const groupMap = loadGroupMap();
  const role = resolveRoleFromGroups(groupList, groupMap);
  console.log(`  Resolved role: ${info(role)}`);
}

// ─── Role + App management ─────────────────────────────────────────────────

function cmdList() {
  const manifest = loadManifest();
  const roles = listRoles();
  console.log(`\n${bold('FDC3 Desktop Shell — Role Distribution')} ${dim(`(global: ${manifest.versions?.global ?? '?'})`)} \n`);
  const rows = roles.map((r) => {
    const cfg = loadRoleConfig(r);
    const version = manifest.versions?.roles?.[r] ?? manifest.versions?.global ?? '?';
    const featureCount = Object.values(cfg?.shellFeatures ?? {}).filter(Boolean).length;
    const totalFeatures = Object.keys(cfg?.shellFeatures ?? {}).length;
    return {
      role: r,
      version,
      apps: cfg?.apps?.length ?? 0,
      'shell features': `${featureCount}/${totalFeatures}`,
      description: (cfg?._description ?? '').substring(0, 60),
    };
  });
  printTable(rows, ['role','version','apps','shell features','description']);
  console.log();
}

function cmdStatus() {
  console.log(`\n${bold('Distribution System Status')}\n`);
  console.log(`  ${info('Config root:')}   ${CONFIG}`);
  console.log(`  ${info('Roles dir:')}     ${ROLES_DIR}`);
  console.log(`  ${info('Roles found:')}   ${listRoles().join(', ')}`);
  console.log(`  ${info('AD mode:')}       ${AD_MODE}`);
  console.log(`  ${info('Server URL:')}    ${DIR_SERVER}`);
  console.log(`  ${info('Admin token:')}   ${ADMIN_TOKEN}`);

  const manifest = loadManifest();
  console.log(`\n  ${bold('Manifest:')}`);
  console.log(`    Global version: ${ok(manifest.versions?.global ?? 'none')}`);
  console.log(`    Last updated:   ${dim(manifest.updatedAt ?? 'never')}`);
  if (manifest.changelog?.length) {
    const latest = manifest.changelog[0];
    console.log(`    Latest change:  ${latest.version} — ${dim(latest.notes || '(no notes)')}`);
  }

  // Try server ping
  pingServer().then((alive) => {
    console.log(`\n  ${bold('Server:')} ${alive ? ok('online at ' + DIR_SERVER) : warn('offline — start with: node tools/scripts/app-directory-server.mjs')}`);
    console.log();
  });
}

function cmdApps(role, action, value) {
  const cfg = loadRoleConfig(role);
  if (!cfg) { console.log(err(`Role "${role}" not found. Available: ${listRoles().join(', ')}`)); process.exit(1); }

  if (!action) {
    console.log(`\n${bold(`Apps for role: ${role}`)}\n`);
    (cfg.apps ?? []).forEach((a) => console.log(`  ${ok('+')} ${a}`));
    console.log(`\n  ${dim('Blocked:')} ${(cfg.rbac?.blockedApps ?? []).join(', ')}`);
    return;
  }

  if (action === 'set') {
    cfg.apps = value.split(',').map((a) => a.trim()).filter(Boolean);
    saveRoleConfig(role, cfg);
    console.log(ok(`Updated ${role} app list (${cfg.apps.length} apps): ${cfg.apps.join(', ')}`));
  } else if (action === 'add') {
    if (!cfg.apps.includes(value)) { cfg.apps.push(value); saveRoleConfig(role, cfg); }
    console.log(ok(`Added "${value}" to ${role} apps`));
  } else if (action === 'remove') {
    cfg.apps = (cfg.apps ?? []).filter((a) => a !== value);
    saveRoleConfig(role, cfg);
    console.log(ok(`Removed "${value}" from ${role} apps`));
  }
}

function cmdFeatures(role, setPairs) {
  const cfg = loadRoleConfig(role);
  if (!cfg) { console.log(err(`Role "${role}" not found.`)); process.exit(1); }

  if (!setPairs) {
    console.log(`\n${bold(`Shell features for role: ${role}`)}\n`);
    const features = cfg.shellFeatures ?? {};
    const allFeatures = [
      'appLauncher','workspaceBuilder','channelBar','contextInspector','commandCenter',
      'controlTower','interopFlow','manager','rbacPanel','appDirectoryEditor',
      'bridge','envSwitch','themeToggle','zoomControl','notifications','hotkeyHelp',
      'setupWizard','intelligence',
    ];
    for (const f of allFeatures) {
      const v = features[f] ?? false;
      console.log(`  ${v ? ok('[ON] ') : err('[OFF]')} ${f}`);
    }
    return;
  }

  // Parse "feat=true,feat2=false" pairs
  const pairs = setPairs.split(',').map((p) => p.trim());
  cfg.shellFeatures = cfg.shellFeatures ?? {};
  for (const pair of pairs) {
    const [k, v] = pair.split('=');
    if (!k) continue;
    cfg.shellFeatures[k.trim()] = v?.trim() === 'true' || v?.trim() === '1' || v?.trim() === 'yes';
  }
  saveRoleConfig(role, cfg);
  console.log(ok(`Updated shellFeatures for ${role}:`));
  for (const pair of pairs) {
    const [k] = pair.split('=');
    console.log(`  ${info(k.trim())}: ${cfg.shellFeatures[k.trim()] ? ok('true') : err('false')}`);
  }
}

function cmdAssign(userId, role) {
  if (!listRoles().includes(role)) {
    console.log(err(`Unknown role "${role}". Available: ${listRoles().join(', ')}`)); process.exit(1);
  }
  const rbac = loadRbac();
  rbac.users = rbac.users ?? [];
  const existing = rbac.users.find((u) => u.id === userId || u.name === userId);
  if (existing) {
    existing.role = role;
    console.log(ok(`Updated user "${existing.name ?? userId}" → role: ${role}`));
  } else {
    rbac.users.push({ id: userId, name: userId, role });
    console.log(ok(`Assigned new user "${userId}" → role: ${role}`));
  }
  saveRbac(rbac);
}

function cmdUsers(filterRole) {
  const rbac = loadRbac();
  const mock = loadAdMock();
  const groupMap = loadGroupMap();
  const adResolved = mock.users.map((u) => ({
    id: u.id,
    name: u.displayName,
    username: u.username,
    role: resolveRoleFromGroups(u.groups, groupMap),
    source: 'AD',
  }));
  const overrides = (rbac.users ?? []).map((u) => ({ ...u, source: 'rbac-override' }));

  // Merge: override wins
  const overrideIds = new Set(overrides.map((u) => u.id));
  const merged = [...adResolved.filter((u) => !overrideIds.has(u.id)), ...overrides];
  const filtered = filterRole ? merged.filter((u) => u.role === filterRole) : merged;

  console.log(`\n${bold(`Users${filterRole ? ` (role: ${filterRole})` : ''}`)}\n`);
  printTable(filtered, ['id','name','role','source','username']);
  console.log();
}

// ─── Version push ──────────────────────────────────────────────────────────

async function cmdPush(role, version, env, notes, mandatory = false, countdownSecs = '60') {
  // Auto-increment if no version given
  if (!version) {
    const manifest = loadManifest();
    const current = (role ? manifest.versions?.roles?.[role] : null) ?? manifest.versions?.global ?? '0.0.0';
    const parts = current.split('.').map(Number);
    parts[2] = (parts[2] ?? 0) + 1;
    version = parts.join('.');
    console.log(dim(`No --version given — auto-incrementing patch: ${current} → ${version}`));
  }

  const body = JSON.stringify({ version, role, env, notes, mandatory, mandatoryCountdownSecs: Number(countdownSecs) });
  const alive = await pingServer();
  if (!alive) {
    console.log(warn('Distribution server is offline. Writing manifest locally only.'));
    const manifest = loadManifest();
    manifest.updatedAt = new Date().toISOString();
    if (role) {
      manifest.versions.roles = manifest.versions.roles ?? {};
      manifest.versions.roles[role] = version;
    } else {
      manifest.versions.global = version;
      for (const r of listRoles()) {
        manifest.versions.roles = manifest.versions.roles ?? {};
        manifest.versions.roles[r] = version;
      }
    }
    manifest.changelog.unshift({ version, date: new Date().toISOString(), notes: notes ?? '', roles: role ? [role] : ['*'], envs: env ? [env] : ['dev','uat','prod'], mandatory: Boolean(mandatory), mandatoryCountdownSecs: mandatory ? Number(countdownSecs) : undefined });
    saveJson(path.join(DIST_CONFIG, 'manifest.json'), manifest);
    console.log(ok(`Version ${version} written to manifest${role ? ` for role: ${role}` : ''}.`));
    console.log(dim('  Start the server to notify connected shells: node tools/scripts/app-directory-server.mjs'));
    return;
  }

  const url = new URL('/push', DIR_SERVER);
  const response = await httpPost(url, body, { 'x-admin-token': ADMIN_TOKEN, 'content-type': 'application/json' });
  if (response.ok) {
    console.log(ok(`\nVersion ${bold(version)} pushed successfully!`));
    console.log(`  Role:   ${info(response.body.role ?? '*')}`);
    console.log(`  Env:    ${info(response.body.env ?? '*')}`);
    console.log(`  Notes:  ${dim(notes ?? '(none)')}`);
    console.log(`  SSE clients notified via ${DIR_SERVER}/events`);
  } else {
    console.log(err(`Push failed: ${response.error ?? JSON.stringify(response.body)}`));
  }
  console.log();
}

// ─── Serve shortcut ───────────────────────────────────────────────────────

function cmdServe(port) {
  const serverScript = path.join(__dirname, 'app-directory-server.mjs');
  if (!fs.existsSync(serverScript)) {
    console.log(err('app-directory-server.mjs not found. Expected at: ' + serverScript));
    process.exit(1);
  }
  const args = port ? [`--port=${port}`] : [];
  const child = spawn(process.execPath, [serverScript, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function printTable(rows, keys) {
  if (!rows.length) { console.log(dim('  (empty)')); return; }
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)));
  const header = keys.map((k, i) => bold(k.padEnd(widths[i]))).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  console.log('  ' + header);
  console.log('  ' + dim(sep));
  for (const row of rows) {
    console.log('  ' + keys.map((k, i) => String(row[k] ?? '').padEnd(widths[i])).join('  '));
  }
}

function pingServer() {
  return new Promise((resolve) => {
    const url = new URL('/', DIR_SERVER);
    const req = http.request({ method: 'GET', hostname: url.hostname, port: Number(url.port) || 4476, path: '/' }, (res) => {
      res.resume(); resolve(res.statusCode < 500);
    });
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

function httpPost(url, body, headers) {
  return new Promise((resolve) => {
    const req = http.request({
      method: 'POST',
      hostname: url.hostname,
      port: Number(url.port) || 4476,
      path: url.pathname,
      headers: { ...headers, 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: res.statusCode < 300, status: res.statusCode, body: parsed });
        } catch {
          resolve({ ok: false, error: data });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

function printHelp() {
  console.log(`
${bold('distribute.mjs')} — FDC3 Desktop Shell: Role-Based App Distribution CLI

${bold('COMMANDS')}

  ${info('list')}                                 List all roles, versions, and app counts
  ${info('status')}                               Distribution server + AD connection status
  ${info('push')} [--role r] [--version v] [--env e] [--notes "..."]
                                      Push a version update; notify connected shells
  ${info('apps')} --role r                         Show apps for a role
  ${info('apps')} --role r --set a1,a2,...          Replace the app list for a role
  ${info('apps')} --role r --add app               Add an app to a role
  ${info('apps')} --role r --remove app            Remove an app from a role
  ${info('features')} --role r                     Show shell feature flags for a role
  ${info('features')} --role r --set f=true,f2=false  Set shell feature flags
  ${info('assign')} --user id --role r             Assign user to a role
  ${info('users')} [--role r]                      List all users (optionally filtered)
  ${info('ad status')}                             AD connection info
  ${info('ad sync')} [--dry-run]                   Sync users from AD into RBAC config
  ${info('ad users')}                              List AD users with resolved roles
  ${info('ad mock')} --user name --groups g1,g2    Add simulated AD user
  ${info('serve')} [--port 4476]                   Start the distribution HTTP/SSE server

${bold('SHELL FEATURES')} (controlled per role via ${info('features --set')})
  appLauncher, workspaceBuilder, channelBar, contextInspector, commandCenter,
  controlTower, interopFlow, manager, rbacPanel, appDirectoryEditor,
  bridge, envSwitch, themeToggle, zoomControl, notifications, hotkeyHelp,
  setupWizard, intelligence

${bold('EXAMPLES')}
  node tools/scripts/distribute.mjs list
  node tools/scripts/distribute.mjs push --version 1.2.0 --notes "Market watch fix"
  node tools/scripts/distribute.mjs push --role Trader --version 1.2.1
  node tools/scripts/distribute.mjs apps --role Compliance --set audit-log,order-blotter,market-watch
  node tools/scripts/distribute.mjs features --role Trader --set manager=false,interopFlow=false
  node tools/scripts/distribute.mjs assign --user alice.johnson --role Trader
  node tools/scripts/distribute.mjs ad sync
  node tools/scripts/distribute.mjs ad mock --user test.user --groups GRP-Traders,GRP-Markets
  ADMIN_TOKEN=secret node tools/scripts/distribute.mjs serve
`);
}

// ─── CLI entry point ───────────────────────────────────────────────────────

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function flag(name) {
  return process.argv.includes(name);
}

const [,, cmd, sub, ...rest] = process.argv;

async function main() {
  switch (cmd) {
    case 'list':        cmdList(); break;
    case 'status':      await cmdStatus(); break;
    case 'push':        await cmdPush(arg('--role'), arg('--version'), arg('--env'), arg('--notes'), flag('--mandatory'), arg('--countdown') ?? '60'); break;
    case 'apps': {
      const role = arg('--role');
      if (!role) { console.log(err('--role is required')); process.exit(1); }
      if (flag('--set'))    cmdApps(role, 'set', arg('--set'));
      else if (flag('--add'))    cmdApps(role, 'add', arg('--add'));
      else if (flag('--remove')) cmdApps(role, 'remove', arg('--remove'));
      else                       cmdApps(role, null, null);
      break;
    }
    case 'features': {
      const role = arg('--role');
      if (!role) { console.log(err('--role is required')); process.exit(1); }
      cmdFeatures(role, arg('--set') ?? null);
      break;
    }
    case 'assign':      cmdAssign(arg('--user'), arg('--role')); break;
    case 'users':       cmdUsers(arg('--role') ?? null); break;
    case 'ad':
      if (sub === 'status')    await adStatus();
      else if (sub === 'sync') await adSync(flag('--dry-run'));
      else if (sub === 'users') await adUsers();
      else if (sub === 'mock') await adMockAddUser(arg('--user'), arg('--groups') ?? '');
      else console.log(err(`Unknown ad sub-command: ${sub}`));
      break;
    case 'serve':       cmdServe(arg('--port') ?? null); break;
    case undefined:
    case '--help':
    case 'help':        printHelp(); break;
    default:            console.log(err(`Unknown command: ${cmd}`)); printHelp(); process.exit(1);
  }
}

main().catch((e) => { console.error(err(e.message)); process.exit(1); });
