# Production Readiness Checklist

Pre-promotion checklist for taking this POC to a regulated trading floor environment.
Items are ordered by severity. Each item includes the regulatory/industry driver.

---

## 🔴 Critical — Must fix before any production deployment

### 1. Sign and verify the IT bootstrap config
**File:** `config/fdc3-config.json`  
**Risk:** A compromised SCCM/Intune push could redirect all users to a malicious app directory URL, poisoning every trader's desktop.  
**Fix:** Sign `fdc3-config.json` with the firm's code-signing certificate at build/deploy time. On startup, verify the signature before reading any value from the file. Reject silently and fall back to hardcoded defaults on verification failure.  
**Reference:** OpenFin signed manifests, Finsemble deployment hardening.

### 2. Authenticate the FINOS Desktop Agent Bridge
**File:** `apps/desktop-shell/src/main/bridge-service.ts`, `apps/backplane-stub/src/main.ts`  
**Risk:** Any local process can connect to the bridge WebSocket and receive or inject FDC3 context (instrument data, order flow, client IDs). On a shared workstation this is a data leak vector.  
**Fix:** Implement mutual TLS on the bridge WebSocket. Issue short-lived JWT tokens per desktop agent session (signed by a firm-internal auth service). Bridge validates token on `WCP1Hello`. Revoke on session end.  
**Reference:** FINOS DAB security annex (draft), Bloomberg B-PIPE auth model.

### 3. Move workspace state out of localStorage
**Files:** `apps/desktop-shell/src/renderer/App.tsx`  
**Risk:** localStorage is renderer-accessible, unencrypted, and cleared by "Clear site data". Under MiFID II Article 25 and SEC Rule 17a-4, workspace configurations used during trading sessions are audit artifacts and must be durable and tamper-evident.  
**Fix:** Add `WORKSPACE_SAVE` / `WORKSPACE_LOAD` IPC events backed by `userData/workspace-<envId>.json` in the main process. Write on every meaningful change (debounced 500ms). Include a write timestamp and a SHA-256 hash of the payload for integrity verification.

### 4. Apply Content Security Policy to all webviews
**Files:** `apps/desktop-shell/src/main/window-manager.ts` or wherever webviews are created  
**Risk:** Each app panel loads a URL in a webview with access to `window.fdc3`. Without CSP, a compromised or malicious app can exfiltrate broadcast context (e.g. instrument symbols, order sizes, client IDs) to an external server.  
**Fix:** Set `webviewTag` CSP per partition. Allowlist `connect-src` to known app origins only. Block `eval`, inline scripts, and arbitrary `frame-src`. Enforce at the Electron `session` level via `session.setPermissionRequestHandler`.  
**Reference:** Electron security checklist items 6 and 7.

### 5. Verify app directory integrity before applying
**Files:** `apps/desktop-shell/src/main/ipc-router.ts` (`APP_DIRECTORY_FETCH_REMOTE`)  
**Risk:** The fetched `app-directory.json` is trusted blindly. A DNS hijack or MITM on an internal network could serve a manipulated directory, injecting malicious app URLs.  
**Fix:** Publish a separate `app-directory.json.sha256` at the same origin. Fetch both, verify hash before calling `mapAppDResponseToDefinitions`. If verification fails, keep the previous directory and alert the user.

---

## 🟡 High — Required for compliance sign-off

### 6. Require confirmation + countdown for environment switches
**File:** `apps/desktop-shell/src/renderer/components/Environments.tsx`  
**Risk:** A trader accidentally switching from Prod to Dev mid-session while working live orders is a catastrophic fat-finger error. Bloomberg requires a 2-step confirmation with a 10-second countdown and session warning for any environment switch.  
**Fix:** When switching away from an env marked `tier: 'production'`, show a modal: "You are leaving the PRODUCTION environment. This will disconnect live data feeds. Switch in 10s..." with a cancellable countdown. Log the action regardless.

### 7. Audit log for environment and configuration changes
**Files:** `apps/desktop-shell/src/main/environment-store.ts`, `apps/desktop-shell/src/main/bridge-settings.ts`  
**Risk:** MiFID II Article 25 requires firms to record all changes to trading system configuration, including environment switches, with timestamp, user identity, and before/after values.  
**Fix:** On every `activate()`, `update()`, `deleteProfile()`, `updateSettings()` call, append a structured entry to `userData/audit-config.jsonl`:
```json
{ "ts": 1718142000000, "user": "mblazquez", "action": "env.activate", "from": "dev", "to": "prod" }
```
Expose read-only view in the Audit Log app panel. Include in any compliance data export.

### 8. User identity in the app
**Risk:** Without a user identity, audit logs are meaningless ("someone on this machine"). Regulated platforms require SSO.  
**Fix:** Integrate with the firm's IdP (SAML/OIDC) at app launch. Store the authenticated user's identity in the main process (not renderer). Attach it to all audit log entries and IPC session tokens.

---

## 🟢 Medium — Quality / operational maturity

### 9. Stop bridge polling when app is backgrounded
**File:** `apps/desktop-shell/src/main/bridge-service.ts`  
**Risk:** The 15s poll fires even when the window is minimized or the machine is locked, generating unnecessary network traffic on a trading floor network.  
**Fix:** Use Electron's `app.on('browser-window-blur')` / `focus` events to pause/resume `pollTimer`. Also respect system sleep events via `powerMonitor`.

### 10. App directory rollback on failed env activation
**File:** `apps/desktop-shell/src/main/ipc-router.ts`  
**Risk:** If fetching a remote app directory succeeds but the apps fail to load (network drops mid-session), the user is left with a partially applied directory and no way back.  
**Fix:** Before applying a new directory, snapshot the current one. If any app fails to render within 10s of activation, offer "Rollback to previous environment" with one click.

### 11. Validate app URLs in the directory against an allowlist
**File:** `apps/desktop-shell/src/main/app-registry-loader.ts`  
**Risk:** A malicious or misconfigured app directory entry with `url: "javascript:..."` or `url: "file:///etc/passwd"` could be loaded in a webview.  
**Fix:** Before registering any `AppDefinition`, validate `url` against a scheme allowlist (`https://` for prod, `http://localhost` for dev). Reject and log any entry that fails validation.

---

## 📋 Regulatory mapping

| Item | MiFID II | SEC 17a-4 | SOC2 Type II | PCI DSS |
|------|----------|-----------|--------------|---------|
| #3 Workspace durability | Art. 25 | ✓ | CC6.1 | — |
| #6 Env switch confirmation | Art. 25 | — | CC7.2 | — |
| #7 Audit log | Art. 25, RTS 6 | ✓ | CC7.2 | 10.2 |
| #8 User identity / SSO | Art. 26 | ✓ | CC6.2 | 8.2 |
| #2 Bridge auth | — | — | CC6.6 | 6.4 |
| #4 CSP / webview isolation | — | — | CC6.6 | 6.4 |

---

*Last updated: 2026-06-11. Owner: architecture team. Review before any go-live gate.*
