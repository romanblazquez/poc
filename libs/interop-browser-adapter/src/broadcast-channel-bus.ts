/**
 * BroadcastChannelBus — low-level pub/sub built on the Web BroadcastChannel API.
 * Works in any modern browser (including Electron renderer processes).
 * Used by BrowserInteropAdapter for cross-tab communication.
 */
import type { Fdc3Context } from '@fdc3-poc/fdc3-core';

export type BusMessage =
  | { type: 'context'; channelId: string; context: Fdc3Context }
  | { type: 'intent'; intent: string; context?: Fdc3Context };

type BusListener = (msg: BusMessage) => void;

export class BroadcastChannelBus {
  private readonly bc: BroadcastChannel;
  private readonly listeners = new Set<BusListener>();

  constructor(busName = 'fdc3-interop-bus') {
    this.bc = new BroadcastChannel(busName);
    this.bc.onmessage = (ev: MessageEvent<BusMessage>) => {
      this.listeners.forEach((l) => l(ev.data));
    };
  }

  publish(msg: BusMessage): void {
    this.bc.postMessage(msg);
  }

  subscribe(listener: BusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.bc.close();
    this.listeners.clear();
  }
}
