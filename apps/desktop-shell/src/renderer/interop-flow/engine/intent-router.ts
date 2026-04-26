import type { InteropConnector, InteropFlowDefinition } from '../model/interop-flow-types.js';
import { validateFlow } from './flow-validator.js';

export interface RoutedIntentDelivery {
  connector: InteropConnector;
  targetAppId: string;
  intentName: string;
  context?: unknown;
}

export function routeIntent(flow: InteropFlowDefinition, sourceAppId: string, intentName: string, context?: unknown): RoutedIntentDelivery[] {
  if (!flow.enabled) return [];
  const validations = new Map(validateFlow(flow).map((validation) => [validation.connectorId, validation]));
  return flow.connectors
    .filter((connector) => connector.enabled)
    .filter((connector) => connector.sourceAppId === sourceAppId)
    .filter((connector) => connector.intentName === intentName)
    .filter((connector) => connector.mode === 'intent' || connector.mode === 'intent-to-context')
    .filter((connector) => validations.get(connector.id)?.valid)
    .map((connector) => ({
      connector,
      targetAppId: connector.targetAppId,
      intentName,
      context,
    }));
}
