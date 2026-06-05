import React from 'react';

interface HotkeyHelpProps {
  open: boolean;
  onClose(): void;
}

const HOTKEYS = [
  { key: 'Cmd/Ctrl+1', label: 'Workspace' },
  { key: 'Cmd/Ctrl+2', label: 'Interop Flow' },
  { key: 'Cmd/Ctrl+3', label: 'Command Center' },
  { key: 'Cmd/Ctrl+4', label: 'Insights' },
  { key: 'Cmd/Ctrl+5', label: 'Manager' },
  { key: 'Cmd/Ctrl+6', label: 'Bridge' },
  { key: 'Cmd/Ctrl+0', label: 'App Launcher' },
  { key: 'Cmd/Ctrl+K', label: 'Ask the Desktop' },
  { key: 'Cmd/Ctrl+B', label: 'Notifications drawer' },
  { key: 'Cmd/Ctrl+/', label: 'Hotkeys' },
];

export function HotkeyHelp({ open, onClose }: HotkeyHelpProps): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        alignItems: 'flex-start',
        background: 'rgba(5, 8, 13, 0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        inset: 0,
        justifyContent: 'center',
        paddingTop: '14vh',
        position: 'fixed',
        zIndex: 9300,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, var(--shell-panel), var(--shell-panel-2))',
          border: '1px solid var(--shell-border)',
          borderRadius: 12,
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
          color: 'var(--shell-text)',
          maxWidth: '92vw',
          overflow: 'hidden',
          width: 460,
        }}
      >
        <div
          style={{
            alignItems: 'center',
            borderBottom: '1px solid var(--shell-border)',
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 14px',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 900 }}>Keyboard Shortcuts</div>
            <div style={{ color: 'var(--shell-muted)', fontSize: 11, fontWeight: 700 }}>
              Shell-level navigation and desk utilities.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--shell-border)',
              borderRadius: 6,
              color: 'var(--shell-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 900,
              height: 26,
              width: 26,
            }}
          >
            x
          </button>
        </div>

        <div style={{ display: 'grid', gap: 0, padding: '6px 0' }}>
          {HOTKEYS.map((item) => (
            <div
              key={item.key}
              style={{
                alignItems: 'center',
                borderBottom: '1px solid var(--shell-border)',
                display: 'grid',
                gridTemplateColumns: '150px 1fr',
                padding: '9px 14px',
              }}
            >
              <kbd
                style={{
                  background: 'var(--shell-panel-2)',
                  border: '1px solid var(--shell-border)',
                  borderRadius: 6,
                  color: 'var(--shell-text)',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 11,
                  fontWeight: 850,
                  justifySelf: 'start',
                  padding: '4px 7px',
                }}
              >
                {item.key}
              </kbd>
              <span style={{ color: 'var(--shell-text)', fontSize: 12, fontWeight: 750 }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
