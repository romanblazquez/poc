import type { Node, NodeProps } from '@xyflow/react';
import { contextInPort, contextOutPort, intentInPort, intentOutPort } from '../model/connector-types.js';
import type { InteropAppNode } from '../model/interop-flow-types.js';
import { ContextPort } from './ContextPort.js';
import { IntentPort } from './IntentPort.js';

type AppNodeData = InteropAppNode & Record<string, unknown>;
type AppFlowNode = Node<AppNodeData, 'app'>;

export function AppNode({ data }: NodeProps<AppFlowNode>) {
  return (
    <div className="interop-app-node">
      <div className="interop-app-node-title">
        <span className="interop-app-node-icon">{data.icon ?? data.label.slice(0, 2).toUpperCase()}</span>
        <strong>{data.label}</strong>
      </div>
      <div className="interop-app-node-grid">
        <div>
          <div className="interop-port-heading">Inputs</div>
          {data.capabilities.listensTo.map((schema) => (
            <ContextPort key={schema.type} id={contextInPort(schema.type)} type="target" side="left" label={schema.label} />
          ))}
          {data.capabilities.handlesIntents.map((schema) => (
            <IntentPort key={schema.name} id={intentInPort(schema.name)} type="target" side="left" label={schema.label} />
          ))}
        </div>
        <div>
          <div className="interop-port-heading interop-port-heading-right">Outputs</div>
          {data.capabilities.broadcasts.map((schema) => (
            <ContextPort key={schema.type} id={contextOutPort(schema.type)} type="source" side="right" label={schema.label} />
          ))}
          {data.capabilities.raisesIntents.map((schema) => (
            <IntentPort key={schema.name} id={intentOutPort(schema.name)} type="source" side="right" label={schema.label} />
          ))}
        </div>
      </div>
    </div>
  );
}
