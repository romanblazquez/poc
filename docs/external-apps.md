# Testing External / Cloud FDC3 Apps

This shell can host **any** externally-hosted web app and inject the standard FDC3
Desktop Agent (`window.fdc3`) into it — no changes to the app required. Whether the app
then *interoperates* depends on one thing: **does the app actually call FDC3?**

| The external app is… | What happens |
|---|---|
| Built against standard FDC3 (`window.fdc3` / `@finos/fdc3` / `getAgent()`) | ✅ Interoperates with the fleet, unmodified |
| A normal web app with no FDC3 code | Renders fine, but stays silent — nothing to route |

The platform provides the agent automatically; FDC3 is a protocol both sides opt into.

---

## The drop-in slot

`config/app-directory.json` ships a ready-made entry you can point at any candidate app:

```jsonc
{
  "appId": "external-app",
  "title": "External FDC3 App (slot)",
  "url": "https://fdc3.finos.org/toolbox/fdc3-workbench/",  // ← swap this
  "devPort": 0,                                             // 0 = cloud app, load url as-is
  "icon": "🌐",
  "category": "External",
  "listensForContexts": ["fdc3.instrument", "fdc3.contact"],
  "capabilities": { "broadcasts": [], "listensTo": [], "raisesIntents": [], "handlesIntents": [] }
}
```

The default URL is the **FINOS FDC3 Workbench** — a real third-party FDC3 app you can use to
broadcast contexts and raise intents against the rest of the fleet.

---

## How to test any app in 4 steps

1. **Point the slot at your app.** Edit `external-app.url` in `config/app-directory.json`.
   - Must be `http://` or `https://` (the directory validator enforces this for `devPort: 0`).
   - You can add more slots — just copy the entry and give each a unique kebab-case `appId`.

2. **Launch and open it.** `npm run dev`, then open **🌐 External FDC3 App** from the launcher.

3. **Confirm it sees the agent.** In the app's own devtools console (right-click → Inspect on the
   panel) check:
   ```js
   window.fdc3                 // → object (always injected by this shell)
   await window.fdc3.getInfo() // → { fdc3Version: "2.1", provider: "fdc3-desktop-poc", ... }
   ```
   If `window.fdc3` is present, the agent reached the app. If the app uses `getAgent()`, that
   resolves too (we expose `window.fdc3` synchronously and fire `fdc3Ready`).

4. **Prove interop.**
   - Join the External app **and** e.g. **Market Watch** to the same user channel (Green).
   - Broadcast `fdc3.instrument` from the external app → Market Watch reacts.
   - Open the **Command Center** — if the app makes FDC3 calls, its traffic appears in the live
     activity feed and route matrix. **No traffic = the app isn't calling FDC3.**

---

## Enabling intent routing *to* an external app

Context broadcasting needs no declaration — an app just calls `addContextListener` at runtime.
But for the resolver to *target* an external app when someone raises an intent, declare the
intents it handles in its directory entry:

```jsonc
"intents": [
  { "intent": "ViewChart", "contextTypes": ["fdc3.instrument"], "appId": "external-app", "displayName": "View in External Chart" }
],
"capabilities": { "handlesIntents": ["ViewChart"], "listensTo": ["fdc3.instrument"] }
```

The external app must register the matching handler at runtime:
`await fdc3.addIntentListener('ViewChart', (ctx) => { ... })`.

---

## Caveats

- **Embedding headers.** A minority of sites use frame-busting or restrictive headers and may
  refuse to load. Most load fine in a `<webview>` (it is not an iframe). Check per app.
- **Discovery mode.** Apps that rely solely on the injected global (`window.fdc3`) or the
  `getAgent()` preload path work today. The full FDC3 "Web Connection Protocol" postMessage
  handshake (for browser-tab agents) is **not** implemented — this shell is a preload/container
  agent.
- **Identity.** `getInfo().appMetadata.appId` resolves from the directory entry the app was
  opened as, so each external app should have its own slot if you want distinct identities.
