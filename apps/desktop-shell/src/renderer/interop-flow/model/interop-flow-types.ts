import type { Fdc3ContextSchema, Fdc3IntentSchema } from './fdc3-schema.js';

export interface InteropAppCapabilities {
  broadcasts: Fdc3ContextSchema[];
  listensTo: Fdc3ContextSchema[];
  raisesIntents: Fdc3IntentSchema[];
  handlesIntents: Fdc3IntentSchema[];
}

export interface InteropAppNode {
  id: string;
  appId: string;
  label: string;
  icon?: string;
  kind: 'app';
  autoWire: boolean;
  capabilities: InteropAppCapabilities;
  position: {
    x: number;
    y: number;
  };
}

export type InteropConnectorMode =
  | 'context'
  | 'intent'
  | 'context-to-intent'
  | 'intent-to-context'
  | 'theme'
  | 'audit';

export interface InteropConnector {
  id: string;
  sourceAppId: string;
  targetAppId: string;
  sourcePortId: string;
  targetPortId: string;
  mode: InteropConnectorMode;
  contextType?: string;
  intentName?: string;
  enabled: boolean;
  condition?: {
    field: string;
    operator: 'equals' | 'notEquals' | 'exists' | 'contains';
    value?: unknown;
  };
  transform?: {
    type: 'identity' | 'field-map' | 'template' | 'custom';
    mapping?: Record<string, string>;
  };
}

export interface InteropFlowDefinition {
  nodes: InteropAppNode[];
  connectors: InteropConnector[];
  enabled: boolean;
}

export interface ConnectorValidation {
  connectorId: string;
  valid: boolean;
  message: string;
}

export const EMPTY_INTEROP_FLOW: InteropFlowDefinition = {
  nodes: [],
  connectors: [],
  enabled: true,
};
