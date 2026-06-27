#!/usr/bin/env node
/**
 * Role-specific Electron build + publish to local release registry.
 *
 * Usage:
 *   node tools/scripts/build-role.mjs --role Trader --version 1.2.0
 *   node tools/scripts/build-role.mjs --role Trader --version 1.2.0 --push
 *   node tools/scripts/build-role.mjs --role all --version 1.2.0
 *
 * What it does:
 *   1. Generates a role-scoped electron-builder config (overrides productName,
 *      output dir, and bundles only the role's apps).
 *   2. Runs `npm run build:shell` + `electron-builder` with the temp config.
 *   3. Copies built artefacts to  releases/<role>/<version>/.
 *   4. Writes releases/<role>/latest.json  (download manifest).
 *   5. When --push: calls the dist server to broadcast a version update to all
 *      connected shells (requires ADMIN_TOKEN env var or default dev token).
 *
 * Release registry layout:
 *   releases/
 *     Trader/
 *       latest.json              ← current version pointer + download links
 *       1.2.0/
 *         FDC3-Desktop-Shell-Trader-1.2.0.dmg
 *         FDC3-Desktop-Shell-Trader-1.2.0.exe
 *         FDC3-Desktop-Shell-Trader-1.2.0.AppImage
 *         release-notes.md
 *
 * The dist server serves this directory at GET /releases/:role/latest.json
 * and GET /releases/:role/:version/:file
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const RELEASES_DIR = path.join(ROOT, 'releases');
const CONFIG_DIR = path.join(ROOT, 'config');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-admin-token';
const DIST_SERVER = process.env.DIST_SERVER || 'http://127.0.0.1:4476';

// ─── ANSI ─────────────────────────────────────────────────────────────────────
const C = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', bold: '\x1b[1m', dim: '\x1b[2m' };
const log  = (m, c = C.reset) => console.log(`${c}[build-role]${C.reset} ${m}`);
const err  = (m) => { console.error(`${C.red}[build-role]${C.reset} ${m}`); };
const fail = (m) => { err(m); process.exit(1); };

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const hasFlag = (flag) => args.includes(flag);

const roleArg    = getArg('--role');
const versionArg = getArg('--version');
const notesArg   = getArg('--notes', '');
const envArg     = getArg('--env', 'prod');
const doPush     = hasFlag('--push');
const dryRun     = hasFlag('--dry-run');
const mandatory  = hasFlag('--mandatory');
const deadline   = getArg('--deadline');
const countdown  = Number(getArg('--countdown', '60'));

if (!roleArg) fail('--role <RoleName|all> is required');
if (!versionArg) fail('--version <semver> is required');

const ROLES = roleArg === 'all'
  ? fs.readdirSync(path.join(CONFIG_DIR, 'roles')).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
  : [roleArg];

log(`Building roles: ${ROLES.join(', ')} @ v${versionArg}`, C.cyan);

// ─── Build each role ──────────────────────────────────────────────────────────
for (const role of ROLES) {
  await buildRole(role, versionArg);
}

if (doPush) {
  for (const role of ROLES) {
    await pushToServer(role, versionArg);
  }
}

log(`Done. Releases at: ${RELEASES_DIR}`, C.green);

// ─── Functions ────────────────────────────────────────────────────────────────

async function buildRole(role, version) {
  log(`\n${C.bold}── Role: ${role}  v${version} ──${C.reset}`, C.yellow);

  const outDir = path.join(RELEASES_DIR, role, version);
  const tempConfigPath = path.join(ROOT, `.electron-builder-${role}-tmp.json`);

  fs.mkdirSync(outDir, { recursive: true });

  // Generate role-specific electron-builder config
  const ebConfig = {
    appId: `com.enterprise.fdc3-desktop.${role.toLowerCase()}`,
    productName: `FDC3 Desktop Shell - ${role}`,
    directories: { output: outDir },
    files: [
      'apps/desktop-shell/out/**/*',
      'apps/fdc3-conformance/**/*',
      'config/**/*',
    ],
    extraResources: [
      { from: 'config', to: 'config' },
    ],
    // Embed the role env so the shell boots into role on first launch
    extraMetadata: {
      distributionRole: role,
      distributionVersion: version,
      distributionEnv: envArg,
    },
    mac: {
      icon: 'config/assets/icons/build/mac.icns',
      target: 'dmg',
      artifactName: `FDC3-Desktop-Shell-${role}-\${version}.\${ext}`,
    },
    win: {
      target: 'nsis',
      artifactName: `FDC3-Desktop-Shell-${role}-\${version}.\${ext}`,
    },
    linux: {
      target: 'AppImage',
      artifactName: `FDC3-Desktop-Shell-${role}-\${version}.\${ext}`,
    },
    // Publish to local file server — electron-updater will read this
    publish: {
      provider: 'generic',
      url: `${DIST_SERVER}/releases/${role}`,
    },
  };

  fs.writeFileSync(tempConfigPath, JSON.stringify(ebConfig, null, 2));
  log(`  Config written: ${tempConfigPath}`, C.dim);

  if (dryRun) {
    log(`  DRY RUN — skipping actual build`, C.yellow);
    writeLatestJson(role, version, outDir, []);
    fs.unlinkSync(tempConfigPath);
    return;
  }

  // Step 1: build the app bundle
  log(`  Building app bundle…`, C.dim);
  runCmd(`npm run build:shell`, { cwd: ROOT });

  // Step 2: package with electron-builder
  log(`  Packaging with electron-builder…`, C.dim);
  runCmd(`npx electron-builder --config ${tempConfigPath}`, { cwd: ROOT });

  // Step 3: write release notes
  if (notesArg) {
    fs.writeFileSync(path.join(outDir, 'release-notes.md'), `# ${role} v${version}\n\n${notesArg}\n`);
  }

  // Step 4: write latest.json manifest
  const files = fs.readdirSync(outDir).filter(f => !f.endsWith('.json') && !f.endsWith('.md'));
  writeLatestJson(role, version, outDir, files);

  // Cleanup temp config
  try { fs.unlinkSync(tempConfigPath); } catch { /* ignore */ }

  log(`  ✓ Built: ${outDir}`, C.green);
}

function writeLatestJson(role, version, outDir, files) {
  const latest = {
    role,
    version,
    releasedAt: new Date().toISOString(),
    env: envArg,
    notes: notesArg || '',
    mandatory,
    mandatoryDeadline: mandatory && deadline ? deadline : null,
    downloadBase: `${DIST_SERVER}/releases/${role}/${version}/`,
    files: files.map(f => ({
      name: f,
      url: `${DIST_SERVER}/releases/${role}/${version}/${f}`,
      platform: guessPlatform(f),
    })),
  };
  fs.writeFileSync(path.join(outDir, '..', 'latest.json'), JSON.stringify(latest, null, 2));
  log(`  latest.json updated → v${version}`, C.dim);
}

function guessPlatform(filename) {
  if (filename.endsWith('.dmg') || filename.endsWith('.pkg')) return 'mac';
  if (filename.endsWith('.exe') || filename.endsWith('.msi')) return 'win';
  if (filename.endsWith('.AppImage') || filename.endsWith('.deb') || filename.endsWith('.rpm')) return 'linux';
  return 'unknown';
}

async function pushToServer(role, version) {
  log(`  Pushing version notification to dist server…`, C.cyan);
  return new Promise((resolve) => {
    const body = JSON.stringify({
      version,
      role,
      env: envArg,
      notes: notesArg,
      mandatory,
      mandatoryCountdownSecs: countdown,
      mandatoryDeadline: mandatory && deadline ? deadline : null,
    });
    const url = new URL(`${DIST_SERVER}/push`);
    const req = http.request({
      hostname: url.hostname,
      port: Number(url.port),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-admin-token': ADMIN_TOKEN,
      },
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          log(`  ✓ Server notified: ${data.slice(0, 120)}`, C.green);
        } else {
          err(`  Server returned ${res.statusCode}: ${data}`);
        }
        resolve(undefined);
      });
    });
    req.on('error', (e) => {
      err(`  Could not reach dist server (${e.message}) — shells will detect on next poll`);
      resolve(undefined);
    });
    req.write(body);
    req.end();
  });
}

function runCmd(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
  } catch (e) {
    fail(`Command failed: ${cmd}\n${e.message}`);
  }
}
