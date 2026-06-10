import type { AppDefinition, Fdc3Context, IntentResolution } from '@fdc3-poc/fdc3-core';
import { IntentResolutionError, UserCancelledResolutionError } from '@fdc3-poc/fdc3-core';
import type { IntentRegistry } from './intent-registry.js';

/**
 * A single candidate handler shown in the resolver dialog. Built from both
 * live runtime listeners (already-running app instances) and static directory
 * entries (apps that would have to be opened).
 */
export interface IntentResolverCandidate {
  appId: string;
  title?: string;
  description?: string;
  icon?: string;
  iconColor?: string;
  /** True when an instance is already running and will receive the intent directly. */
  isRunning: boolean;
  /** webContentsId of the running instance, when isRunning is true. */
  instanceId?: number;
}

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
  /**
   * Called when more than one candidate exists. Returns the chosen candidate,
   * or null to indicate the user cancelled (resolver translates to
   * UserCancelledResolutionError).
   * If omitted, the resolver picks the first candidate (legacy behaviour).
   */
  chooseHandler?(
    intent: string,
    context: Fdc3Context | undefined,
    candidates: IntentResolverCandidate[],
  ): Promise<IntentResolverCandidate | null>;
}

export class IntentResolver {
  async resolve(opts: ResolveIntentOptions): Promise<IntentResolution> {
    const { intent, context, registry, appDirectory, deliverToWindow, openApp, chooseHandler } = opts;

    const candidates = this.buildCandidates(intent, registry, appDirectory);
    if (candidates.length === 0) {
      throw new IntentResolutionError(intent, context);
    }

    let chosen: IntentResolverCandidate;
    if (candidates.length === 1 || !chooseHandler) {
      chosen = candidates[0];
    } else {
      const pick = await chooseHandler(intent, context, candidates);
      if (!pick) throw new UserCancelledResolutionError();
      chosen = pick;
    }

    if (chosen.isRunning && chosen.instanceId !== undefined) {
      deliverToWindow(chosen.instanceId, intent, context);
      return { source: { appId: chosen.appId }, intent };
    }

    await openApp(chosen.appId, context);
    return { source: { appId: chosen.appId }, intent };
  }

  /**
   * Build a deduped candidate list. A running instance shadows the static
   * directory entry for the same appId — pickers should show "Running" once,
   * not as a duplicate of the "Open" entry.
   */
  private buildCandidates(
    intent: string,
    registry: IntentRegistry,
    appDirectory: AppDefinition[],
  ): IntentResolverCandidate[] {
    const liveIds = registry.getListeners(intent);
    const result: IntentResolverCandidate[] = [];
    const seenAppIds = new Set<string>();

    for (const webContentsId of liveIds) {
      const appId = registry.getAppId(webContentsId);
      if (!appId || seenAppIds.has(appId)) continue;
      const def = appDirectory.find((a) => a.appId === appId);
      result.push({
        appId,
        title: def?.title ?? appId,
        description: def?.description,
        icon: def?.icon,
        iconColor: def?.iconColor,
        isRunning: true,
        instanceId: webContentsId,
      });
      seenAppIds.add(appId);
    }

    for (const def of appDirectory) {
      if (seenAppIds.has(def.appId)) continue;
      if (!def.intents?.some((i) => i.intent === intent)) continue;
      result.push({
        appId: def.appId,
        title: def.title,
        description: def.description,
        icon: def.icon,
        iconColor: def.iconColor,
        isRunning: false,
      });
    }

    return result;
  }
}
