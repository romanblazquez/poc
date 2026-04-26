import type { InteropFlowDefinition } from '../model/interop-flow-types.js';
import { routeContext } from './context-router.js';
import { routeIntent } from './intent-router.js';

export interface FlowRuntimeAdapter {
  deliverContext(targetAppId: string, context: unknown): Promise<void>;
  deliverIntent(targetAppId: string, intentName: string, context?: unknown): Promise<void>;
}

export async function routeBroadcastThroughFlow(
  flow: InteropFlowDefinition,
  sourceAppId: string,
  context: { type?: string; [key: string]: unknown },
  adapter: FlowRuntimeAdapter,
): Promise<void> {
  const deliveries = routeContext(flow, sourceAppId, context);
  await Promise.all(deliveries.map((delivery) => adapter.deliverContext(delivery.targetAppId, delivery.context)));
}

export async function routeIntentThroughFlow(
  flow: InteropFlowDefinition,
  sourceAppId: string,
  intentName: string,
  context: unknown,
  adapter: FlowRuntimeAdapter,
): Promise<void> {
  const deliveries = routeIntent(flow, sourceAppId, intentName, context);
  await Promise.all(deliveries.map((delivery) => adapter.deliverIntent(delivery.targetAppId, delivery.intentName, delivery.context)));
}
