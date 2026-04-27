import React from 'react';

interface FlowToolbarProps {
  workspaceName: string;
  appCount: number;
  canAutoWire: boolean;
  onAutoWire: () => void;
  flowEnabled: boolean;
  onToggleFlowEnabled: (enabled: boolean) => void;
  connectorCount: number;
  validationCount: number;
}

export function FlowToolbar({
  workspaceName,
  appCount,
  canAutoWire,
  onAutoWire,
  flowEnabled,
  onToggleFlowEnabled,
  connectorCount,
  validationCount,
}: FlowToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--interop-panel)',
        borderBottom: '1px solid var(--interop-border)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ color: 'var(--interop-text-strong)', fontSize: 12, fontWeight: 800 }}>{workspaceName}</div>
        <div style={{ color: 'var(--interop-text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {appCount} app{appCount === 1 ? '' : 's'} in this workspace
        </div>
      </div>

      <button
        onClick={onAutoWire}
        disabled={!canAutoWire}
        title="Generate compatible FDC3 connectors automatically from app context and intent capabilities"
        style={{
          padding: '6px 12px',
          background: canAutoWire ? 'var(--interop-accent)' : 'var(--interop-panel-2)',
          border: `1px solid ${canAutoWire ? 'var(--interop-accent-border)' : 'var(--interop-border)'}`,
          borderRadius: 6,
          color: canAutoWire ? 'var(--interop-accent-contrast)' : 'var(--interop-text-muted)',
          fontSize: 12,
          fontWeight: 700,
          cursor: canAutoWire ? 'pointer' : 'not-allowed',
          transition: 'background 0.2s',
        }}
      >
        Auto-wire FDC3
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          background: 'var(--interop-panel-2)',
          borderRadius: 6,
          border: '1px solid var(--interop-border)',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--interop-text)' }}>
          <input
            type="checkbox"
            checked={flowEnabled}
            onChange={(e) => onToggleFlowEnabled(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span>Flow Active</span>
        </label>
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontSize: 11,
          color: 'var(--interop-text-muted)',
        }}
      >
        <span>Connectors: <strong style={{ color: 'var(--interop-text-strong)' }}>{connectorCount}</strong></span>
        {validationCount > 0 && (
          <span style={{ color: 'var(--interop-danger)' }}>
            Invalid: <strong>{validationCount}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
