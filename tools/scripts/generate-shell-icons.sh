#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ASSETS_DIR="$ROOT_DIR/config/assets/icons"
SRC_DEFAULT="$ASSETS_DIR/source/shell-master.png"
SRC_PATH="${1:-$SRC_DEFAULT}"

if [[ ! -f "$SRC_PATH" ]]; then
  echo "Source image not found: $SRC_PATH" >&2
  echo "Usage: tools/scripts/generate-shell-icons.sh [path/to/source.png]" >&2
  exit 1
fi

mkdir -p "$ASSETS_DIR"

# Generate runtime icons used by desktop-shell.manifest.json.
sips -z 512 512 "$SRC_PATH" --out "$ASSETS_DIR/shell-window.png" >/dev/null
sips -z 512 512 "$SRC_PATH" --out "$ASSETS_DIR/shell-dock.png" >/dev/null

echo "Generated:"
echo "  $ASSETS_DIR/shell-window.png"
echo "  $ASSETS_DIR/shell-dock.png"