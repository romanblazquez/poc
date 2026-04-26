import type { InteropConnector, InteropFlowDefinition } from '../model/interop-flow-types.js';
import { validateFlow } from './flow-validator.js';

export interface RoutedContextDelivery {
  connector: InteropConnector;
  targetAppId: string;
  context: unknown;
}

export function routeContext(flow: InteropFlowDefinition, sourceAppId: string, context: { type?: string; [key: string]: unknown }): RoutedContextDelivery[] {
  if (!flow.enabled || !context.type) return [];
  const validations = new Map(validateFlow(flow).map((validation) => [validation.connectorId, validation]));
  return flow.connectors
    .filter((connector) => connector.enabled)
    .filter((connector) => connector.sourceAppId === sourceAppId)
    .filter((connector) => connector.contextType === context.type)
    .filter((connector) => connector.mode === 'context' || connector.mode === 'theme' || connector.mode === 'audit' || connector.mode === 'context-to-intent')
    .filter((connector) => validations.get(connector.id)?.valid)
    .filter((connector) => conditionMatches(connector, context))
    .map((connector) => ({
      connector,
      targetAppId: connector.targetAppId,
      context: applyTransform(connector, context),
    }));
}

function conditionMatches(connector: InteropConnector, context: Record<string, unknown>): boolean {
  if (!connector.condition) return true;
  const value = context[connector.condition.field];
  switch (connector.condition.operator) {
    case 'equals':
      return value === connector.condition.value;
    case 'notEquals':
      return value !== connector.condition.value;
    case 'exists':
      return value !== undefined && value !== null;
    case 'contains':
      return String(value ?? '').includes(String(connector.condition.value ?? ''));
    default:
      return false;
  }
}

function applyTransform(connector: InteropConnector, context: Record<string, unknown>): Record<string, unknown> {
  if (!connector.transform || connector.transform.type === 'identity') return context;
  if (connector.transform.type === 'field-map' && connector.transform.mapping) {
    return Object.fromEntries(Object.entries(connector.transform.mapping).map(([targetField, sourceField]) => [targetField, context[sourceField]]));
  }
  if (connector.transform.type === 'template') {
    return { ...context, routedBy: connector.id };
  }
  return context;
}
