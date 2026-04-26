import { Handle, Position } from '@xyflow/react';

interface ContextPortProps {
  id: string;
  label: string;
  side: 'left' | 'right';
  type: 'source' | 'target';
}

export function ContextPort({ id, label, side, type }: ContextPortProps) {
  return (
    <div className={`interop-port interop-port-${side}`}>
      {side === 'left' && <Handle id={id} type={type} position={Position.Left} className="interop-handle interop-handle-context" />}
      <span>{label}</span>
      {side === 'right' && <Handle id={id} type={type} position={Position.Right} className="interop-handle interop-handle-context" />}
    </div>
  );
}
