# FDC3 Desktop POC

> **Enterprise desktop interoperability shell** built on Electron + FDC3-compatible APIs.  
> Demonstrates the core concepts of Interop.io / Harmonix / io.Connect Desktop without vendor lock-in.

---

## What This POC Demonstrates

| Capability | Implementation |
|------------|---------------|
| Multi-app desktop | 5 React apps in separate Electron `BrowserWindow`s |
| Context broadcasting | `window.fdc3.broadcast()` → IPC → channel-filtered delivery |
| User channels | 6 coloured channels; only apps on the same channel receive contexts |
| Intent routing | `raiseIntent('StartPayment')` opens Payment Action and pre-fills it |
| App directory | `config/app-directory.json` — declarative app registry |
| Workspace persistence | Save/restore window layout + channel assignments to disk |
| Adapter architecture | `InteropAdapter` interface — swap Electron IPC for io.Connect or OpenFin at runtime |
| Security | `contextIsolation: true`, no `nodeIntegration`, preload-only bridge |

---

## How It Compares to io.Connect / Harmonix

```
Custom Electron Shell (this POC)          io.Connect / Interop.io
─────────────────────────────────         ──────────────────────────────
✅ FDC3-compatible API                    ✅ FDC3 2.0 certified
✅ User channels                          ✅ User channels + channel visualiser
✅ Intent routing                         ✅ Intent routing + resolver UI
✅ App directory (JSON)                   ✅ Remote AppD, live reload, versioning
✅ Workspace persistence                  ✅ Named workspaces, server-side, shared
⚠️ Single monitor (Electron native)       ✅ Multi-monitor, tabbed groups
❌ No resolver UI (first match wins)      ✅ Full intent resolver dialog
❌ No native/COM app support              ✅ Native, .NET, Java, web
Free (open source)                        Commercial licence required
```

The **adapter pattern** ensures apps written for this POC run on io.Connect with a
one-file bootstrap swap. See [`docs/interop-vs-custom-shell.md`](docs/interop-vs-custom-shell.md).

---

## Prerequisites

- Node.js 20+
- npm 10+

---

## How to Run Locally

```bash
# 1. Install all dependencies (from repo root)
npm install

# 2. Start the full POC
npm run dev
```

This will:
1. Start Vite dev servers for all 5 demo apps (ports 4001–4005)
2. Wait for them to be ready
3. Launch `electron-vite dev` — builds main + preload, starts Electron

The **Shell Launcher** window opens automatically. Open apps from the launcher.

### Individual commands

```bash
# Start only the demo app servers (no Electron)
npm run dev:apps

# Start only the Electron shell (apps must already be running)
npm run dev:shell

# Full production build
npm run build

# Type check
npm run typecheck

# Lint
npm run lint
```

---

## Repository Structure

```
fdc3-desktop-poc/
├─ apps/
│  ├─ desktop-shell/       Electron app (main + preload + shell UI)
│  ├─ customer-search/     React app — FDC3 broadcaster
│  ├─ customer-profile/    React app — context receiver + intent raiser
│  ├─ portfolio-view/      React app — context receiver + instrument broadcaster
│  ├─ market-watch/        React app — instrument context receiver
│  └─ payment-action/      React app — StartPayment intent handler
│
├─ libs/
│  ├─ fdc3-core/            Types + InteropAdapter contract (no runtime deps)
│  ├─ interop-electron-adapter/  IPC event constants + adapter docs
│  ├─ interop-browser-adapter/   BroadcastChannel-based (browser-only mode)
│  ├─ interop-ioconnect-adapter/ io.Connect adapter stub (future)
│  ├─ app-registry/         AppRegistry + sample directory
│  ├─ channel-engine/       ChannelManager (last-value cache)
│  ├─ intent-engine/        IntentRegistry + IntentResolver
│  ├─ workspace-engine/     LayoutStore (JSON persistence)
│  ├─ shared-domain/        Mock financial data (customers, portfolios, etc.)
│  └─ shared-ui/            ChannelPicker, AppHeader, StatusBadge components
│
├─ config/
│  ├─ app-directory.json    App registry — edit to add new apps
│  ├─ channels.json         Channel definitions
│  └─ workspace.default.json Default layout
│
├─ docs/
│  ├─ architecture.md       Full architecture diagram + data flow
│  ├─ fdc3-model.md         FDC3 concepts explained
│  ├─ interop-vs-custom-shell.md  Comparison with io.Connect
│  └─ demo-script.md        Client-facing 15-minute walkthrough
│
└─ tools/scripts/dev.mjs    Dev orchestration script
```

---

## Demo Script (Quick Version)

1. `npm run dev` → Electron opens
2. In the Shell, click **Customer Search**, **Customer Profile**, **Portfolio View** to open them
3. Join all three apps to the **Green** channel via the channel picker in each app header
4. In Customer Search, click **Maria Garcia**
5. Watch Customer Profile and Portfolio View update instantly
6. In Customer Profile, click **💳 Start Payment**
7. Payment Action opens, pre-filled — click **✓ Approve**
8. In Portfolio View, click **AAPL** → open Market Watch → AAPL highlights
9. In Shell, click **💾 Save Workspace** → quit → relaunch → layout restores

Full script with narration: [`docs/demo-script.md`](docs/demo-script.md)

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────┐
│          Application Layer (window.fdc3)         │
│  CustomerSearch  CustomerProfile  PortfolioView  │
│  MarketWatch     PaymentAction                   │
└────────────────────┬─────────────────────────────┘
                     │  InteropAdapter interface
┌────────────────────▼─────────────────────────────┐
│       Adapter Layer (runtime-swappable)          │
│  ElectronAdapter  BrowserAdapter  IoConnectAdapter│
└────────────────────┬─────────────────────────────┘
                     │  Electron IPC (in this POC)
┌────────────────────▼─────────────────────────────┐
│        Electron Main Process                     │
│  WindowManager  ChannelManager  IntentResolver   │
│  AppRegistry    WorkspaceManager  IpcRouter      │
└──────────────────────────────────────────────────┘
```

---

## How to Replace the Custom Electron Adapter with io.Connect

1. Install `@interopio/desktop` (requires licence):
   ```bash
   npm install @interopio/desktop
   ```

2. Edit `libs/interop-ioconnect-adapter/src/ioconnect-interop-adapter.ts`:
   - Import from `@interopio/desktop` instead of the stub types
   - Implement the `TODO` comments

3. In each app's `src/main.tsx`, replace the preload-provided `window.fdc3` with:
   ```typescript
   import GlueDesktop from '@interopio/desktop';
   import { IoConnectInteropAdapter } from '@fdc3-poc/interop-ioconnect-adapter';

   const glue = await GlueDesktop({ appManager: 'full', channels: true });
   const adapter = new IoConnectInteropAdapter(glue);
   (window as any).fdc3 = {
     broadcast: (ctx) => adapter.broadcastContext(ctx),
     // ... same surface
   };
   ```

4. Remove `apps/desktop-shell/` — io.Connect hosts the windows natively.

5. App code (`CustomerSearch.tsx`, etc.) does not change.

See [`docs/interop-vs-custom-shell.md`](docs/interop-vs-custom-shell.md) for the full comparison.

---

## Next Steps (Turning This into a Real Client Demo)

1. **Add real data**: Replace mock data in `libs/shared-domain/` with live API calls
2. **Add an intent resolver UI**: When multiple apps handle the same intent, show a picker dialog
3. **io.Connect integration**: Wire `IoConnectInteropAdapter` with a trial licence
4. **Custom app**: Replace one demo app with a real client-owned application
5. **Named workspaces**: Extend `WorkspaceManager` with a workspace name picker UI
6. **Notifications**: Add FDC3-style notifications (not in FDC3 2.0 spec but io.Connect supports it)
7. **CI/CD**: Add GitHub Actions for type checking + build verification
8. **Electron packaging**: `npm run dist` produces a `.dmg` / `.exe` for client machines

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 31, electron-vite 2 |
| App renderer | React 18, Vite 5 |
| Language | TypeScript 5.5 (strict) |
| Monorepo | Nx 19 (project graph, task runner) |
| Interop protocol | FDC3 2.0 (custom implementation) |
| Persistence | Node.js `fs` (JSON files in userData) |
| Styling | Inline React styles (no CSS framework dependency) |
