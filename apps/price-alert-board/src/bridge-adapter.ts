/**
 * BridgeAdapter — the ONLY file in this app that knows about FDC3.
 *
 * This is a thin translation layer between the app's internal domain events
 * (instrument selected, price alerts) and the FINOS Desktop Agent Bridge
 * WebSocket protocol (DAB). The rest of the app is completely unaware of
 * FDC3 — it only calls broadcastInstrument() and receives onInstrumentReceived
 * callbacks, treating the bridge as an opaque pub/sub channel.
 *
 * This is the pattern for integrating a non-FDC3-native app into a bridged
 * FDC3 desktop environment without rewriting the app from scratch.
 *
 * Wire protocol used:
 *   → WCP1Hello           handshake initiation (on connect)
 *   ← WCP2LoadURL         handshake reply (ignored by this adapter)
 *   → broadcastRequest    publish fdc3.instrument context
 *   ← broadcastRequest    receive fdc3.instrument from other Desktop Agents
 */

import type { BridgeState } from './types.js';

// ── FDC3 / DAB message shapes (minimal subset) ───────────────────────────────

interface DabMessage { type: string; payload?: unknown; meta?: unknown }

interface Fdc3Instrument {
  type: 'fdc3.instrument';
  name?: string;
  id: { ticker?: string; BBG?: string; ISIN?: string; [k: string]: string | undefined };
}

interface BroadcastRequest extends DabMessage {
  type: 'broadcastRequest';
  payload: { channelId: string; context: Fdc3Instrument };
  meta: { requestGuid: string; timestamp: string; source: { appId: string; instanceId: string } };
}

// ── Adapter ───────────────────────────────────────────────────────────────────

const APP_ID = 'price-alert-board';
const INSTANCE_ID = crypto.randomUUID();
const CHANNEL_ID = 'app-channel-1';
const RECONNECT_DELAY_MS = 5_000;

export class BridgeAdapter {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly endpoint: string,
    /** Called when the app selects an instrument via the bridge (not locally). */
    private readonly onInstrumentReceived: (ticker: string, name: string) => void,
    private readonly onStateChange: (info: { state: BridgeState; error?: string }) => void,
  ) {}

  connect(): void {
    if (this.destroyed) return;
    this.clearReconnect();
    this.setState('connecting');

    try {
      const ws = new WebSocket(this.endpoint);
      this.ws = ws;

      ws.onopen = () => {
        this.setState('connected');
        // DAB handshake: identify ourselves to the bridge.
        this.send({
          type: 'WCP1Hello',
          payload: {
            channelSelectorUrl: '',
            fdc3Version: '2.1',
            supportedFDC3Versions: ['2.0', '2.1'],
            identityUrl: APP_ID,
            actualUrl: window.location.href,
          },
        });
      };

      ws.onmessage = (ev) => {
        try {
          this.handleMessage(JSON.parse(ev.data as string) as DabMessage);
        } catch { /* ignore malformed */ }
      };

      ws.onerror = () => {
        this.setState('error', 'WebSocket error — check that the bridge is running');
      };

      ws.onclose = () => {
        if (!this.destroyed) {
          this.setState('disconnected');
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.setState('error', (err as Error).message);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.destroyed = true;
    this.clearReconnect();
    this.ws?.close();
    this.ws = null;
  }

  /** Translate an internal "instrument selected" event into an fdc3.instrument broadcast. */
  broadcastInstrument(ticker: string, name: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg: BroadcastRequest = {
      type: 'broadcastRequest',
      payload: {
        channelId: CHANNEL_ID,
        context: {
          type: 'fdc3.instrument',
          name,
          id: { ticker },
        },
      },
      meta: {
        requestGuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        source: { appId: APP_ID, instanceId: INSTANCE_ID },
      },
    };
    this.send(msg);
  }

  private handleMessage(msg: DabMessage): void {
    // Only care about fdc3.instrument contexts from other apps.
    if (msg.type !== 'broadcastRequest') return;
    const req = msg as BroadcastRequest;
    if (req.payload?.context?.type !== 'fdc3.instrument') return;

    // Ignore our own broadcasts looped back by the bridge.
    const meta = req.meta as { source?: { appId?: string; instanceId?: string } } | undefined;
    if (meta?.source?.instanceId === INSTANCE_ID) return;

    const { ticker } = req.payload.context.id;
    const name = req.payload.context.name ?? ticker ?? '';
    if (ticker) this.onInstrumentReceived(ticker, name);
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private setState(state: BridgeState, error?: string): void {
    this.onStateChange({ state, error });
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
