import type { AppCapabilityConfig, AppEntry } from '../../App.js';
import { contextInPort, contextOutPort, intentInPort, intentOutPort } from '../model/connector-types.js';
import { FDC3_CONTEXT_SCHEMAS, FDC3_INTENT_SCHEMAS } from '../model/fdc3-schema.js';
import type { InteropAppNode, InteropConnector, InteropFlowDefinition } from '../model/interop-flow-types.js';

const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  'incoming-orders': { x: 80, y: 120 },
  'funds-allocations': { x: 410, y: 120 },
  'audit-log': { x: 740, y: 220 },
  'theme-toggle': { x: 410, y: 390 },
  'customer-profile': { x: 80, y: 390 },
  'payment-action': { x: 740, y: 390 },
  'customer-search': { x: 80, y: 80 },
  'portfolio-view': { x: 740, y: 80 },
  'market-watch': { x: 80, y: 370 },
};

const FALLBACK_CAPABILITIES: Record<string, AppCapabilityConfig> = {
  'incoming-orders': {
    broadcasts: ['com.demo.order', 'com.demo.fund'],
    listensTo: ['com.demo.fund', 'com.demo.theme'],
    raisesIntents: ['ViewOrder'],
    handlesIntents: [],
  },
  'funds-allocations': {
    broadcasts: ['com.demo.fund'],
    listensTo: ['com.demo.order', 'com.demo.fund', 'com.demo.theme'],
    raisesIntents: ['ViewFund'],
    handlesIntents: ['ViewFund'],
  },
  'audit-log': {
    broadcasts: [],
    listensTo: ['com.demo.order', 'com.demo.fund', 'com.demo.theme'],
    raisesIntents: [],
    handlesIntents: ['OpenAudit', 'ViewFund'],
  },
  'theme-toggle': {
    broadcasts: ['com.demo.theme'],
    listensTo: ['com.demo.theme'],
    raisesIntents: ['ApplyTheme'],
    handlesIntents: ['ApplyTheme'],
  },
  'customer-profile': {
    broadcasts: [],
    listensTo: ['fdc3.contact', 'com.demo.theme'],
    raisesIntents: ['StartPayment', 'ViewPortfolio'],
    handlesIntents: ['ViewContact'],
  },
  'payment-action': {
    broadcasts: [],
    listensTo: ['com.demo.paymentRequest', 'com.demo.theme'],
    raisesIntents: [],
    handlesIntents: ['StartPayment'],
  },
};

export function createInteropNodes(apps: AppEntry[], appIds: string[]): InteropAppNode[] {
  const appById = new Map(apps.map((app) => [app.appId, app]));
  return appIds
    .map((appId, index): InteropAppNode | null => {
      const app = appById.get(appId);
      if (!app) return null;
      const capabilities = resolveCapabilities(app);
      const node: InteropAppNode = {
        id: app.appId,
        appId: app.appId,
        label: app.title,
        kind: 'app' as const,
        autoWire: app.capabilities?.autoWire !== false,
        capabilities,
        position: DEFAULT_POSITIONS[app.appId] ?? { x: 80 + (index % 3) * 330, y: 100 + Math.floor(index / 3) * 230 },
      };
      if (app.icon) node.icon = app.icon;
      return node;
    })
    .filter((node): node is InteropAppNode => Boolean(node));
}

export function createAutoWiredFlow(apps: AppEntry[], appIds: string[]): InteropFlowDefinition {
  const nodes = createInteropNodes(apps, appIds);
  const connectors = buildAutoConnectors(nodes);

  return { nodes, connectors, enabled: true };
}

export function mergeFlowWithWorkspaceApps(flow: InteropFlowDefinition | undefined, apps: AppEntry[], appIds: string[]): InteropFlowDefinition {
  const nodes = createInteropNodes(apps, appIds);
  if (!flow) return { nodes, connectors: [], enabled: true };
  const nodeIds = new Set(nodes.map((node) => node.appId));
  const previousPositions = new Map(flow.nodes.map((node) => [node.appId, node.position]));
  return {
    enabled: flow.enabled,
    nodes: nodes.map((node) => ({ ...node, position: previousPositions.get(node.appId) ?? node.position })),
    connectors: flow.connectors.filter((connector) => {
      if (!nodeIds.has(connector.sourceAppId) || !nodeIds.has(connector.targetAppId)) return false;
      const source = nodes.find((node) => node.appId === connector.sourceAppId);
      const target = nodes.find((node) => node.appId === connector.targetAppId);
      if (isAutoConnector(connector) && (source?.autoWire === false || target?.autoWire === false)) return false;
      return true;
    }),
  };
}

function resolveCapabilities(app: AppEntry): InteropAppNode['capabilities'] {
  const fallback = FALLBACK_CAPABILITIES[app.appId];
  const configured = app.capabilities;

  // Merge all sources so no declaration is silently dropped.
  // Priority: app-directory capabilities → listensForContexts/intents metadata → hardcoded fallback.
  const broadcasts = unique([
    ...(configured?.broadcasts ?? fallback?.broadcasts ?? []),
  ]);
  const listensTo = unique([
    ...(configured?.listensTo ?? fallback?.listensTo ?? []),
    ...(app.listensForContexts ?? []),
  ]);
  const raisesIntents = unique([
    ...(configured?.raisesIntents ?? fallback?.raisesIntents ?? []),
  ]);
  const handlesIntents = unique([
    ...(configured?.handlesIntents ?? fallback?.handlesIntents ?? []),
    ...(app.intents?.map((i) => i.intent) ?? []),
  ]);

  return {
    broadcasts: schemasForContexts(broadcasts),
    listensTo: schemasForContexts(listensTo),
    raisesIntents: schemasForIntents(raisesIntents),
    handlesIntents: schemasForIntents(handlesIntents),
  };
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

function buildAutoConnectors(nodes: InteropAppNode[]): InteropConnector[] {
  const connectors: InteropConnector[] = [];
  const seenIds = new Set<string>();

  for (const source of nodes) {
    if (!source.autoWire) continue;
    for (const target of nodes) {
      if (source.appId === target.appId) continue;
      if (!target.autoWire) continue;

      for (const broadcast of source.capabilities.broadcasts) {
        if (target.capabilities.listensTo.some((schema) => schema.type === broadcast.type)) {
          pushConnector(connectors, seenIds, contextConnector(source.appId, target.appId, broadcast.type, connectorModeForContext(broadcast.type)));
        }

        for (const handledIntent of target.capabilities.handlesIntents) {
          if (handledIntent.acceptsContextTypes.includes(broadcast.type)) {
            pushConnector(
              connectors,
              seenIds,
              contextToIntentConnector(source.appId, target.appId, broadcast.type, handledIntent.name),
            );
          }
        }
      }

      for (const raisedIntent of source.capabilities.raisesIntents) {
        if (target.capabilities.handlesIntents.some((schema) => schema.name === raisedIntent.name)) {
          const preferredContext = raisedIntent.acceptsContextTypes[0];
          pushConnector(connectors, seenIds, intentConnector(source.appId, target.appId, raisedIntent.name, preferredContext));
        }
      }
    }
  }

  return connectors;
}

function isAutoConnector(connector: InteropConnector): boolean {
  return (
    connector.id.startsWith('context:') ||
    connector.id.startsWith('theme:') ||
    connector.id.startsWith('audit:') ||
    connector.id.startsWith('intent:') ||
    connector.id.startsWith('context-to-intent:')
  );
}

function pushConnector(connectors: InteropConnector[], seenIds: Set<string>, connector: InteropConnector): void {
  if (seenIds.has(connector.id)) return;
  seenIds.add(connector.id);
  connectors.push(connector);
}

function connectorModeForContext(contextType: string): InteropConnector['mode'] {
  if (contextType === 'com.demo.theme') return 'theme';
  return 'context';
}

function schemasForContexts(types: string[]) {
  return types.map((type) => FDC3_CONTEXT_SCHEMAS.find((schema) => schema.type === type) ?? {
    type,
    label: type,
    requiredFields: ['type'],
    optionalFields: [],
  });
}

function schemasForIntents(names: string[]) {
  return names.map((name) => FDC3_INTENT_SCHEMAS.find((schema) => schema.name === name) ?? {
    name,
    label: name,
    acceptsContextTypes: [],
  });
}

function contextConnector(
  sourceAppId: string,
  targetAppId: string,
  contextType: string,
  mode: InteropConnector['mode'] = 'context',
): InteropConnector {
  return {
    id: `${mode}:${sourceAppId}:${contextType}->${targetAppId}`,
    sourceAppId,
    targetAppId,
    sourcePortId: contextOutPort(contextType),
    targetPortId: contextInPort(contextType),
    mode,
    contextType,
    enabled: true,
    transform: { type: 'identity' },
  };
}

function intentConnector(sourceAppId: string, targetAppId: string, intentName: string, contextType?: string): InteropConnector {
  return {
    id: `intent:${sourceAppId}:${intentName}->${targetAppId}`,
    sourceAppId,
    targetAppId,
    sourcePortId: intentOutPort(intentName),
    targetPortId: intentInPort(intentName),
    mode: 'intent',
    intentName,
    contextType,
    enabled: true,
    transform: { type: 'identity' },
  };
}

function contextToIntentConnector(sourceAppId: string, targetAppId: string, contextType: string, intentName: string): InteropConnector {
  return {
    id: `context-to-intent:${sourceAppId}:${contextType}->${targetAppId}:${intentName}`,
    sourceAppId,
    targetAppId,
    sourcePortId: contextOutPort(contextType),
    targetPortId: intentInPort(intentName),
    mode: 'context-to-intent',
    contextType,
    intentName,
    enabled: true,
    transform: { type: 'identity' },
  };
}
