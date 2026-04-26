import type { ConnectorValidation, InteropAppNode, InteropConnector, InteropFlowDefinition } from '../model/interop-flow-types.js';

export function validateFlow(flow: InteropFlowDefinition): ConnectorValidation[] {
  return flow.connectors.map((connector) => validateConnector(connector, flow.nodes));
}

export function validateConnector(connector: InteropConnector, nodes: InteropAppNode[]): ConnectorValidation {
  const source = nodes.find((node) => node.appId === connector.sourceAppId);
  const target = nodes.find((node) => node.appId === connector.targetAppId);
  if (!source || !target) {
    return { connectorId: connector.id, valid: false, message: 'Source or target app is not present in this workspace.' };
  }

  if (connector.mode === 'context' || connector.mode === 'theme' || connector.mode === 'audit') {
    const contextType = connector.contextType;
    if (!contextType) return invalid(connector, 'Context connector is missing a context type.');
    if (!source.capabilities.broadcasts.some((schema) => schema.type === contextType)) {
      return invalid(connector, `${source.label} does not broadcast ${contextType}.`);
    }
    if (!target.capabilities.listensTo.some((schema) => schema.type === contextType)) {
      return invalid(connector, `${target.label} does not listen to ${contextType}.`);
    }
    return valid(connector, `Routes ${contextType} from ${source.label} to ${target.label}.`);
  }

  if (connector.mode === 'intent') {
    const intentName = connector.intentName;
    if (!intentName) return invalid(connector, 'Intent connector is missing an intent name.');
    if (!source.capabilities.raisesIntents.some((schema) => schema.name === intentName)) {
      return invalid(connector, `${source.label} does not raise ${intentName}.`);
    }
    if (!target.capabilities.handlesIntents.some((schema) => schema.name === intentName)) {
      return invalid(connector, `${target.label} does not handle ${intentName}.`);
    }
    return valid(connector, `Routes ${intentName} intent to ${target.label}.`);
  }

  if (connector.mode === 'context-to-intent') {
    const contextType = connector.contextType;
    const intentName = connector.intentName;
    const targetIntent = target.capabilities.handlesIntents.find((schema) => schema.name === intentName);
    if (!contextType || !intentName) return invalid(connector, 'Context-to-intent connector needs both context and intent.');
    if (!source.capabilities.broadcasts.some((schema) => schema.type === contextType)) {
      return invalid(connector, `${source.label} does not broadcast ${contextType}.`);
    }
    if (!targetIntent) return invalid(connector, `${target.label} does not handle ${intentName}.`);
    if (targetIntent.acceptsContextTypes.length > 0 && !targetIntent.acceptsContextTypes.includes(contextType)) {
      return invalid(connector, `${intentName} does not accept ${contextType}.`);
    }
    return valid(connector, `Maps ${contextType} to ${intentName}.`);
  }

  return invalid(connector, 'Unsupported connector mode.');
}

function valid(connector: InteropConnector, message: string): ConnectorValidation {
  return { connectorId: connector.id, valid: true, message };
}

function invalid(connector: InteropConnector, message: string): ConnectorValidation {
  return { connectorId: connector.id, valid: false, message };
}
