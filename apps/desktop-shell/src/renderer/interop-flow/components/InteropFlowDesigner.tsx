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
  type Connection,
  type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { AppEntry } from '../../App.js';
import { validateConnector, validateFlow } from '../engine/flow-validator.js';
import { createInteropNodes } from '../engine/connector-resolver.js';
import { parsePort } from '../model/connector-types.js';
import type { InteropConnector, InteropFlowDefinition } from '../model/interop-flow-types.js';
import { contextInPort, contextOutPort, intentInPort, intentOutPort } from '../model/connector-types.js';
import { AppNode } from './AppNode.js';
import { ConnectorEdge } from './ConnectorEdge.js';
import { FlowToolbar } from './FlowToolbar.js';
import { ConnectorConfigPanel } from './ConnectorConfigPanel.js';
import { useInteropFlow } from '../hooks/useInteropFlow.js';
import '../styles/interop-flow.css';

interface InteropFlowDesignerProps {
  apps: AppEntry[];
  workspaceTabId: string;
  workspaceName: string;
  theme: string;
  appIds: string[];
  onFlowChange?: (flow: InteropFlowDefinition) => void;
}

const nodeTypes = { app: AppNode };
const edgeTypes = { connector: ConnectorEdge };

export function InteropFlowDesigner({ apps, workspaceTabId, workspaceName, theme, appIds, onFlowChange }: InteropFlowDesignerProps) {
  const { flow, setFlow, commitFlow, autoWireFunds, updateConnector } = useInteropFlow(workspaceTabId, apps, appIds);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const validations = useMemo(() => validateFlow(flow), [flow]);
  const validationMap = useMemo(() => new Map(validations.map((v) => [v.connectorId, v])), [validations]);

  // Track node app IDs — only re-sync React Flow nodes when the set of apps changes, not on position updates.
  // Position updates during drag are owned by React Flow; we persist them on drag-stop only.
  const nodeAppIds = useMemo(() => flow.nodes.map((n) => n.appId).join(','), [flow.nodes]);
  const flowRef = useRef(flow);
  flowRef.current = flow;

  useEffect(() => {
    const flowNodes = flowRef.current.nodes.map((node) => ({
      id: node.appId,
      data: node,
      position: node.position,
      type: 'app',
      draggable: true,
      connectable: true,
    }));
    setNodes(flowNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeAppIds, setNodes]);

  // Convert flow connectors to React Flow edges
  useEffect(() => {
    const flowEdges = flow.connectors.map((connector) => {
      const validation = validationMap.get(connector.id);
      return {
        id: connector.id,
        source: connector.sourceAppId,
        target: connector.targetAppId,
        sourceHandle: connector.sourcePortId,
        targetHandle: connector.targetPortId,
        type: 'connector',
        data: {
          ...connector,
          valid: validation?.valid ?? false,
          label: connector.contextType ?? connector.intentName ?? connector.mode,
        },
        animated: connector.enabled,
        deletable: true,
      };
    });
    setEdges(flowEdges);
  }, [flow.connectors, validationMap, setEdges]);

  // Persist final node position when drag ends
  const handleNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    const current = flowRef.current;
    const updatedNodes = current.nodes.map((n) =>
      n.appId === node.id ? { ...n, position: node.position } : n
    );
    commitFlow({ ...current, nodes: updatedNodes });
  }, [commitFlow]);

  // Handle edge connection (user drags port to port)
  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
      return;
    }

    const sourcePort = parsePort(connection.sourceHandle);
    const targetPort = parsePort(connection.targetHandle);

    if (!sourcePort || !targetPort) {
      return;
    }

    // Determine mode based on port types
    let mode: InteropConnector['mode'] = 'context';
    let contextType: string | undefined;
    let intentName: string | undefined;

    if (sourcePort.kind === 'context-out' && targetPort.kind === 'context-in') {
      mode = 'context';
      contextType = sourcePort.value;
    } else if (sourcePort.kind === 'intent-out' && targetPort.kind === 'intent-in') {
      mode = 'intent';
      intentName = sourcePort.value;
    } else if (sourcePort.kind === 'context-out' && targetPort.kind === 'intent-in') {
      mode = 'context-to-intent';
      contextType = sourcePort.value;
      intentName = targetPort.value;
    } else {
      return; // Invalid connection
    }

    // Create new connector
    const newConnector: InteropConnector = {
      id: `connector-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      sourceAppId: connection.source,
      targetAppId: connection.target,
      sourcePortId: connection.sourceHandle,
      targetPortId: connection.targetHandle,
      mode,
      contextType,
      intentName,
      enabled: true,
    };

    // Validate before adding
    const validation = validateConnector(newConnector, flow.nodes);
    if (!validation.valid) {
      console.warn(`Invalid connector: ${validation.message}`);
    }

    commitFlow({ ...flow, connectors: [...flow.connectors, newConnector] });
  }, [flow, commitFlow]);

  // Handle edge deletion
  const handleEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
    const connectorIdsToDelete = new Set(edgesToDelete.map((e) => e.id));
    commitFlow({
      ...flow,
      connectors: flow.connectors.filter((c) => !connectorIdsToDelete.has(c.id)),
    });
  }, [flow, commitFlow]);

  // Handle edge click to open config panel
  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setSelectedEdgeId(edge.id);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  const selectedConnector = selectedEdgeId ? flow.connectors.find((c) => c.id === selectedEdgeId) : null;
  const selectedValidation = selectedConnector ? validationMap.get(selectedConnector.id) : null;

  useEffect(() => {
    onFlowChange?.(flow);
  }, [flow, onFlowChange]);

  if (appIds.length === 0) {
    return (
      <div className="interop-flow-shell" data-theme={theme}>
        <div className="interop-flow-empty-state">
          <div className="interop-flow-empty-badge">IF</div>
          <h3>Empty Workspace</h3>
          <p>
            {workspaceName} has no apps yet, so there is no interop graph to configure.
            Add apps in Workspace mode and the flow canvas will react automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="interop-flow-shell" data-theme={theme}>
      <FlowToolbar
        workspaceName={workspaceName}
        appCount={appIds.length}
        canAutoWire={appIds.includes('incoming-orders') && appIds.includes('funds-allocations')}
        onAutoWire={autoWireFunds}
        flowEnabled={flow.enabled}
        onToggleFlowEnabled={(enabled) => commitFlow({ ...flow, enabled })}
        connectorCount={flow.connectors.length}
        validationCount={validations.filter((v) => !v.valid).length}
      />

      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onEdgesDelete={handleEdgesDelete}
          onEdgeClick={handleEdgeClick}
          onNodeDragStop={handleNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background color="var(--interop-grid-line)" gap={20} size={1} />
          <Controls />
          <MiniMap
            position="bottom-right"
            width={140}
            height={100}
            style={{
              backgroundColor: 'var(--interop-minimap-bg)',
              border: '1px solid var(--interop-border)',
              borderRadius: 8,
            }}
          />
        </ReactFlow>

        {selectedConnector && (
          <ConnectorConfigPanel
            connector={selectedConnector}
            validation={selectedValidation}
            flow={flow}
            onUpdate={updateConnector}
            onClose={handleClosePanel}
          />
        )}
      </div>

      {/* Validation summary */}
      {validations.some((v) => !v.valid) && (
        <div className="interop-flow-validation-bar">
          <strong>⚠ {validations.filter((v) => !v.valid).length} invalid connector(s):</strong>
          <ul style={{ margin: '6px 0 0 20px', listStyle: 'none', padding: 0 }}>
            {validations
              .filter((v) => !v.valid)
              .map((v) => (
                <li key={v.connectorId}>{v.message}</li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
