# Desktop Shell Assets

This folder centralizes runtime branding assets for the Electron desktop shell.

## Manifest

- `desktop-shell.manifest.json`

## Icons (runtime)

- `icons/shell-window.png`:
  - Used by Electron `BrowserWindow` as the shell window icon.
  - Referenced by `desktopShell.icons.window` in the manifest.
- `icons/shell-dock.png`:
  - Used by Electron `app.dock.setIcon(...)` on macOS.
  - Referenced by `desktopShell.icons.dock` in the manifest.

## Recommended source assets (optional but useful)

- `icons/source/shell-master.svg`:
  - Keep one editable vector source of truth.
- `icons/source/shell-master-1024.png`:
  - High-resolution raster source for exporting platform variants.

## Generate runtime icons from your source image

1. Save your master image at `config/assets/icons/source/shell-master.png`.
2. Run:

  `tools/scripts/generate-shell-icons.sh`

3. This updates:
  - `icons/shell-window.png`
  - `icons/shell-dock.png`

## Packaging icons (separate from runtime manifest)

Installer/app-bundle icons are normally configured in packaging config and are not read from this manifest.
Keep these ready for your packaging pipeline:

- macOS app bundle: `.icns`
- Windows app bundle/installer: `.ico`
- Linux desktop entry: `.png` (commonly 256x256 or 512x512)
