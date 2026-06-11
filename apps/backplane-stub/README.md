# backplane-stub

A lightweight FINOS Desktop Agent Bridge stub for local development and Bridge UI testing.

## What it does

Starts a WebSocket server that the `desktop-shell` Bridge scanner will detect via its TCP probe. Use it to test the Bridge configuration UI without needing a real FINOS Backplane instance.

## Port configuration

Port is resolved in this order (highest priority first):

| Source | Example |
|---|---|
| `--port` CLI flag | `nx serve backplane-stub -- --port=4477` |
| `PORT` env var | `PORT=4476 nx serve backplane-stub` |
| Built-in default | `nx serve backplane-stub` → `4475` |

The selected port and its source are printed at startup.

## Usage

```bash
# Default port 4475 — detected by bridge auto-discovery out of the box
nx serve backplane-stub

# Custom port via environment variable
PORT=4476 nx serve backplane-stub

# Custom port via --port flag (use -- to separate Nx args from app args)
nx serve backplane-stub -- --port=4477

# Run directly with tsx (no Nx)
npx tsx apps/backplane-stub/src/main.ts --port=4477

# Run multiple instances simultaneously
nx serve backplane-stub &               # 4475
PORT=4476 nx serve backplane-stub &     # 4476
nx serve backplane-stub -- --port=4477  # 4477
```

## Validation

Invalid port values exit immediately with a clear error:

```
  ✗ Invalid port "99999" (from --port flag). Must be an integer between 1 and 65535.
```

## Bridge auto-discovery

In the `desktop-shell`, enable **Auto-Discovery** in the Bridge settings and click **Scan**. The stub will be detected on port 4475 (or whichever FINOS well-known ports you're running on: 4475, 9090, 8080).

## FINOS DAB messages simulated

| Incoming | Response |
|---|---|
| `WCP1Hello` | `WCP2LoadURL` + `BridgeInfo` |
| `WCP5ValidateAppIdentity` | `WCP6ValidateAppIdentityResponse` |
| `Heartbeat` | `HeartbeatAck` |
| anything else | `Ack` |

HTTP `GET /` returns a JSON info object with version, endpoint, and live connection count.
