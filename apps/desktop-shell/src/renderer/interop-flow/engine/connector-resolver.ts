import type { AppEntry } from '../../App.js';
import { contextInPort, contextOutPort, intentInPort, intentOutPort } from '../model/connector-types.js';
import { FDC3_CONTEXT_SCHEMAS, FDC3_INTENT_SCHEMAS } from '../model/fdc3-schema.js';
import type { InteropAppNode, InteropConnector, InteropFlowDefinition } from '../model/interop-flow-types.js';

interface AppCapabilityConfig {
  broadcasts?: string[];
  listensTo?: string[];
  raisesIntents?: string[];
  handlesIntents?: string[];
}

type CapabilityAwareApp = AppEntry & {
  capabilities?: AppCapabilityConfig;
  listensForContexts?: string[];
  intents?: Array<{ intent: string; contextTypes: string[] }>;
};

const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  'incoming-orders': { x: 80, y: 120 },
  'funds-allocations': { x: 410, y: 120 },
  'audit-log': { x: 740, y: 220 },
  'theme-toggle': { x: 410, y: 390 },
  'customer-profile': { x: 80, y: 390 },
  'payment-action': { x: 740, y: 390 },
};

const FALLBACK_CAPABILITIES: Record<string, Required<AppCapabilityConfig>> = {
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
    broadcasts: ['fdc3.contact', 'com.demo.paymentRequest'],
    listensTo: ['fdc3.contact', 'com.demo.theme'],
    raisesIntents: ['StartPayment'],
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
  const appById = new Map(apps.map((app) => [app.appId, app as CapabilityAwareApp]));
  return appIds
    .map((appId, index) => {
      const app = appById.get(appId);
      if (!app) return null;
      const capabilities = resolveCapabilities(app);
      return {
        id: app.appId,
        appId: app.appId,
        label: app.title,
        icon: app.icon,
        kind: 'app' as const,
        capabilities,
        position: DEFAULT_POSITIONS[app.appId] ?? { x: 80 + (index % 3) * 330, y: 100 + Math.floor(index / 3) * 230 },
      };
    })
    .filter((node): node is InteropAppNode => Boolean(node));
}

export function createRecommendedFundsFlow(apps: AppEntry[], appIds: string[]): InteropFlowDefinition {
  const nodes = createInteropNodes(apps, appIds);
  const connectors: InteropConnector[] = [
    contextConnector('incoming-orders', 'funds-allocations', 'com.demo.order'),
    contextConnector('incoming-orders', 'funds-allocations', 'com.demo.fund'),
    contextConnector('funds-allocations', 'audit-log', 'com.demo.fund'),
    intentConnector('funds-allocations', 'audit-log', 'ViewFund', 'com.demo.fund'),
    contextConnector('theme-toggle', 'incoming-orders', 'com.demo.theme', 'theme'),
    contextConnector('theme-toggle', 'funds-allocations', 'com.demo.theme', 'theme'),
    contextConnector('theme-toggle', 'audit-log', 'com.demo.theme', 'theme'),
    intentConnector('customer-profile', 'payment-action', 'StartPayment', 'com.demo.paymentRequest'),
  ].filter((connector) => nodes.some((node) => node.appId === connector.sourceAppId) && nodes.some((node) => node.appId === connector.targetAppId));

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
    connectors: flow.connectors.filter((connector) => nodeIds.has(connector.sourceAppId) && nodeIds.has(connector.targetAppId)),
  };
}

function resolveCapabilities(app: CapabilityAwareApp): InteropAppNode['capabilities'] {
  const fallback = FALLBACK_CAPABILITIES[app.appId] ?? {
    broadcasts: [],
    listensTo: app.listensForContexts ?? [],
    raisesIntents: [],
    handlesIntents: app.intents?.map((intent) => intent.intent) ?? [],
  };
  const configured = app.capabilities ?? {};
  const broadcasts = configured.broadcasts ?? fallback.broadcasts;
  const listensTo = configured.listensTo ?? app.listensForContexts ?? fallback.listensTo;
  const raisesIntents = configured.raisesIntents ?? fallback.raisesIntents;
  const handlesIntents = configured.handlesIntents ?? app.intents?.map((intent) => intent.intent) ?? fallback.handlesIntents;
  return {
    broadcasts: schemasForContexts(broadcasts),
    listensTo: schemasForContexts(listensTo),
    raisesIntents: schemasForIntents(raisesIntents),
    handlesIntents: schemasForIntents(handlesIntents),
  };
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
    id: `${sourceAppId}:${contextType}->${targetAppId}`,
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

function intentConnector(sourceAppId: string, targetAppId: string, intentName: string, contextType: string): InteropConnector {
  return {
    id: `${sourceAppId}:${intentName}->${targetAppId}`,
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
