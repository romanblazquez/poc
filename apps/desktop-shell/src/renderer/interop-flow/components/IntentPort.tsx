import { Handle, Position } from '@xyflow/react';

interface IntentPortProps {
  id: string;
  label: string;
  side: 'left' | 'right';
  type: 'source' | 'target';
}

export function IntentPort({ id, label, side, type }: IntentPortProps) {
  return (
    <div className={`interop-port interop-port-${side} interop-port-intent`}>
      {side === 'left' && <Handle id={id} type={type} position={Position.Left} className="interop-handle interop-handle-intent" />}
      <span>{label}</span>
      {side === 'right' && <Handle id={id} type={type} position={Position.Right} className="interop-handle interop-handle-intent" />}
    </div>
  );
}
