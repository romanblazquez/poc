import React from 'react';

interface WorkspaceToolbarProps {
  onSave: () => void;
  saveStatus: string;
}

export function WorkspaceToolbar({ onSave, saveStatus }: WorkspaceToolbarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {saveStatus && (
        <span style={{ color: 'var(--shell-positive)', fontSize: 12, fontWeight: 800 }}>{saveStatus}</span>
      )}
      <button
        onClick={onSave}
        style={{
          padding: '5px 12px',
          background: 'var(--shell-panel-2)',
          border: '1px solid var(--shell-border)',
          borderRadius: 6,
          color: 'var(--shell-text)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        💾 Save Workspace
      </button>
    </div>
  );
}
