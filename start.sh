#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
RESET='\033[0m'

log()  { echo -e "${CYAN}[start.sh]${RESET} $*"; }
ok()   { echo -e "${GREEN}[start.sh]${RESET} $*"; }
warn() { echo -e "${YELLOW}[start.sh]${RESET} $*"; }
err()  { echo -e "${RED}[start.sh]${RESET} $*" >&2; }

# ── node / npm check ──────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  err "Node.js not found. Install Node 20+ from https://nodejs.org and retry."
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if (( NODE_MAJOR < 20 )); then
  warn "Node ${NODE_MAJOR} detected — Node 20+ is recommended."
fi

# ── install dependencies if needed ───────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  log "node_modules not found — running npm install…"
  npm install
  ok "Dependencies installed."
else
  log "node_modules present — skipping install (run 'npm install' manually to update)."
fi

# ── launch ────────────────────────────────────────────────────────────────────
ok "Starting FDC3 Desktop POC…"
echo ""
echo -e "  ${CYAN}Vite dev servers${RESET}  → ports 4001–4005, 4011–4014  (demo apps)"
echo -e "  ${GREEN}Electron shell${RESET}    → electron-vite dev (main + preload + renderer)"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${RESET} to stop everything."
echo ""

exec node tools/scripts/dev.mjs
