# FDC3 Desktop POC

> **Enterprise desktop interoperability shell** built on Electron + FDC3-compatible APIs,
> with an Angular 21 app fleet, a static FDC3 conformance app, AG Grid blotters, Dockview workspaces, and a runtime-swappable
> adapter layer (Electron / Browser / io.Connect).
>
> Demonstrates the core concepts of Interop.io / Harmonix / io.Connect Desktop without vendor lock-in.

---

## What This POC Demonstrates

| Capability | Implementation |
|------------|---------------|
| Multi-app desktop | Angular, static, and cloud apps hosted either as detached Electron `BrowserWindow`s or as Dockview panels |
| Context broadcasting | `window.fdc3.broadcast()` → IPC → channel-filtered delivery |
| User channels | 6 colour-coded channels; only apps on the same channel receive contexts |
| Intent routing | `raiseIntent('StartPayment')` opens Payment Action and pre-fills it; results returned via `completeIntent` |
| App directory | `config/app-directory.json` — declarative app registry, **validated at load time** |
| Workspace persistence | Save/restore Dockview layout, channel assignments, detached windows |
| Multi-monitor | Detach the workspace into any connected display |
| Theming | 4 themes (`dark-financial`, `light-financial`, `high-contrast`, `luxury-neutral`) broadcast as `com.demo.theme` |
| Interop Flow designer | React Flow editor for visualising and gating context/intent routes between apps |
| Interop Command Center | Live activity timeline, channel visualizer, route matrix, and executive demo controls |
| Platform logging | Automatic console/error capture plus `window.platformLogs` structured logging for hosted apps |
| Cloud apps | Apps with `devPort: 0` are embedded directly from an external URL |
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
✅ App directory (JSON, validated)        ✅ Remote AppD, live reload, versioning
✅ Workspace persistence + Dockview        ✅ Named workspaces, server-side, shared
✅ Multi-monitor detach                    ✅ Multi-monitor, tabbed groups
✅ PrivateChannel + AppChannel            ✅ Full FDC3 2.0 channel model
✅ getAgent() Desktop Agent Discovery     ✅ getAgent() (FDC3 for the Web)
✅ Built-in conformance console           ⚠️  No in-shell self-test harness
✅ Live Command Center                    ✅ io.Insights / telemetry products
✅ Platform logging API                   ✅ Central logging / diagnostics products
❌ No native/COM app support              ✅ Native, .NET, Java, web
Free (open source)                        Commercial licence required
```

### Standards posture — "any FDC3 app just works"

A core goal is that an **unmodified third-party FDC3 app** runs here with no shell-specific
code. Two things make that true:

1. **Modern discovery** — apps find the agent via the `getAgent()` pattern (FDC3 2.1 / "FDC3
   for the Web"), not a hard dependency on `window.fdc3`. The preload exposes `window.fdc3`
   synchronously and fires `fdc3Ready`, so both the legacy global and `getAgent()` resolve.
2. **Spec-accurate surface** — `addContextListener` / `addIntentListener` return a handle that
   satisfies the existing bare-function form plus the FDC3 2.0 `Promise<Listener>` form, so
   `const l = await fdc3.addContextListener(...); l.unsubscribe();` and
   `fdc3.addContextListener(...).then((l) => l.unsubscribe())` both work as written.

The **FDC3 Conformance Console** app (`apps/fdc3-conformance`, port 4015) is a dependency-free
vanilla web app that discovers the agent via `getAgent()` and runs live PASS/FAIL checks against
`getInfo`, context listeners, broadcast, user channels, `findIntentsByContext`, App Channels and
Private Channels, plus standalone and embedded app identity — then drives the real fleet by broadcasting standard contexts. Open it from the
launcher to prove interop end to end.

The **adapter pattern** ensures apps written for this POC run on io.Connect with a
one-file bootstrap swap. See [`docs/interop-vs-custom-shell.md`](docs/interop-vs-custom-shell.md).

### Platform logging — beyond FDC3

Logging is intentionally **not** part of the FDC3 surface. Every hosted app also receives a
separate `window.platformLogs` API from the preload bridge:

```ts
await window.platformLogs.info('Order ticket opened', { ticker: 'AAPL', side: 'BUY' }, 'order-ticket');
await window.platformLogs.error('Pricing failed', err, 'rfq');

const logs = await window.platformLogs.getLogs();
const unsubscribe = window.platformLogs.onLog((entry) => console.log(entry));
```

The shell also captures browser console output automatically from every hosted `webContents`:
Angular dev-server apps, standalone Electron windows, embedded Dockview webviews, and remote
cloud apps. The **Command Center** shows a live platform log trace with level filtering, error
counts, structured payloads, and shell-controlled clear. Non-shell apps can write logs and read
their own logs; the shell/workspace windows can manage the global trace.

---

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
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
1. Start Angular dev servers for the local app fleet and the static FDC3 Conformance Console
   (ports 4001-4015)
2. Wait for them to be ready
3. Launch `electron-vite dev` — builds the main + preload processes, starts Electron
4. The **Shell Launcher** window opens automatically. Open apps from the launcher.

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

On Windows there are `start.bat` and `start.ps1` helpers that wrap `npm run dev`.

---

## The App Fleet

All apps live in `apps/` as standalone Angular 21 projects. Their interop contracts are
declared in `config/app-directory.json` and **validated at shell startup** — a bad
`url`/`devPort` combination fails fast in development with an actionable error.

| App | Port | Role | Broadcasts | Listens | Intents |
|---|---|---|---|---|---|
| `customer-search` | 4001 | CRM — pick a customer | `fdc3.contact` | — | — |
| `customer-profile` | 4002 | CRM — full profile + KYC | `fdc3.contact`, `com.demo.paymentRequest` | `fdc3.contact` | raises `StartPayment`, handles `ViewContact` |
| `portfolio-view` | 4003 | Investments — positions + P&L | `fdc3.portfolio`, `fdc3.instrument` | `fdc3.contact`, `fdc3.portfolio` | handles `ViewPortfolio` |
| `market-watch` | 4004 | Markets — live ticks | `fdc3.instrument` | `fdc3.instrument` | handles `ViewInstrument` |
| `payment-action` | 4005 | Payments — authorise an instruction | — | `com.demo.paymentRequest` | handles `StartPayment` (returns `PaymentResult`) |
| `funds-allocations` | 4011 | Buy-side — fund weight / drift / risk | `com.demo.fund` | `com.demo.order`, `com.demo.fund` | handles `ViewFund` |
| `incoming-orders` | 4012 | Buy-side — fund order blotter | `com.demo.order`, `com.demo.fund` | `com.demo.fund` | — |
| `audit-log` | 4013 | Buy-side — fund/order audit trail | — | `com.demo.order`, `com.demo.fund` | handles `OpenAudit`, `ViewFund` |
| `theme-toggle` | 4014 | Workspace — broadcasts theme | `com.demo.theme` | `com.demo.theme` | handles `ApplyTheme` |
| `fdc3-conformance` | 4015 | Diagnostics — vanilla web app, `getAgent()` discovery + live FDC3 2.0 conformance self-test | `fdc3.instrument`, `fdc3.contact` | `fdc3.instrument`, `fdc3.contact` | raises `ViewInstrument` |
| `cloud-sample` | — | Demo — externally-hosted URL via `devPort: 0` | — | — | — |

### App directory convention

- `devPort > 0` ⇒ this is a local app served during development. **Dev** loads `http://localhost:<devPort>`,
  **production** loads the `url` (a `file://…` path under the app's `dist/browser/`).
- `devPort === 0` ⇒ this is a cloud app. The `url` is loaded as-is in every environment.

The validator in `libs/app-registry` enforces this and refuses to load misconfigurations
(missing port, mismatched protocol, duplicate ports, etc.).

---

## Repository Structure

```
fdc3-desktop-poc/
├─ apps/
│  ├─ desktop-shell/         Electron app — main, preload, renderer (Dockview workspace + Interop Flow)
│  ├─ customer-search/       Angular app — broadcasts fdc3.contact
│  ├─ customer-profile/      Angular app — contact receiver + StartPayment raiser
│  ├─ portfolio-view/        Angular app — contact/portfolio receiver + instrument broadcaster
│  ├─ market-watch/          Angular app — instrument receiver + live ticks
│  ├─ payment-action/        Angular app — StartPayment intent handler
│  ├─ funds-allocations/     Angular app — fund weights / drift (AG Grid)
│  ├─ incoming-orders/       Angular app — order blotter (AG Grid)
│  ├─ audit-log/             Angular app — audit trail (AG Grid)
│  └─ theme-toggle/          Angular app — broadcasts theme
│
├─ libs/
│  ├─ fdc3-core/                  Types + InteropAdapter contract (no runtime deps)
│  ├─ interop-electron-adapter/   IPC event constants + adapter docs
│  ├─ interop-browser-adapter/    BroadcastChannel-based (browser-only mode)
│  ├─ interop-ioconnect-adapter/  io.Connect adapter stub (future)
│  ├─ app-registry/               AppRegistry + sample directory + app-directory.json validator
│  ├─ channel-engine/             ChannelManager (last-value cache, user channels)
│  ├─ intent-engine/              IntentRegistry + IntentResolver
│  ├─ workspace-engine/           LayoutStore (JSON persistence)
│  ├─ shared-domain/              Mock financial data (customers, portfolios, funds, orders, audit)
│  └─ shared-ui/                  ChannelPicker, AppHeader, StatusBadge components
│
├─ config/
│  ├─ app-directory.json          App registry — edit to add new apps (validated at load)
│  ├─ channels.json               Channel definitions
│  └─ workspace.default.json      Default Dockview layout
│
├─ docs/
│  ├─ architecture.md             Full architecture diagram + data flow
│  ├─ fdc3-model.md               FDC3 concepts explained
│  ├─ interop-vs-custom-shell.md  Comparison with io.Connect
│  └─ demo-script.md              Client-facing 15-minute walkthrough
│
└─ tools/scripts/dev.mjs          Dev orchestration script
```

---

## Demo Script (Quick Version)

1. `npm run dev` → Electron opens with the Shell launcher.
2. Open **Customer Search**, **Customer Profile**, and **Portfolio View**.
3. Join all three to the **Green** channel via the channel picker in each app header.
4. In Customer Search, click **Maria Garcia**.
5. Watch Customer Profile and Portfolio View update instantly.
6. In Customer Profile, click **💳 Start Payment**.
7. Payment Action opens, pre-filled — click **✓ Approve**. The result is returned to Customer Profile via `completeIntent`.
8. In Portfolio View, click **AAPL** → open Market Watch → AAPL highlights.
9. Open **Funds Allocations**, click a fund row → **Incoming Orders** filters to that fund → **Audit Log** shows related events.
10. Toggle theme via **Theme Toggle** — every participating app re-themes in unison.
11. Open **Command Center** to show the live activity feed, channel visualizer, route matrix, and platform log trace.
12. In the Shell, click **💾 Save Workspace** → quit → relaunch → layout, channels, and detached windows all restore.

Full script with narration: [`docs/demo-script.md`](docs/demo-script.md).

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────┐
│              Application Layer                    │
│              (Angular 21, window.fdc3)            │
│  CustomerSearch  CustomerProfile  PortfolioView   │
│  MarketWatch     PaymentAction    Funds/Orders…   │
│  ThemeToggle     CloudSample      AuditLog        │
└────────────────────┬─────────────────────────────┘
                     │  InteropAdapter interface
┌────────────────────▼─────────────────────────────┐
│        Adapter Layer (runtime-swappable)         │
│  ElectronAdapter  BrowserAdapter  IoConnectAdapter│
└────────────────────┬─────────────────────────────┘
                     │  Electron IPC (in this POC)
┌────────────────────▼─────────────────────────────┐
│        Electron Main Process                     │
│  WindowManager  ChannelManager  IntentResolver   │
│  AppRegistry    WorkspaceManager  IpcRouter      │
│  ThemeManager   FlowPolicyEnforcer               │
└──────────────────────────────────────────────────┘
                     ▲
                     │
┌────────────────────┴─────────────────────────────┐
│  Renderer (desktop-shell)                        │
│  Dockview workspace · AppLauncher · ChannelBar   │
│  Interop Flow Designer (React Flow)              │
│  WorkspaceBuilder + Detached Runtime Windows     │
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

3. In each app's `src/main.ts`, replace the preload-provided `window.fdc3` with:
   ```typescript
   import GlueDesktop from '@interopio/desktop';
   import { IoConnectInteropAdapter } from '@fdc3-poc/interop-ioconnect-adapter';

   const glue = await GlueDesktop({ appManager: 'full', channels: true });
   const adapter = new IoConnectInteropAdapter(glue);
   (window as any).fdc3 = {
     broadcast: (ctx) => adapter.broadcastContext(ctx),
     // …same surface, see libs/fdc3-core/src/contracts/interop-adapter.ts
   };
   ```

4. Remove `apps/desktop-shell/` — io.Connect hosts the windows natively.

5. App code (`CustomerSearch.tsx` equivalents in Angular) does not change.

See [`docs/interop-vs-custom-shell.md`](docs/interop-vs-custom-shell.md) for the full comparison.

---

## Roadmap

Tracked across phases — see `docs/agent-handoff/` and the project notes.

- **Phase 0 — Hygiene (in progress)**: app-directory validator, README refresh, cloud-sample fix.
- **Phase 1 — FDC3 2.0 lift**: `getInfo`, `findIntents`/`findIntentsByContext`, `PrivateChannel`, `AppChannel`, `fdc3Ready`, intent resolver dialog.
- **Phase 2 — Trader sample apps**: `order-ticket`, `order-blotter`, `chart`, `news`, `rfq-quote`.
- **Phase 3 — Polish existing apps**: streaming P&L, sparkline columns, flashing cells, `findIntentsByContext` menus, per-workflow AppChannels, compliance check.
- **Phase 4 — Shell polish**: workspace persona templates, global hotkeys, symbol palette (Cmd-K), intent resolver UI, notifications centre.
- **Phase 5 — Sellable**: real io.Connect wiring, recorded demo, GitHub Actions CI, Electron LTS upgrade, signed `.dmg`/`.exe`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 31, electron-vite 2 |
| Shell renderer | React 18 + Vite 5 (Dockview, React Flow, AG Grid React) |
| App renderer | Angular 21 (standalone components, `OnPush`, PrimeNG 21, AG Grid 35) |
| Language | TypeScript 5.7 (strict) |
| Monorepo | Nx 22 (project graph, task runner) |
| Interop protocol | FDC3 2.0-compatible custom implementation |
| Persistence | Node.js `fs` (JSON files in `userData`) |
| Styling | SCSS + PrimeNG theme tokens + per-app CSS variables |
