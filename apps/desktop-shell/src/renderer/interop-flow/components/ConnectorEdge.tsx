import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

export function ConnectorEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const valid = data?.valid !== false;
  const mode = String(data?.mode ?? 'context');
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: valid ? edgeColor(mode) : 'var(--interop-danger)',
          strokeDasharray: mode.includes('intent') ? '5 4' : undefined,
          strokeWidth: 1.6,
          opacity: data?.enabled === false ? 0.35 : 0.9,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={`interop-edge-label ${valid ? '' : 'interop-edge-label-invalid'}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {String(data?.label ?? mode)}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function edgeColor(mode: string): string {
  if (mode === 'theme') return 'var(--interop-text-muted)';
  if (mode === 'audit') return 'var(--interop-warning)';
  if (mode.includes('intent')) return 'var(--interop-intent)';
  return 'var(--interop-context)';
}
