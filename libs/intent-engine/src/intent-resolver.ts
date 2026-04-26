import type { AppDefinition, Fdc3Context, IntentResolution } from '@fdc3-poc/fdc3-core';
import { IntentResolutionError } from '@fdc3-poc/fdc3-core';
import type { IntentRegistry } from './intent-registry.js';

export interface ResolveIntentOptions {
  intent: string;
  context?: Fdc3Context;
  /** Runtime listeners from IntentRegistry */
  registry: IntentRegistry;
  /** Static app directory entries for fallback / open-and-deliver */
  appDirectory: AppDefinition[];
  /**
   * Called when an intent needs to be delivered to a window.
   * The router calls webContents.send() here.
   */
  deliverToWindow(webContentsId: number, intent: string, context?: Fdc3Context): void;
  /**
   * Called when the target app is not running and needs to be opened first.
   * Returns once the app is ready (may have delivered the intent internally).
   */
  openApp(appId: string, context?: Fdc3Context): Promise<void>;
}

export class IntentResolver {
  async resolve(opts: ResolveIntentOptions): Promise<IntentResolution> {
    const { intent, context, registry, appDirectory, deliverToWindow, openApp } = opts;

    // 1. Check for live runtime listeners first
    const liveListeners = registry.getListeners(intent);
    if (liveListeners.length > 0) {
      const targetId = liveListeners[0]; // single target; resolver UI for multiple is future work
      const appId = registry.getAppId(targetId) ?? 'unknown';
      deliverToWindow(targetId, intent, context);
      return { source: { appId }, intent };
    }

    // 2. Fall back to static app directory to open the target app
    const appDef = appDirectory.find((a) => a.intents?.some((i) => i.intent === intent));
    if (!appDef) {
      throw new IntentResolutionError(intent, context);
    }

    // Open the app and wait for it to register a listener, then deliver
    await openApp(appDef.appId, context);
    return { source: { appId: appDef.appId }, intent };
  }
}
