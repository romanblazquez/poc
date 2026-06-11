/**
 * FINOS Backplane Stub
 *
 * A lightweight WebSocket server that simulates a FINOS Desktop Agent Bridge
 * endpoint for local development and Bridge UI testing.
 *
 * Detection: the desktop-shell BridgeService uses a raw TCP probe (net.Socket)
 * to detect candidates — any process listening on the target port is enough.
 * This stub also handles the WebSocket upgrade so you can interact with it.
 *
 * Usage:
 *   PORT=4475 nx serve backplane-stub
 *   PORT=9090 nx serve backplane-stub   ← second well-known port
 *
 * FINOS DAB (Desktop Agent Bridge) message types simulated:
 *   WCP1Hello      → server responds with WCP2LoadURL (noop URL since we're a stub)
 *   Heartbeat      → echoed back
 *   Everything else → logged and acknowledged
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env['PORT'] ?? 4475);
const HOST = process.env['HOST'] ?? '127.0.0.1';

// ── FINOS DAB message shapes (minimal subset) ──────────────────────────────

interface DabMessage {
  type: string;
  meta?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

// WCP1Hello is the first message a Desktop Agent sends when connecting.
interface WCP1Hello extends DabMessage {
  type: 'WCP1Hello';
  payload: {
    channelSelectorUrl: string;
    fdc3Version: string;
    supportedFDC3Versions?: string[];
    identityUrl?: string;
    actualUrl?: string;
    channelSelectorDeGelivery?: boolean;
  };
}

// WCP2LoadURL is the bridge's reply — normally it sends a URL to load.
// As a stub we reply immediately with a no-op sentinel.
interface WCP2LoadURL extends DabMessage {
  type: 'WCP2LoadURL';
  payload: { channelSelectorUrl: string };
}

// WCP5ValidateAppIdentity is sent by the bridge to verify an app.
interface WCP5ValidateAppIdentity extends DabMessage {
  type: 'WCP5ValidateAppIdentity';
  payload: {
    appId: string;
    instanceId?: string;
    instanceUuid?: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STUB_VERSION = '0.1.0';
const SUPPORTED_FDC3 = ['2.0', '2.1'];
let connectionCount = 0;

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function log(connId: number, direction: '←' | '→' | ' ', msg: string): void {
  const prefix = direction === ' ' ? '  ' : direction;
  console.log(`[${timestamp()}] #${connId.toString().padStart(3, '0')} ${prefix} ${msg}`);
}

function send(ws: WebSocket, connId: number, msg: DabMessage): void {
  const json = JSON.stringify(msg);
  ws.send(json);
  log(connId, '→', `${msg.type} ${json.length > 120 ? json.slice(0, 120) + '…' : json}`);
}

// ── Message handlers ───────────────────────────────────────────────────────

function handleHello(ws: WebSocket, connId: number, _msg: WCP1Hello): void {
  // Reply with WCP2LoadURL — in production this points to a channel selector UI.
  // As a stub we send a placeholder so the DA handshake can complete.
  const reply: WCP2LoadURL = {
    type: 'WCP2LoadURL',
    payload: {
      channelSelectorUrl: `http://${HOST}:${PORT}/channel-selector`,
    },
  };
  send(ws, connId, reply);

  // Also send a bridge-info ping (non-standard, for UI testing convenience).
  send(ws, connId, {
    type: 'BridgeInfo',
    payload: {
      stub: true,
      version: STUB_VERSION,
      supportedFDC3Versions: SUPPORTED_FDC3,
      endpoint: `ws://${HOST}:${PORT}`,
    },
  });
}

function handleValidateApp(ws: WebSocket, connId: number, msg: WCP5ValidateAppIdentity): void {
  // Stub always accepts any app identity.
  send(ws, connId, {
    type: 'WCP6ValidateAppIdentityResponse',
    payload: {
      appId: msg.payload.appId,
      instanceId: msg.payload.instanceId ?? `stub-instance-${Date.now()}`,
      instanceUuid: msg.payload.instanceUuid ?? crypto.randomUUID(),
    },
  });
}

function handleHeartbeat(ws: WebSocket, connId: number, msg: DabMessage): void {
  send(ws, connId, { type: 'HeartbeatAck', meta: msg.meta });
}

function handleMessage(ws: WebSocket, connId: number, raw: string): void {
  let msg: DabMessage;
  try {
    msg = JSON.parse(raw) as DabMessage;
  } catch {
    log(connId, '←', `[unparseable] ${raw.slice(0, 80)}`);
    return;
  }

  log(connId, '←', `${msg.type} ${raw.length > 120 ? raw.slice(0, 120) + '…' : raw}`);

  switch (msg.type) {
    case 'WCP1Hello':
      handleHello(ws, connId, msg as WCP1Hello);
      break;
    case 'WCP5ValidateAppIdentity':
      handleValidateApp(ws, connId, msg as WCP5ValidateAppIdentity);
      break;
    case 'Heartbeat':
      handleHeartbeat(ws, connId, msg);
      break;
    default:
      // Acknowledge unknown messages so the DA doesn't time out.
      send(ws, connId, { type: 'Ack', payload: { receivedType: msg.type } });
  }
}

// ── HTTP server (serves stub info page + handles WS upgrade) ──────────────

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify(
      {
        name: 'FINOS Backplane Stub',
        version: STUB_VERSION,
        type: 'finos-backplane-stub',
        endpoint: `ws://${HOST}:${PORT}`,
        supportedFDC3Versions: SUPPORTED_FDC3,
        connections: connectionCount,
        note: 'This is a development stub. Not for production use.',
      },
      null,
      2,
    ),
  );
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const id = ++connectionCount;
  const origin = req.socket.remoteAddress ?? 'unknown';
  log(id, ' ', `connected from ${origin}`);

  ws.on('message', (data) => {
    handleMessage(ws, id, data.toString());
  });

  ws.on('close', (code, reason) => {
    log(id, ' ', `disconnected (${code}${reason.length ? ` ${reason.toString()}` : ''})`);
  });

  ws.on('error', (err) => {
    log(id, ' ', `error: ${err.message}`);
  });

  // Send a welcome banner on connect so the Bridge UI can show something immediately.
  send(ws, id, {
    type: 'WelcomeBanner',
    payload: {
      message: 'FINOS Backplane Stub ready. Send WCP1Hello to begin handshake.',
      endpoint: `ws://${HOST}:${PORT}`,
      stub: true,
    },
  });
});

// ── Startup ────────────────────────────────────────────────────────────────

httpServer.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║         FINOS Backplane Stub  v' + STUB_VERSION.padEnd(20) + '║');
  console.log('  ╠═══════════════════════════════════════════════════╣');
  console.log(`  ║  WebSocket  ws://${HOST}:${PORT}`.padEnd(53) + '║');
  console.log(`  ║  HTTP info  http://${HOST}:${PORT}`.padEnd(53) + '║');
  console.log('  ╠═══════════════════════════════════════════════════╣');
  console.log('  ║  Bridge scanner: enable Auto-Discovery in shell   ║');
  console.log('  ║  and click Scan — this stub will be detected.     ║');
  console.log('  ╚═══════════════════════════════════════════════════╝');
  console.log('');
});

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${PORT} is already in use. Try: PORT=9090 nx serve backplane-stub\n`);
  } else {
    console.error(`\n  ✗ Server error: ${err.message}\n`);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\n  Shutting down backplane-stub…');
  wss.close(() => httpServer.close(() => process.exit(0)));
});
