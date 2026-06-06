import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { AppEntry } from '../../App.js';
import { validateConnector, validateFlow } from '../engine/flow-validator.js';
import { parsePort } from '../model/connector-types.js';
import { contextLabel, intentLabel } from '../model/fdc3-schema.js';
import type { InteropAppNode, InteropConnector, InteropFlowDefinition } from '../model/interop-flow-types.js';
import { AppNode } from './AppNode.js';
import { ConnectorEdge } from './ConnectorEdge.js';
import { FlowToolbar } from './FlowToolbar.js';
import { ConnectorConfigPanel } from './ConnectorConfigPanel.js';
import { useInteropFlow } from '../hooks/useInteropFlow.js';
import { Badge } from '../../components/ui/badge.js';
import { Card, CardContent } from '../../components/ui/card.js';
import '../styles/interop-flow.css';

interface InteropFlowDesignerProps {
  apps: AppEntry[];
  workspaceTabId: string;
  workspaceName: string;
  theme: string;
  appIds: string[];
  onFlowChange?: (flow: InteropFlowDefinition) => void;
}

type FlowNodeData = InteropAppNode & Record<string, unknown>;
type FlowEdgeData = InteropConnector & { valid: boolean; label: string } & Record<string, unknown>;
type FlowNode = Node<FlowNodeData, 'app'>;
type FlowEdge = Edge<FlowEdgeData, 'connector'>;

const nodeTypes = { app: AppNode };
const edgeTypes = { connector: ConnectorEdge };

export function InteropFlowDesigner({ apps, workspaceTabId, workspaceName, theme, appIds, onFlowChange }: InteropFlowDesignerProps) {
  const { flow, commitFlow, autoWireFlow, updateConnector } = useInteropFlow(workspaceTabId, apps, appIds);
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState<FlowEdge>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const validations = useMemo(() => validateFlow(flow), [flow]);
  const validationMap = useMemo(() => new Map(validations.map((v) => [v.connectorId, v])), [validations]);
  const flowRef = useRef(flow);
  flowRef.current = flow;

  // Sync nodes from flow model only when the set of apps changes (not on position updates from drag).
  const lastNodeIdsRef = useRef('');
  useEffect(() => {
    const ids = flow.nodes.map((n) => n.appId).join(',');
    if (ids === lastNodeIdsRef.current) return;
    lastNodeIdsRef.current = ids;
    setNodes(
      flow.nodes.map((node) => ({
        id: node.appId,
        data: node as FlowNodeData,
        position: node.position,
        type: 'app' as const,
        draggable: true,
        connectable: true,
      })),
    );
  }, [flow.nodes, setNodes]);

  // Sync edges whenever flow.connectors changes by reference.
  // Node position updates (drag) call commitFlow with the SAME connectors reference,
  // so this effect correctly does NOT fire during drag.
  useEffect(() => {
    setEdges(
      flow.connectors.map((connector) => {
        const validation = validationMap.get(connector.id);
        return {
          id: connector.id,
          source: connector.sourceAppId,
          target: connector.targetAppId,
          sourceHandle: connector.sourcePortId,
          targetHandle: connector.targetPortId,
          type: 'connector',
          data: { ...connector, valid: validation?.valid ?? false, label: connectorDisplayLabel(connector) } as FlowEdgeData,
          animated: connector.enabled,
          deletable: true,
        };
      }),
    );
  }, [flow.connectors, validationMap, setEdges]);

  // Let React Flow own all node changes for smooth drag; only persist final position back to model.
  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    onNodesChangeInternal(changes);
    const dragEnds = changes.filter((c): c is Extract<NodeChange<FlowNode>, { type: 'position' }> =>
      c.type === 'position' && (c as { dragging?: boolean }).dragging === false,
    );
    if (dragEnds.length === 0) return;
    const current = flowRef.current;
    const updatedNodes = current.nodes.map((n) => {
      const change = dragEnds.find((c) => c.id === n.appId);
      return change?.position ? { ...n, position: change.position } : n;
    });
    commitFlow({ ...current, nodes: updatedNodes });
  }, [onNodesChangeInternal, commitFlow]);

  // Let React Flow own edge selection; only persist removals back to model.
  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    onEdgesChangeInternal(changes);
    const removes = changes.filter((c): c is Extract<EdgeChange<FlowEdge>, { type: 'remove' }> => c.type === 'remove');
    if (removes.length === 0) return;
    const ids = new Set(removes.map((c) => c.id));
    commitFlow({ ...flowRef.current, connectors: flowRef.current.connectors.filter((c) => !ids.has(c.id)) });
  }, [onEdgesChangeInternal, commitFlow]);

  // Handle manual edge connection (drag port to port)
  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
    const sourcePort = parsePort(connection.sourceHandle);
    const targetPort = parsePort(connection.targetHandle);
    if (!sourcePort || !targetPort) return;

    let mode: InteropConnector['mode'] = 'context';
    let contextType: string | undefined;
    let intentName: string | undefined;

    if (sourcePort.kind === 'context-out' && targetPort.kind === 'context-in') {
      mode = 'context'; contextType = sourcePort.value;
    } else if (sourcePort.kind === 'intent-out' && targetPort.kind === 'intent-in') {
      mode = 'intent'; intentName = sourcePort.value;
    } else if (sourcePort.kind === 'context-out' && targetPort.kind === 'intent-in') {
      mode = 'context-to-intent'; contextType = sourcePort.value; intentName = targetPort.value;
    } else {
      return;
    }

    const newConnector: InteropConnector = {
      id: `connector-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      sourceAppId: connection.source,
      targetAppId: connection.target,
      sourcePortId: connection.sourceHandle,
      targetPortId: connection.targetHandle,
      mode, contextType, intentName, enabled: true,
    };

    const validation = validateConnector(newConnector, flowRef.current.nodes);
    if (!validation.valid) console.warn(`Invalid connector: ${validation.message}`);
    commitFlow({ ...flowRef.current, connectors: [...flowRef.current.connectors, newConnector] });
  }, [commitFlow]);

  const handleEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
    const ids = new Set(edgesToDelete.map((e) => e.id));
    commitFlow({ ...flowRef.current, connectors: flowRef.current.connectors.filter((c) => !ids.has(c.id)) });
  }, [commitFlow]);

  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setSelectedEdgeId(edge.id);
  }, []);

  const handleClosePanel = useCallback(() => setSelectedEdgeId(null), []);

  const handleDeleteConnector = useCallback((connectorId: string) => {
    commitFlow({ ...flowRef.current, connectors: flowRef.current.connectors.filter((c) => c.id !== connectorId) });
  }, [commitFlow]);

  const selectedConnector = selectedEdgeId ? flow.connectors.find((c) => c.id === selectedEdgeId) : null;
  const selectedValidation = selectedConnector ? validationMap.get(selectedConnector.id) : null;

  useEffect(() => { onFlowChange?.(flow); }, [flow, onFlowChange]);

  if (appIds.length === 0) {
    return (
      <div className="interop-flow-shell flex items-center justify-center p-6" data-theme={theme}>
        <Card className="max-w-xl text-center">
          <CardContent className="flex flex-col items-center gap-3 p-8">
            <Badge variant="outline" className="h-12 w-12 justify-center rounded-lg px-0 text-sm font-black">IF</Badge>
            <h3 className="text-base font-black text-foreground">Empty Workspace</h3>
            <p className="max-w-md text-xs font-semibold leading-5 text-muted-foreground">
            {workspaceName} has no apps yet, so there is no interop graph to configure.
            Add apps in Workspace mode and the flow canvas will react automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="interop-flow-shell" data-theme={theme}>
      <FlowToolbar
        workspaceName={workspaceName}
        appCount={appIds.length}
        canAutoWire={appIds.length > 1}
        onAutoWire={autoWireFlow}
        flowEnabled={flow.enabled}
        onToggleFlowEnabled={(enabled) => commitFlow({ ...flow, enabled })}
        connectorCount={flow.connectors.length}
        validationCount={validations.filter((v) => !v.valid).length}
      />

      <div className="relative min-h-0 flex-1">
        <ReactFlow<FlowNode, FlowEdge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onEdgesDelete={handleEdgesDelete}
          onEdgeClick={handleEdgeClick}
          nodeTypes={nodeTypes as never}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background color="var(--interop-grid-line)" gap={20} size={1} />
          <Controls />
          <MiniMap
            position="bottom-right"
            style={{
              backgroundColor: 'var(--interop-minimap-bg)',
              border: '1px solid var(--interop-border)',
              borderRadius: 8,
              height: 100,
              width: 140,
            }}
          />
        </ReactFlow>

        {selectedConnector && (
          <ConnectorConfigPanel
            connector={selectedConnector}
            validation={selectedValidation ?? undefined}
            flow={flow}
            onUpdate={updateConnector}
            onDelete={handleDeleteConnector}
            onClose={handleClosePanel}
          />
        )}
      </div>

      {/* Validation summary */}
      {validations.some((v) => !v.valid) && (
        <Card className="m-3 mt-0 border-red-500/40 bg-red-500/10">
          <CardContent className="p-3 text-xs text-red-500">
            <strong>⚠ {validations.filter((v) => !v.valid).length} invalid connector(s):</strong>
            <ul className="mt-1.5 list-none pl-5">
            {validations
              .filter((v) => !v.valid)
              .map((v) => (
                <li key={v.connectorId}>{v.message}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function connectorDisplayLabel(connector: InteropConnector): string {
  if (connector.mode === 'context-to-intent' && connector.contextType && connector.intentName) {
    return `${contextLabel(connector.contextType)} -> ${intentLabel(connector.intentName)}`;
  }
  if (connector.mode === 'intent' && connector.intentName) {
    return intentLabel(connector.intentName);
  }
  if (connector.contextType) {
    return contextLabel(connector.contextType);
  }
  if (connector.intentName) {
    return intentLabel(connector.intentName);
  }
  return connector.mode;
}
