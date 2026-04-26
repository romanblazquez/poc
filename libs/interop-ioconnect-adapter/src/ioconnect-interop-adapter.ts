/**
 * IoConnectInteropAdapter — wraps io.Connect / Interop.io's JavaScript API
 * behind the common InteropAdapter contract.
 *
 * STATUS: STUB — not connected to a real io.Connect instance.
 *
 * To wire this up for real:
 *   1. Install @interopio/browser or @interopio/desktop (contact Interop.io for licence).
 *   2. Replace the TODO comments with real io.Connect API calls.
 *   3. The consuming app code does NOT need to change — only swap the adapter at bootstrap.
 *
 * Reference: https://docs.interop.io/desktop/developers/javascript/fdc3/
 */

import type {
  Fdc3Context,
  IntentResolution,
  UserChannel,
  InteropAdapter,
  Unsubscribe,
} from '@fdc3-poc/fdc3-core';

/**
 * Minimal shape of the io.Connect / @interopio/desktop API surface we need.
 * Declared here so this module compiles without the real SDK installed.
 */
interface IoConnectDesktop {
  // TODO: replace with real @interopio/desktop type imports once licensed
  interop: {
    subscribe(contextType: string, handler: (ctx: unknown) => void): { unsubscribe(): void };
    publish(context: unknown): Promise<void>;
    invoke(method: string, args: unknown): Promise<{ returned: unknown }>;
    register(method: string, handler: (args: unknown) => unknown): Promise<void>;
  };
  channels: {
    join(channelId: string): Promise<void>;
    leave(): Promise<void>;
    current(): { name: string; meta: { color: string } } | undefined;
    list(): Array<{ name: string; meta: { color: string } }>;
    subscribe(handler: (data: unknown, channelId: string) => void): { unsubscribe(): void };
    publish(data: unknown): Promise<void>;
  };
  appManager: {
    open(appId: string, context?: unknown): Promise<unknown>;
  };
}

export class IoConnectInteropAdapter implements InteropAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly glue: IoConnectDesktop;

  constructor(glueInstance: unknown) {
    // In real usage: pass the result of GlueDesktop() initialisation here
    this.glue = glueInstance as IoConnectDesktop;
  }

  async broadcastContext(context: Fdc3Context): Promise<void> {
    // TODO: await this.glue.channels.publish(context);
    await this.glue.interop.publish(context);
  }

  addContextListener<T extends Fdc3Context>(
    type: string | null,
    handler: (context: T) => void,
  ): Unsubscribe {
    const sub = this.glue.interop.subscribe(type ?? '*', (ctx) => {
      handler(ctx as T);
    });
    return () => sub.unsubscribe();
  }

  async raiseIntent(intent: string, context?: Fdc3Context): Promise<IntentResolution> {
    const result = await this.glue.interop.invoke(intent, context ?? {});
    return {
      source: { appId: 'ioconnect' },
      intent,
      result: result.returned as Fdc3Context | undefined,
    };
  }

  addIntentListener(
    intent: string,
    handler: (context?: Fdc3Context) => Promise<void> | void,
  ): Unsubscribe {
    let registered = false;
    void this.glue.interop.register(intent, (args) => {
      void handler(args as Fdc3Context);
      return {};
    }).then(() => { registered = true; });

    return () => {
      // TODO: glue.interop does not expose a clean un-register; use a flag
      registered = false;
    };
  }

  async joinChannel(channelId: string): Promise<void> {
    await this.glue.channels.join(channelId);
  }

  async leaveCurrentChannel(): Promise<void> {
    await this.glue.channels.leave();
  }

  async getCurrentChannel(): Promise<UserChannel | null> {
    const ch = this.glue.channels.current();
    if (!ch) return null;
    return {
      id: ch.name,
      type: 'user',
      displayMetadata: { name: ch.name, color: ch.meta.color },
    };
  }

  async getUserChannels(): Promise<UserChannel[]> {
    return this.glue.channels.list().map((ch) => ({
      id: ch.name,
      type: 'user',
      displayMetadata: { name: ch.name, color: ch.meta.color },
    }));
  }

  async openApp(appId: string, context?: Fdc3Context): Promise<void> {
    await this.glue.appManager.open(appId, context);
  }
}
