# Custom Shell vs. io.Connect / Harmonix

## Conceptual Comparison

| Feature | This POC (custom Electron) | io.Connect / Interop.io |
|---------|---------------------------|-------------------------|
| FDC3 context | ✅ IPC-based, preload bridge | ✅ Native FDC3 2.0 certified |
| User channels | ✅ In-memory, 6 channels | ✅ Configurable, persisted |
| Intent routing | ✅ Registry + fallback open | ✅ Full resolver UI |
| App directory | ✅ JSON file | ✅ Remote HTTP AppD, live reload |
| Workspace persistence | ✅ JSON to userData | ✅ Server-side, shared, named |
| Window management | ✅ BrowserWindow | ✅ Tabbed groups, layouts |
| Security | ✅ contextIsolation, CSP | ✅ Enterprise-grade signing |
| Multi-monitor | ⚠️ Basic (Electron native) | ✅ First-class |
| App injection | ⚠️ URL-based only | ✅ Native, COM, .NET, web |
| Live context sharing UI | ❌ | ✅ Channel visualiser |
| Licensing | Free / custom | Commercial |
| Time to production | High | Low |

## When to Use This POC

- Proof-of-concept for stakeholders unfamiliar with FDC3
- Reference implementation when evaluating desktop providers
- Baseline when the team wants 100% control over the shell
- Environments where io.Connect / OpenFin licensing is not yet approved

## Migration Path to io.Connect

The adapter architecture ensures migration is a **bootstrap swap**, not an app rewrite:

### Step 1 — Today (this POC)

```typescript
// apps/customer-search/src/bootstrap.ts
const adapter = new ElectronInteropAdapter(window.__ipcBridge);
// window.fdc3 is provided by preload
```

### Step 2 — With io.Connect

```typescript
// apps/customer-search/src/bootstrap.ts  (replace ONLY this file)
import GlueDesktop from '@interopio/desktop';
import { IoConnectInteropAdapter } from '@fdc3-poc/interop-ioconnect-adapter';

const glue = await GlueDesktop({ /* config */ });
const adapter = new IoConnectInteropAdapter(glue);

// Expose the same window.fdc3 surface
window.fdc3 = {
  broadcast: (ctx) => adapter.broadcastContext(ctx),
  addContextListener: (type, h) => adapter.addContextListener(type, h),
  raiseIntent: (intent, ctx) => adapter.raiseIntent(intent, ctx),
  // ...
};
```

App code (`CustomerSearch.tsx`, `CustomerProfile.tsx`, etc.) never changes.

### Step 3 — Replace the Electron shell entirely

Once io.Connect Desktop hosts the apps natively:
- Remove `apps/desktop-shell/`
- Remove `libs/interop-electron-adapter/`
- Keep all app code and `libs/fdc3-core/` unchanged

## Why FDC3 Matters Here

Both io.Connect and this custom shell speak the same FDC3 protocol at the application boundary.
The value of the `InteropAdapter` abstraction is that the **apps become the asset**, not the shell.
You can demo on a custom Electron shell today and run on io.Connect in production without renegotiating
any app-level code with development teams.
