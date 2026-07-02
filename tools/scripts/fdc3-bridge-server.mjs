#!/usr/bin/env node
/**
 * fdc3-bridge-server — minimal local FDC3 bridge for demos and testing.
 *
 * Relays DAB-shaped broadcastRequest messages between every connected desktop
 * agent. Pairs with the shell's BridgeTransport: start this server, enable the
 * bridge in the shell's Bridge panel, and the relay attaches automatically.
 *
 *   node tools/scripts/fdc3-bridge-server.mjs [--port 4475]
 *
 * Protocol (subset of the experimental FDC3 Desktop Agent Bridging envelope):
 *   server → client  { type: 'hello', payload: { desktopAgentBridgeVersion } }
 *   client → server  { type: 'handshake', payload: { implementationMetadata } }
 *   server → clients { type: 'connectedAgentsUpdate', payload: { connectedAgents } }
 *   client ↔ clients { type: 'broadcastRequest', payload: { channelId, context } }
 */

import { WebSocketServer, WebSocket } from 'ws';

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const PORT = portFlag >= 0 ? Number(args[portFlag + 1]) : 4475;

/** ws → agent name (from handshake) */
const agents = new Map();

const wss = new WebSocketServer({ port: PORT });

function log(...parts) {
  console.log(`[bridge ${new Date().toISOString().slice(11, 19)}]`, ...parts);
}

function agentName(ws) {
  return agents.get(ws) ?? 'unidentified-agent';
}

function broadcastConnectedAgents() {
  const connectedAgents = [...agents.values()];
  const message = JSON.stringify({
    type: 'connectedAgentsUpdate',
    payload: { connectedAgents },
    meta: { timestamp: new Date().toISOString() },
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

wss.on('connection', (ws, req) => {
  log(`connection from ${req.socket.remoteAddress}`);
  ws.send(JSON.stringify({
    type: 'hello',
    payload: { desktopAgentBridgeVersion: '1.0-poc', supportedFDC3Versions: ['2.0'] },
    meta: { timestamp: new Date().toISOString() },
  }));

  ws.on('message', (raw) => {
    let envelope;
    try {
      envelope = JSON.parse(raw.toString());
    } catch {
      log('ignoring non-JSON message');
      return;
    }

    if (envelope.type === 'handshake') {
      const name = envelope.payload?.implementationMetadata?.desktopAgent
        ?? envelope.meta?.source?.desktopAgent
        ?? `agent-${Math.random().toString(36).slice(2, 8)}`;
      agents.set(ws, name);
      log(`handshake: ${name} (${agents.size} agent${agents.size === 1 ? '' : 's'} connected)`);
      broadcastConnectedAgents();
      return;
    }

    if (envelope.type === 'broadcastRequest') {
      const contextType = envelope.payload?.context?.type ?? '?';
      const channelId = envelope.payload?.channelId ?? null;
      log(`relay ${contextType}${channelId ? ` on ${channelId}` : ''} from ${agentName(ws)}`);
      const message = JSON.stringify(envelope);
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) client.send(message);
      }
      return;
    }

    log(`ignoring message type "${envelope.type}" from ${agentName(ws)}`);
  });

  ws.on('close', () => {
    const name = agentName(ws);
    agents.delete(ws);
    log(`disconnected: ${name} (${agents.size} remaining)`);
    broadcastConnectedAgents();
  });

  ws.on('error', (error) => log(`socket error from ${agentName(ws)}: ${error.message}`));
});

log(`FDC3 bridge relay listening on ws://localhost:${PORT}`);
log('agents connecting here will exchange context broadcasts');
