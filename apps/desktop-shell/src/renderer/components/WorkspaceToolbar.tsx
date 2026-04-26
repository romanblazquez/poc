import React from 'react';

interface WorkspaceToolbarProps {
  onSave: () => void;
  saveStatus: string;
}

export function WorkspaceToolbar({ onSave, saveStatus }: WorkspaceToolbarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {saveStatus && (
        <span style={{ color: '#40c080', fontSize: 12, fontWeight: 500 }}>{saveStatus}</span>
      )}
      <button
        onClick={onSave}
        style={{
          padding: '5px 12px',
          background: '#1e2a4a',
          border: '1px solid #2a3a6a',
          borderRadius: 6,
          color: '#a0b0d0',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
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
