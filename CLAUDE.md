# FDC3 Desktop POC — Claude Context

## What This Is

Enterprise-grade **FDC3 2.0 interoperability desktop shell** built on Electron + Nx monorepo. Think Bloomberg/Refinitiv-style trading desktop: a single Electron chrome that orchestrates 16 micro-frontend apps (Angular/React/Vite), all communicating via standardised FDC3 contexts and intents over Electron IPC. The goal is to demonstrate to capital markets clients how FDC3-compliant apps can interoperate regardless of which vendor built them.

## Business Domain — Capital Markets

### Trading Firm Roles (RBAC)
These map to real trading floor personas. When working on app visibility, workspace layouts, or RBAC, reason about what each role actually needs on the desk:

| Role | Who they are | Core apps |
|------|-------------|-----------|
| **Trader** | Flow trader, sales trader, algo trader | market-watch, order-ticket, order-blotter, rfq-quote, chart, cloud-trader, portfolio-view |
| **Sales** | Relationship Manager, coverage | customer-search, customer-profile, portfolio-view, market-watch, chart, news, rfq-quote |
| **PM** | Portfolio Manager, Fund Manager | portfolio-view, market-watch, chart, funds-allocations, incoming-orders, order-blotter |
| **Compliance** | Compliance officer, risk officer | audit-log, order-blotter, market-watch, portfolio-view, compliance-check |
| **Ops** | Middle office, settlement, ops | payment-action, order-blotter, incoming-orders, audit-log, funds-allocations, customer-search |
| **Risk** | Risk management, VAR/PnL | market-watch, portfolio-view, order-blotter, chart, audit-log |
| **Admin** | IT administrator | All apps + shell management tools |
| **ReadOnly** | Auditor, board-level view | Read-only subset, no intent raising |

### FDC3 Context Types in Use
- `fdc3.contact` — customer/counterparty identity
- `fdc3.instrument` — financial instrument (ISIN, FIGI, Bloomberg ticker)
- `fdc3.portfolio` — portfolio/account context
- `fdc3.order` — order details
- `com.demo.theme` — shell theming

### Key FDC3 Intents
`ViewChart`, `ViewContact`, `ViewPortfolio`, `ViewOrders`, `CreateOrder`, `SendOrder`, `ViewInstrument`, `StartChat`, `ViewNews`, `Allocate`, `StartPayment`, `ViewInstrument`

**Business rule**: `SendOrder` is blocked for Compliance and ReadOnly roles — no compliance officer can accidentally submit an order.

## Architecture

```
Electron Shell (desktop-shell)
├── Main Process       ← Node.js — IpcRouter, WindowManager, AppRegistry, RBAC
│   ├── ipc-router.ts  ← All FDC3 routing; context/intent/channel dispatch
│   ├── window-manager.ts ← BrowserWindow lifecycle per app
│   ├── rbac-store.ts  ← Role/user permissions (userData/rbac.json)
│   ├── environment-store.ts ← Dev/UAT/Prod environment switching
│   ├── remote-directory.ts ← HTTP poll for remote app-directory.json (ETag, cache)
│   ├── app-registry-loader.ts ← Loads/validates app-directory.json
│   └── manager-settings.ts ← currentRole, directoryUrl, refresh interval
├── Preload (preload.ts) ← Exposes window.fdc3 + window.electronShell APIs
└── Renderer (React)   ← Shell chrome: TopBar, WorkspaceBuilder, AppLauncher, etc.
    ├── components/Manager.tsx ← Admin console (RBAC, env, directory)
    ├── components/AppLauncher.tsx ← Filtered by role
    ├── components/RbacPanel.tsx ← Role/user editor
    └── copilot/        ← "Ask the Desktop" AI command bar (Nexus Copilot)

Micro-frontend Apps (each is a separate Nx project, independent port)
├── Angular apps (most): customer-search :4001, customer-profile :4002, ...
└── React/Vite apps: cloud-trader, rfq-quote, ...
```

### Port Map
| App | Port | Domain |
|-----|------|--------|
| customer-search | 4001 | CRM |
| customer-profile | 4002 | CRM |
| portfolio-view | 4003 | Investments |
| market-watch | 4004 | Markets |
| payment-action | 4005 | Payments |
| order-ticket | 4006 | Trading |
| order-blotter | 4007 | Trading |
| chart | 4008 | Markets |
| news | 4009 | Markets |
| rfq-quote | 4010 | Trading |
| funds-allocations | 4011 | Funds |
| incoming-orders | 4012 | Funds |
| audit-log | 4013 | Funds |
| theme-toggle | 4014 | Workspace |
| fdc3-conformance | 4015 | Diagnostics |
| cloud-trader | 4016 | Trading |
| app-directory-server | 4476 | Distribution |

## Monorepo Structure (Nx)

```
apps/              ← 16 micro-frontend apps + desktop-shell
libs/
├── fdc3-core/     ← Pure TypeScript types — no runtime code, no deps on other libs
├── app-registry/  ← validateAppDirectory(), SAMPLE_APP_DIRECTORY, AppDirectoryFile type
├── channel-engine/ ← AppChannelStore, PrivateChannelStore
├── intent-engine/  ← IntentResolver, IntentRegistry
├── interop-angular/ ← Angular service injecting window.fdc3
├── interop-electron-adapter/ ← IpcEvents constant map
├── interop-browser-adapter/ ← BroadcastChannel-based adapter (no Electron)
├── interop-ioconnect-adapter/ ← Stub for io.Connect/Interop.io
├── shared-domain/  ← Shared Angular/React components
└── shared-ui/      ← UI primitives
config/
├── app-directory.json       ← Default app directory (all apps, dev ports)
├── app-directory-uat.json   ← UAT environment app directory
├── app-directory-prod.json  ← Production app directory
├── fdc3-config.json         ← Bootstrap config (envs, bridge settings)
├── workspace.default.json   ← Default workspace layout
├── channels.json            ← FDC3 channel definitions
└── roles/                   ← Per-role workspace + app profiles
    ├── Trader.json
    ├── Sales.json
    ├── PM.json
    ├── Compliance.json
    ├── Ops.json
    ├── Risk.json
    ├── Admin.json
    └── ReadOnly.json
tools/scripts/
├── dev.mjs                    ← Start all app servers + Electron
├── distribute.mjs             ← Admin CLI: push versions, assign roles, manage registry
└── app-directory-server.mjs   ← HTTP server: serves role-filtered directories + SSE push
```

## Key Patterns & Conventions

### Adding a new app
1. `nx generate @nx/angular:app <name>` or `nx generate @nx/vite:app <name>`
2. Add to `config/app-directory.json` with `devPort`, `category`, `capabilities`
3. Add `nx serve <name>` to `package.json` `dev:apps` script
4. Add `AppDefinition.roles` array if the app should be role-gated
5. Wire FDC3 via `@fdc3-poc/interop-angular` (Angular) or `window.fdc3` (React)

### RBAC enforcement
- `AppDefinition.roles?: string[]` — UI-level visibility gating (AppLauncher filters)
- `RbacConfig.roles[role].blockedApps` — stronger block (IpcRouter enforces)
- `RbacConfig.roles[role].blockedIntentRaise` — prevents raising named intents
- **Intent routing and context broadcast are NOT gated by role** — RBAC is a UI surface, not an interop boundary (by design)

### App Directory loading priority
1. `userData/app-directory-<envId>.json` — user-edited version
2. `config/app-directory-<envId>.json` — IT-managed baseline
3. Bundled `SAMPLE_APP_DIRECTORY` from `@fdc3-poc/app-registry` — fallback

### Environment switching (Dev / UAT / Prod)
- Managed by `EnvironmentStore` + IPC channel `ENV_SWITCH`
- Each env has its own app directory with prod URLs instead of `localhost:*`
- Switch triggers a full app reload; no partial state migration

### Remote directory polling
- `RemoteDirectoryClient` does conditional GET (ETag, 304 handling)
- Configured via Manager Console → `directoryUrl` field in `manager-settings.json`
- For live push: point `directoryUrl` to `http://localhost:4476/directory?role=<role>&env=<env>`
- The app-directory-server notifies clients via SSE at `/events`

### TypeScript
- ~68 pre-existing TS errors in libs (known, tolerated in POC)
- `tsconfig.base.json` is the root; per-project configs extend it
- `fdc3-core` has zero runtime code — never import from it in the browser bundle's runtime path unless tree-shaken

## Distribution System

### How role-based distribution works

```
config/roles/<Role>.json         ← Profile per trading role (app list, workspace template, RBAC)
config/distribution/manifest.json ← Version manifest (semver per role, per env)
tools/scripts/distribute.mjs    ← Admin CLI
tools/scripts/app-directory-server.mjs ← HTTP + SSE server at :4476
```

**Admin workflow:**
```bash
# Start the distribution server
node tools/scripts/app-directory-server.mjs

# Push a new version to all roles
node tools/scripts/distribute.mjs push --version 1.2.0

# Push a role-specific update
node tools/scripts/distribute.mjs push --role Trader --version 1.2.1

# Configure which apps a role sees
node tools/scripts/distribute.mjs apps --role Compliance --set audit-log,order-blotter,market-watch

# Assign a user to a role
node tools/scripts/distribute.mjs assign --user alice --role Trader

# Show current state
node tools/scripts/distribute.mjs list
node tools/scripts/distribute.mjs status
```

**Client (Electron) workflow:**
- Configure Manager Console → Directory URL: `http://localhost:4476/directory`
- Shell polls for updates; when a new version is available, a toast notification appears
- User clicks "Update Available" → shell hot-reloads the app directory (no restart needed)

### SSE events pushed by the server
```json
{ "type": "version", "version": "1.2.0", "role": "*", "env": "prod", "changedAt": 1234567890 }
{ "type": "directory", "role": "Trader", "env": "prod", "appCount": 8 }
```

## Dev Workflow

```bash
# Full dev stack (all apps + Electron shell)
npm run dev

# Shell only (if apps already running)
npm run dev:shell

# Build everything
npm run build

# TypeScript check
npm run typecheck

# Distribution server (separate terminal)
node tools/scripts/app-directory-server.mjs --port 4476

# Admin: push new version
node tools/scripts/distribute.mjs push --version 1.0.0 --env prod
```

## What NOT to Do

- Never import `@fdc3-poc/fdc3-core` types in a way that pulls runtime code into app bundles
- Never add `sendOrder` or financial transaction logic to the POC apps — they are demos
- Never write RBAC enforcement directly into individual app components — it belongs in the shell's RBAC layer
- Never break the `AppDefinition` shape without updating `validateAppDirectory` in `app-registry`
- Never add Electron-specific imports into `libs/` — libs must be Electron-agnostic
- Do not add `--no-verify` to git commits
