import { WebSocket } from 'ws';
import { hostname } from 'os';
import { randomUUID } from 'crypto';
import type { BridgeConnectionInfo, Fdc3Context } from '@fdc3-poc/fdc3-core';

/**
 * BridgeTransport — live WebSocket relay to a local FDC3 bridge service.
 *
 * Speaks a DAB-shaped envelope (the message layout of the experimental FDC3
 * Desktop Agent Bridging protocol, without claiming certification):
 *
 *   bridge → agent   { type: 'hello', payload: {...} }
 *   agent  → bridge  { type: 'handshake', payload: { implementationMetadata }, meta }
 *   bridge → agents  { type: 'connectedAgentsUpdate', payload: { connectedAgents: [names] } }
 *   both directions  { type: 'broadcastRequest', payload: { channelId, context }, meta: { source } }
 *
 * Echo suppression: every outbound message carries this agent's name in
 * meta.source.desktopAgent; inbound messages from ourselves are dropped.
 * Reconnection is owned by BridgeService (it re-calls connect on its scan
 * cadence), so the transport itself stays a dumb single-shot connection.
 */

export interface BridgeInboundBroadcast {
  context: Fdc3Context;
  channelId: string | null;
  sourceAgent: string;
}

interface BridgeEnvelope {
  type: string;
  payload?: Record<string, unknown>;
  meta?: { requestUuid?: string; timestamp?: string; source?: { desktopAgent?: string } };
}

export class BridgeTransport {
  private ws: WebSocket | null = null;
  private state: BridgeConnectionInfo['state'] = 'disconnected';
  private endpoint: string | null = null;
  private remoteAgents: string[] = [];
  private messagesIn = 0;
  private messagesOut = 0;

  readonly agentName = `fdc3-desktop-poc@${hostname()}`;

  constructor(
    private readonly onBroadcast: (inbound: BridgeInboundBroadcast) => void,
    private readonly onStateChange: () => void,
  ) {}

  getInfo(): BridgeConnectionInfo {
    return {
      state: this.state,
      endpoint: this.endpoint,
      agentName: this.agentName,
      remoteAgents: [...this.remoteAgents],
      messagesIn: this.messagesIn,
      messagesOut: this.messagesOut,
    };
  }

  isConnectedTo(endpoint: string): boolean {
    return this.state !== 'disconnected' && this.endpoint === endpoint;
  }

  connect(endpoint: string): void {
    if (this.isConnectedTo(endpoint)) return;
    this.disconnect();

    this.endpoint = endpoint;
    this.state = 'connecting';
    this.onStateChange();

    let ws: WebSocket;
    try {
      ws = new WebSocket(endpoint);
    } catch (error) {
      console.warn(`[bridge-transport] cannot open ${endpoint}:`, (error as Error).message);
      this.reset();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      this.send({
        type: 'handshake',
        payload: {
          implementationMetadata: {
            fdc3Version: '2.0',
            provider: 'fdc3-desktop-poc',
            desktopAgent: this.agentName,
          },
        },
      });
      this.state = 'connected';
      this.messagesIn = 0;
      this.messagesOut = 0;
      this.onStateChange();
      console.log(`[bridge-transport] connected to ${endpoint} as ${this.agentName}`);
    });

    ws.on('message', (raw) => this.handleMessage(raw.toString()));

    ws.on('close', () => {
      if (this.ws !== ws) return; // superseded by a newer connection
      console.log('[bridge-transport] connection closed');
      this.reset();
    });

    ws.on('error', (error) => {
      if (this.ws !== ws) return;
      console.warn('[bridge-transport] socket error:', error.message);
      // 'close' follows and performs the reset.
    });
  }

  disconnect(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      try { ws.close(); } catch { /* already dying */ }
    }
    if (this.state !== 'disconnected') this.reset();
  }

  /** Relay a local context broadcast out to the bridge. */
  forwardBroadcast(context: Fdc3Context, channelId: string | null): void {
    if (this.state !== 'connected') return;
    this.send({
      type: 'broadcastRequest',
      payload: { channelId, context },
    });
    this.messagesOut += 1;
    this.onStateChange();
  }

  private send(envelope: BridgeEnvelope): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      ...envelope,
      meta: {
        requestUuid: randomUUID(),
        timestamp: new Date().toISOString(),
        source: { desktopAgent: this.agentName },
        ...envelope.meta,
      },
    }));
  }

  private handleMessage(raw: string): void {
    let envelope: BridgeEnvelope;
    try {
      envelope = JSON.parse(raw) as BridgeEnvelope;
    } catch {
      console.warn('[bridge-transport] non-JSON message ignored');
      return;
    }

    switch (envelope.type) {
      case 'hello':
        // Some bridges greet before accepting the handshake; ours was already
        // sent on open, so a hello needs no reply.
        return;

      case 'connectedAgentsUpdate': {
        const agents = envelope.payload?.connectedAgents;
        if (Array.isArray(agents)) {
          this.remoteAgents = agents
            .map((agent) => String(agent))
            .filter((name) => name !== this.agentName);
          this.onStateChange();
        }
        return;
      }

      case 'broadcastRequest': {
        const sourceAgent = envelope.meta?.source?.desktopAgent ?? 'unknown';
        if (sourceAgent === this.agentName) return; // our own echo
        const context = envelope.payload?.context as Fdc3Context | undefined;
        if (!context || typeof context.type !== 'string') return;
        const channelId = typeof envelope.payload?.channelId === 'string'
          ? envelope.payload.channelId
          : null;
        this.messagesIn += 1;
        this.onBroadcast({ context, channelId, sourceAgent });
        this.onStateChange();
        return;
      }

      default:
        // Unknown message types are tolerated for forward compatibility.
        return;
    }
  }

  private reset(): void {
    this.ws = null;
    this.state = 'disconnected';
    this.remoteAgents = [];
    this.onStateChange();
  }
}
