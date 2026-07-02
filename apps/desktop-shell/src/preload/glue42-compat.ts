/**
 * Glue42 / io.Connect compatibility surface.
 *
 * Exposes a pre-initialized `window.glue` API (plus the `Glue()` / `GlueWeb()` /
 * `IOBrowser()` / `IODesktop()` factories and the `window.glue42gd` container
 * marker) so apps written against the Glue42/io.Connect JavaScript API run in
 * this shell without modification — the same way `window.fdc3` serves
 * unmodified FDC3 apps.
 *
 * Every Glue42 concept is mapped onto the shell's existing FDC3 IPC, so Glue42
 * apps and FDC3 apps interoperate transparently on the same rails:
 *
 *   glue.channels   ↔ FDC3 user channels (join/broadcast/subscribe)
 *   glue.contexts   ↔ FDC3 app channels  (one channel per named shared context)
 *   glue.intents    ↔ FDC3 intents       (raise/addIntentListener)
 *   glue.interop    ↔ FDC3 intents       (method name = intent name, args wrapped)
 *   glue.appManager ↔ app directory + OPEN_APP
 *
 * Scope: the commonly-used 80% of the API. Not implemented: streaming interop
 * (subscriptions), window management beyond close, layouts, metrics.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IpcEvents } from '@fdc3-poc/interop-electron-adapter';
import type { Fdc3Context, ImplementationMetadata, IntentResolution, UserChannel } from '@fdc3-poc/fdc3-core';

const GLUE_VERSION = '5.24.0-fdc3-poc';
/** Wrapper type for glue.interop invocation arguments travelling as a context. */
const INTEROP_ARGS_TYPE = 'glue42.interop.args';
/** Wrapper type for channel data bags that are not FDC3-shaped. */
const CHANNEL_DATA_TYPE = 'glue42.channel.data';
/** App-channel namespace backing glue.contexts shared contexts. */
const SHARED_CONTEXT_PREFIX = 'glue42.context.';

type AnyHandler = (...args: unknown[]) => unknown;

// ─── Local dispatch state (separate from the fdc3 preload maps) ────────────

const channelDataHandlers = new Set<(context: Fdc3Context) => void>();
const channelChangedHandlers = new Set<(channel: UserChannel | null) => void>();
const interopMethodHandlers = new Map<string, AnyHandler>();
const intentListeners = new Map<string, Set<(context: { type: string; data: Record<string, unknown> }) => unknown>>();

let currentChannel: UserChannel | null = null;
void ipcRenderer.invoke(IpcEvents.GET_CURRENT_CHANNEL).then((ch: UserChannel | null) => { currentChannel = ch; }).catch(() => undefined);

ipcRenderer.on(IpcEvents.CHANNEL_CHANGED, (_event, channel: UserChannel | null) => {
  currentChannel = channel;
  for (const handler of channelChangedHandlers) {
    try { handler(channel); } catch (e) { console.error('[glue42 compat] channel handler threw:', e); }
  }
});

ipcRenderer.on(IpcEvents.CONTEXT_UPDATE, (_event, context: Fdc3Context) => {
  for (const handler of channelDataHandlers) {
    try { handler(context); } catch (e) { console.error('[glue42 compat] data handler threw:', e); }
  }
});

ipcRenderer.on(
  IpcEvents.INTENT_FIRE,
  (_event, payload: { intent: string; context?: Fdc3Context; requestId?: string }) => {
    // glue.interop methods — unwrap args, complete with the handler's result.
    const method = interopMethodHandlers.get(payload.intent);
    if (method) {
      const args = payload.context?.type === INTEROP_ARGS_TYPE
        ? (payload.context as { args?: Record<string, unknown> }).args ?? {}
        : payload.context ?? {};
      void (async () => {
        try {
          const returned = await method(args);
          if (payload.requestId) {
            await ipcRenderer.invoke(IpcEvents.COMPLETE_INTENT, {
              requestId: payload.requestId,
              result: { type: 'glue42.interop.result', returned: returned ?? null },
            });
          }
        } catch (e) {
          console.error(`[glue42 compat] interop method "${payload.intent}" threw:`, e);
        }
      })();
    }

    // glue.intents listeners — deliver io.Connect-shaped { type, data }.
    const listeners = intentListeners.get(payload.intent);
    if (listeners?.size) {
      const { type, ...data } = payload.context ?? { type: 'unknown' };
      for (const listener of listeners) {
        try { void listener({ type, data }); } catch (e) { console.error('[glue42 compat] intent listener threw:', e); }
      }
    }
  },
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function toChannelContext(data: unknown): Fdc3Context {
  // FDC3-shaped payloads travel natively so FDC3 apps on the channel understand them.
  if (data && typeof data === 'object' && typeof (data as { type?: unknown }).type === 'string') {
    return data as Fdc3Context;
  }
  return { type: CHANNEL_DATA_TYPE, data } as Fdc3Context;
}

function fromChannelContext(context: Fdc3Context): unknown {
  return context.type === CHANNEL_DATA_TYPE ? (context as { data?: unknown }).data : context;
}

function toGlueChannel(channel: UserChannel): { name: string; meta: { color?: string } } {
  return {
    name: channel.displayMetadata?.name ?? channel.id,
    meta: { color: channel.displayMetadata?.color },
  };
}

async function resolveChannelId(name: string): Promise<string | null> {
  const channels = (await ipcRenderer.invoke(IpcEvents.GET_USER_CHANNELS)) as UserChannel[];
  const match = channels.find(
    (ch) => ch.id === name || ch.displayMetadata?.name?.toLowerCase() === name.toLowerCase(),
  );
  return match?.id ?? null;
}

function sharedContextChannelId(name: string): string {
  return `${SHARED_CONTEXT_PREFIX}${name}`;
}

async function readSharedContext(name: string): Promise<Record<string, unknown>> {
  await ipcRenderer.invoke(IpcEvents.GET_OR_CREATE_APP_CHANNEL, sharedContextChannelId(name));
  const context = (await ipcRenderer.invoke(IpcEvents.APP_CHANNEL_GET_CURRENT_CONTEXT, {
    channelId: sharedContextChannelId(name),
    contextType: CHANNEL_DATA_TYPE,
  })) as Fdc3Context | null;
  return ((context as { data?: Record<string, unknown> } | null)?.data ?? {});
}

async function writeSharedContext(name: string, data: Record<string, unknown>): Promise<void> {
  await ipcRenderer.invoke(IpcEvents.GET_OR_CREATE_APP_CHANNEL, sharedContextChannelId(name));
  await ipcRenderer.invoke(IpcEvents.APP_CHANNEL_BROADCAST, {
    channelId: sharedContextChannelId(name),
    context: { type: CHANNEL_DATA_TYPE, name, data },
  });
}

function getInfo(): Promise<ImplementationMetadata> {
  return ipcRenderer.invoke(IpcEvents.GET_INFO) as Promise<ImplementationMetadata>;
}

// ─── The glue API surface ───────────────────────────────────────────────────

function buildGlueApi() {
  return {
    version: GLUE_VERSION,

    async info(): Promise<{ application: string; version: string }> {
      const meta = await getInfo();
      return { application: meta.appMetadata.appId, version: GLUE_VERSION };
    },

    /** No-op shutdown for API compatibility. */
    done(): Promise<void> {
      return Promise.resolve();
    },

    // ── glue.channels — FDC3 user channels ─────────────────────────────────
    channels: {
      async join(name: string): Promise<void> {
        const id = await resolveChannelId(name);
        if (!id) throw new Error(`Channel "${name}" does not exist`);
        await ipcRenderer.invoke(IpcEvents.JOIN_CHANNEL, id);
      },
      leave(): Promise<void> {
        return ipcRenderer.invoke(IpcEvents.LEAVE_CHANNEL) as Promise<void>;
      },
      current(): string | undefined {
        return currentChannel ? toGlueChannel(currentChannel).name : undefined;
      },
      my(): { name: string; meta: { color?: string } } | undefined {
        return currentChannel ? toGlueChannel(currentChannel) : undefined;
      },
      async all(): Promise<string[]> {
        const channels = (await ipcRenderer.invoke(IpcEvents.GET_USER_CHANNELS)) as UserChannel[];
        return channels.map((ch) => toGlueChannel(ch).name);
      },
      async list(): Promise<Array<{ name: string; meta: { color?: string } }>> {
        const channels = (await ipcRenderer.invoke(IpcEvents.GET_USER_CHANNELS)) as UserChannel[];
        return channels.map(toGlueChannel);
      },
      /** Publish a data bag to the current channel; FDC3-shaped data travels natively. */
      publish(data: unknown): Promise<void> {
        return ipcRenderer.invoke(IpcEvents.BROADCAST, toChannelContext(data)) as Promise<void>;
      },
      /** Subscribe to data on the current channel: callback(data, context, updaterId). */
      subscribe(callback: (data: unknown, context: { name?: string }, updaterId?: string) => void): { unsubscribe(): void } {
        const handler = (context: Fdc3Context): void => {
          callback(fromChannelContext(context), { name: currentChannel ? toGlueChannel(currentChannel).name : undefined });
        };
        channelDataHandlers.add(handler);
        if (channelDataHandlers.size === 1) {
          void ipcRenderer.invoke(IpcEvents.ADD_CONTEXT_LISTENER, '*');
        }
        return {
          unsubscribe: (): void => {
            channelDataHandlers.delete(handler);
            if (channelDataHandlers.size === 0) {
              void ipcRenderer.invoke(IpcEvents.REMOVE_CONTEXT_LISTENER, '*');
            }
          },
        };
      },
      onChanged(callback: (channelName: string | undefined) => void): { unsubscribe(): void } {
        const handler = (channel: UserChannel | null): void => {
          callback(channel ? toGlueChannel(channel).name : undefined);
        };
        channelChangedHandlers.add(handler);
        return { unsubscribe: () => channelChangedHandlers.delete(handler) };
      },
    },

    // ── glue.contexts — named shared contexts on FDC3 app channels ─────────
    contexts: {
      /** Merge a delta into the named shared context. */
      async update(name: string, delta: Record<string, unknown>): Promise<void> {
        const current = await readSharedContext(name);
        await writeSharedContext(name, { ...current, ...delta });
      },
      /** Replace the named shared context. */
      set(name: string, data: Record<string, unknown>): Promise<void> {
        return writeSharedContext(name, data ?? {});
      },
      get(name: string): Promise<Record<string, unknown>> {
        return readSharedContext(name);
      },
      async subscribe(
        name: string,
        callback: (data: Record<string, unknown>, delta?: unknown, removed?: string[], unsubscribe?: () => void) => void,
      ): Promise<() => void> {
        const channelId = sharedContextChannelId(name);
        await ipcRenderer.invoke(IpcEvents.GET_OR_CREATE_APP_CHANNEL, channelId);

        const handler = (_event: unknown, payload: { channelId: string; context: Fdc3Context }): void => {
          if (payload.channelId !== channelId) return;
          const data = ((payload.context as { data?: Record<string, unknown> }).data ?? {});
          try { callback(data, data, [], unsubscribe); } catch (e) { console.error('[glue42 compat] context subscriber threw:', e); }
        };
        const unsubscribe = (): void => {
          ipcRenderer.removeListener(IpcEvents.APP_CHANNEL_CONTEXT, handler);
          void ipcRenderer.invoke(IpcEvents.APP_CHANNEL_REMOVE_LISTENER, { channelId, contextType: CHANNEL_DATA_TYPE });
        };
        ipcRenderer.on(IpcEvents.APP_CHANNEL_CONTEXT, handler);

        const cached = (await ipcRenderer.invoke(IpcEvents.APP_CHANNEL_ADD_LISTENER, {
          channelId,
          contextType: CHANNEL_DATA_TYPE,
        })) as Fdc3Context[];
        for (const context of cached) {
          const data = ((context as { data?: Record<string, unknown> }).data ?? {});
          try { callback(data, data, [], unsubscribe); } catch (e) { console.error('[glue42 compat] context subscriber threw:', e); }
        }
        return unsubscribe;
      },
      all(): string[] {
        // Names are not tracked locally; io.Connect returns known context names.
        return [];
      },
    },

    // ── glue.intents — direct FDC3 intent mapping ──────────────────────────
    intents: {
      /** raise("ShowChart", ctx?) or raise({ intent, context: { type, data } }). */
      async raise(
        request: string | { intent: string; context?: { type: string; data?: Record<string, unknown> } },
        context?: { type: string; data?: Record<string, unknown> },
      ): Promise<{ handlers?: unknown[]; result?: unknown }> {
        const intent = typeof request === 'string' ? request : request.intent;
        const intentContext = typeof request === 'string' ? context : request.context;
        const fdc3Context: Fdc3Context | undefined = intentContext
          ? ({ type: intentContext.type, ...(intentContext.data ?? {}) } as Fdc3Context)
          : undefined;
        const resolution = (await ipcRenderer.invoke(IpcEvents.RAISE_INTENT, {
          intent,
          context: fdc3Context,
        })) as IntentResolution;
        return { result: resolution?.result };
      },
      addIntentListener(
        intent: string | { intent: string },
        handler: (context: { type: string; data: Record<string, unknown> }) => unknown,
      ): { unsubscribe(): void } {
        const name = typeof intent === 'string' ? intent : intent.intent;
        if (!intentListeners.has(name)) {
          intentListeners.set(name, new Set());
          void ipcRenderer.invoke(IpcEvents.ADD_INTENT_LISTENER, name);
        }
        intentListeners.get(name)!.add(handler);
        return {
          unsubscribe: (): void => {
            const set = intentListeners.get(name);
            set?.delete(handler);
            if (set?.size === 0) {
              intentListeners.delete(name);
              void ipcRenderer.invoke(IpcEvents.REMOVE_INTENT_LISTENER, name);
            }
          },
        };
      },
      async all(): Promise<Array<{ name: string }>> {
        const apps = (await ipcRenderer.invoke(IpcEvents.GET_APP_LIST)) as Array<{
          intents?: Array<{ intent: string }>;
        }>;
        const names = new Set<string>();
        for (const app of apps) {
          for (const entry of app.intents ?? []) names.add(entry.intent);
        }
        return [...names].map((name) => ({ name }));
      },
    },

    // ── glue.interop — request/response methods over intents ───────────────
    interop: {
      /** register("Shell.ShowClient", handler) — handler(args) may return a result. */
      register(method: string | { name: string }, handler: AnyHandler): Promise<void> {
        const name = typeof method === 'string' ? method : method.name;
        interopMethodHandlers.set(name, handler);
        return ipcRenderer.invoke(IpcEvents.ADD_INTENT_LISTENER, name) as Promise<void>;
      },
      unregister(method: string | { name: string }): Promise<void> {
        const name = typeof method === 'string' ? method : method.name;
        interopMethodHandlers.delete(name);
        return ipcRenderer.invoke(IpcEvents.REMOVE_INTENT_LISTENER, name) as Promise<void>;
      },
      /** invoke("Shell.ShowClient", { id }) → { returned } */
      async invoke(
        method: string | { name: string },
        args?: Record<string, unknown>,
      ): Promise<{ returned: unknown; called_with: Record<string, unknown> | undefined }> {
        const name = typeof method === 'string' ? method : method.name;
        const resolution = (await ipcRenderer.invoke(IpcEvents.RAISE_INTENT, {
          intent: name,
          context: { type: INTEROP_ARGS_TYPE, args: args ?? {} },
          awaitResult: true,
        })) as IntentResolution;
        const result = resolution?.result as { returned?: unknown } | undefined;
        return { returned: result?.returned ?? result, called_with: args };
      },
      methods(): Array<{ name: string }> {
        return [...interopMethodHandlers.keys()].map((name) => ({ name }));
      },
    },

    // ── glue.appManager — app directory + open ─────────────────────────────
    appManager: {
      application(name: string): {
        name: string;
        start(context?: Record<string, unknown>): Promise<void>;
      } {
        return {
          name,
          start: (context?: Record<string, unknown>): Promise<void> =>
            ipcRenderer.invoke(IpcEvents.OPEN_APP, { appId: name, context }) as Promise<void>,
        };
      },
      async applications(): Promise<Array<{ name: string; title: string }>> {
        const apps = (await ipcRenderer.invoke(IpcEvents.GET_APP_LIST)) as Array<{ appId: string; title: string }>;
        return apps.map((app) => ({ name: app.appId, title: app.title }));
      },
      async myInstance(): Promise<{ application: { name: string } }> {
        const meta = await getInfo();
        return { application: { name: meta.appMetadata.appId } };
      },
      onAppAdded(): { unsubscribe(): void } {
        return { unsubscribe: () => undefined };
      },
      onAppRemoved(): { unsubscribe(): void } {
        return { unsubscribe: () => undefined };
      },
    },

    // ── glue.windows — minimal surface ──────────────────────────────────────
    windows: {
      my(): { close(): Promise<boolean> } {
        return {
          close: (): Promise<boolean> => ipcRenderer.invoke(IpcEvents.CLOSE_CURRENT_WINDOW) as Promise<boolean>,
        };
      },
      open(name: string): Promise<void> {
        return ipcRenderer.invoke(IpcEvents.OPEN_APP, { appId: name }) as Promise<void>;
      },
    },
  };
}

// ─── Exposure ───────────────────────────────────────────────────────────────

export function exposeGlue42Compat(): void {
  const glue = buildGlueApi();

  // Pre-initialized instance — apps doing `if (window.glue) { … }` just work.
  contextBridge.exposeInMainWorld('glue', glue);

  // Container marker — apps detecting a Glue42 environment via window.glue42gd.
  contextBridge.exposeInMainWorld('glue42gd', {
    environment: 'fdc3-desktop-poc',
    version: GLUE_VERSION,
  });

  // Factories — apps doing `const glue = await Glue(config)` (or the io.Connect
  // and Glue42 Web spellings) receive the same pre-initialized instance.
  const factory = (): Promise<typeof glue> => Promise.resolve(glue);
  contextBridge.exposeInMainWorld('Glue', factory);
  contextBridge.exposeInMainWorld('GlueWeb', factory);
  contextBridge.exposeInMainWorld('IOBrowser', factory);
  contextBridge.exposeInMainWorld('IODesktop', factory);
}
