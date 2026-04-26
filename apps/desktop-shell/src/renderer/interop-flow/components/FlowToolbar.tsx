import React from 'react';

interface FlowToolbarProps {
  canAutoWire: boolean;
  onAutoWire: () => void;
  flowEnabled: boolean;
  onToggleFlowEnabled: (enabled: boolean) => void;
  connectorCount: number;
  validationCount: number;
}

export function FlowToolbar({
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
        background: '#0a0a18',
        borderBottom: '1px solid #1e1e3e',
        flexShrink: 0,
      }}
    >
      <button
        onClick={onAutoWire}
        disabled={!canAutoWire}
        title="Generate recommended Funds workflow (Incoming Orders → Funds Allocations → Audit Log + Theme to all)"
        style={{
          padding: '6px 12px',
          background: canAutoWire ? '#4080e8' : '#2a2a40',
          border: 'none',
          borderRadius: 4,
          color: canAutoWire ? '#fff' : '#808080',
          fontSize: 12,
          fontWeight: 600,
          cursor: canAutoWire ? 'pointer' : 'not-allowed',
          transition: 'background 0.2s',
        }}
      >
        Auto-wire Funds
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          background: '#1a1a30',
          borderRadius: 4,
          border: '1px solid #2a2a50',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#a0a0d0' }}>
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
          color: '#808090',
        }}
      >
        <span>Connectors: <strong style={{ color: '#a0a0d0' }}>{connectorCount}</strong></span>
        {validationCount > 0 && (
          <span style={{ color: '#ff8080' }}>
            Invalid: <strong>{validationCount}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
