# Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                            │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Customer    │  │  Customer    │  │  Portfolio   │             │
│  │  Search      │  │  Profile     │  │  View        │             │
│  │  :4001       │  │  :4002       │  │  :4003       │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                  │                  │                     │
│  ┌──────────────┐  ┌──────────────┐          │                     │
│  │  Market      │  │  Payment     │          │                     │
│  │  Watch       │  │  Action      │          │                     │
│  │  :4004       │  │  :4005       │          │                     │
│  └──────┬───────┘  └──────┬───────┘          │                     │
└─────────┼──────────────────┼──────────────────┼─────────────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │  window.fdc3
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    INTEROP ABSTRACTION LAYER                        │
│                                                                     │
│   ┌───────────────────────────────────────────────────────────┐    │
│   │                    InteropAdapter                          │    │
│   │   broadcastContext() · addContextListener()               │    │
│   │   raiseIntent()      · addIntentListener()                │    │
│   │   joinChannel()      · getUserChannels()                  │    │
│   │   openApp()                                               │    │
│   └───────────────────┬───────────────────────────────────────┘    │
│                        │                                            │
│   ┌────────────────────┼────────────────────────────────────────┐  │
│   │ ElectronAdapter    │ BrowserAdapter  │ IoConnectAdapter     │  │
│   │ (IPC bridge)       │ (BroadcastCh.)  │ (stub — future)      │  │
│   └────────────────────┴─────────────────┴────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                             │  Electron IPC
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       RUNTIME LAYER (ELECTRON)                      │
│                                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │
│  │ WindowManager  │  │ ChannelManager │  │ IntentRegistry │       │
│  │                │  │                │  │ IntentResolver │       │
│  │ BrowserWindow  │  │ channel state  │  │                │       │
│  │ lifecycle      │  │ last-value     │  │                │       │
│  └────────────────┘  └────────────────┘  └────────────────┘       │
│                                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │
│  │ IpcRouter      │  │ WorkspaceMgr   │  │ AppRegistry    │       │
│  │                │  │                │  │                │       │
│  │ routes all     │  │ save/restore   │  │ loaded from    │       │
│  │ fdc3:* events  │  │ JSON on disk   │  │ app-dir.json   │       │
│  └────────────────┘  └────────────────┘  └────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

## Module Responsibilities

### libs/fdc3-core
- All TypeScript interfaces: `Fdc3Context`, `InteropAdapter`, `UserChannel`, `AppDefinition`
- Zero runtime code — pure type contracts
- No imports from any other workspace lib

### libs/interop-electron-adapter
- `IpcEvents` constant map (shared between preload and main)
- `ElectronInteropAdapter` — documents the renderer-side pattern (the preload implements it directly)

### libs/interop-browser-adapter
- `BroadcastChannelBus` — cross-tab pub/sub via Web BroadcastChannel API
- `BrowserInteropAdapter` — full in-browser implementation for dev/testing without Electron

### libs/interop-ioconnect-adapter
- `IoConnectInteropAdapter` — stub wrapping io.Connect / Interop.io `@interopio/desktop` API
- Implements `InteropAdapter` — swap this in at bootstrap; apps need zero changes

### libs/app-registry
- `AppRegistry` — in-memory map of `AppDefinition` objects
- `AppRegistryLoader` (in desktop-shell) reads from `config/app-directory.json`

### libs/channel-engine
- `ChannelManager` — tracks which `webContentsId` is on which channel
- Last-value cache: new joiners get the last broadcast context immediately

### libs/intent-engine
- `IntentRegistry` — runtime tracking of `addIntentListener()` calls per window
- `IntentResolver` — resolves live listeners first, then falls back to app directory

### libs/workspace-engine
- `LayoutStore` — JSON file persistence via Node `fs`
- `WorkspaceSnapshot` / `WindowState` — serialisable layout descriptors

### apps/desktop-shell
- **main process**: bootstraps all engines, manages BrowserWindow lifecycle
- **preload**: contextBridge bridge — all `window.fdc3` calls tunnel through IPC
- **renderer**: React launcher UI (app grid, channel selector, workspace save)

### apps/customer-search through apps/payment-action
- Standalone Vite + React apps
- Only dependency on the interop layer: `window.fdc3`
- No Electron imports, no Node.js imports
- Fully portable to browser or other desktop providers

## Security Model

```
Renderer Process         Preload Script           Main Process
(sandboxed)              (contextBridge)          (Node.js)
───────────              ───────────────          ──────────
window.fdc3.broadcast()  ipcRenderer.invoke()     ipcMain.handle()
                                                  ChannelManager
                                                  WindowManager
                                                  IntentResolver
```

- `contextIsolation: true` — renderer cannot access Node globals
- `nodeIntegration: false` — renderer cannot `require()` Node modules
- `sandbox: false` — required so preload can use `ipcRenderer`
- `setWindowOpenHandler(() => deny)` — apps cannot open new windows themselves
- `setPermissionRequestHandler` — camera/mic/notifications blocked

## Data Flow: Context Broadcast

```
Customer Search            Preload          Main/IpcRouter         Customer Profile
   .broadcast(ctx) ──────► invoke('fdc3:broadcast', ctx)
                                        ─────► channelManager.getWindowsInChannel()
                                        ─────► windowManager.sendTo(id, 'fdc3:contextUpdate', ctx)
                                                                ◄── ipcRenderer.on('fdc3:contextUpdate')
                                                               dispatchContext(ctx)
                                                           ◄── contextHandler['fdc3.contact'](ctx)
                                                             setCustomer(...)
```

## Data Flow: Intent Raise

```
Customer Profile           IpcRouter               Payment Action
   .raiseIntent(           ─────────────────────►  already open?
     'StartPayment', ctx)   intentRegistry           yes → sendTo('fdc3:intentFire', {intent, ctx})
                            .getListeners(intent)    no  → openApp('payment-action')
                                                          → wait for addIntentListener()
                                                          → sendTo('fdc3:intentFire', ...)
                                                                ◄── intentHandler['StartPayment'](ctx)
                                                              setForm(ctx)
                                                              setStatus('pending')
```

## Future Runtime Providers

To migrate from custom Electron shell to **io.Connect**:

1. Install `@interopio/desktop` SDK
2. Wire `IoConnectInteropAdapter` with the real `GlueDesktop()` instance in `src/bootstrap.ts`
3. All `window.fdc3` calls route through `IoConnectInteropAdapter` instead of IPC
4. Application code: **zero changes**

The same applies to OpenFin (implement `InteropAdapter` with `fin.me.interop`) or any other provider.
