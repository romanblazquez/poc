# FDC3 Model

## What is FDC3?

The **Financial Desktop Connectivity and Collaboration Consortium (FDC3)** standard (managed by FINOS)
defines a set of open APIs for application interoperability on financial desktops. This POC implements
the core FDC3 2.0 concepts without taking a dependency on the FDC3 npm packages, keeping the adapter
layer clean and portable.

## Core Concepts Implemented

### 1. Context Objects

A context is a plain JSON payload with a `type` field:

```json
{
  "type": "fdc3.contact",
  "name": "Maria Garcia",
  "id": {
    "customerId": "CUST-1001",
    "email": "maria.garcia@example.com"
  }
}
```

Standard types used in this POC:

| Type                       | Description                         |
|----------------------------|-------------------------------------|
| `fdc3.contact`             | A customer / person                 |
| `fdc3.instrument`          | A financial instrument (stock, etc.)|
| `fdc3.portfolio`           | A collection of positions           |
| `fdc3.position`            | A single holding                    |
| `com.demo.paymentRequest`  | Custom: a payment instruction       |

### 2. User Channels

User channels are the "coloured strips" made famous by Bloomberg. Each channel has an ID and a colour:

```
channel-1  Red      #e84040
channel-2  Orange   #e87040
channel-3  Yellow   #e8d840
channel-4  Green    #40c080
channel-5  Blue     #4080e8
channel-6  Purple   #9040e8
```

Apps join a channel with `window.fdc3.joinUserChannel('channel-4')`.
Only apps on the same channel receive each other's `broadcast()` calls.
The **last-value cache** means joining an occupied channel delivers the most recent context immediately.

### 3. Intent Routing

Intents are named actions that an app can raise, which another app handles:

```typescript
// Raise side (Customer Profile)
await window.fdc3.raiseIntent('StartPayment', {
  type: 'com.demo.paymentRequest',
  customerId: 'CUST-1001',
  amount: 1250,
  currency: 'EUR',
});

// Handle side (Payment Action)
window.fdc3.addIntentListener('StartPayment', (ctx) => {
  setForm(ctx);
  setStatus('pending');
});
```

Intent resolution priority:
1. Live registered listeners (`addIntentListener()` calls in open windows)
2. App directory entry — open the app, wait for it to register, then deliver

### 4. App Directory

The App Directory is a JSON config file that describes all available applications.
In FDC3 terms this is the "AppD" (Application Directory).

```json
{
  "appId": "payment-action",
  "intents": [{ "intent": "StartPayment", "contextTypes": ["com.demo.paymentRequest"] }]
}
```

### 5. `window.fdc3` API Surface

| Method | Description |
|--------|-------------|
| `broadcast(context)` | Broadcast context on current channel |
| `addContextListener(type, handler)` | Subscribe to context updates |
| `raiseIntent(intent, context)` | Route intent to handler app |
| `addIntentListener(intent, handler)` | Register as intent handler |
| `joinUserChannel(channelId)` | Join a user channel |
| `leaveCurrentChannel()` | Leave current channel |
| `getCurrentChannel()` | Get current channel |
| `getUserChannels()` | List all channels |
| `open({ appId }, context?)` | Open an app |

All methods return Promises. All calls are serialised through the preload → IPC bridge.

## What This POC Does NOT Implement

- FDC3 Private Channels (point-to-point, non-user channels)
- Intent Resolver UI (dialog for choosing when multiple apps can handle an intent)
- System Channels (App Channel API)
- `getOrCreateChannel()`
- Remote App Directory (HTTP)
- Agent bridging (cross-platform FDC3 2.0 Desktop Agent Bridge)

These are all well-defined in the FDC3 2.0 specification and can be added incrementally.
