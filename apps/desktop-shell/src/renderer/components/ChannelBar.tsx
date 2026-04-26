import React, { useEffect, useState } from 'react';
import type { UserChannel } from '@fdc3-poc/fdc3-core';

interface ChannelBarProps {
  currentChannel: UserChannel | null;
  onChannelChange: (ch: UserChannel | null) => void;
}

export function ChannelBar({ currentChannel, onChannelChange }: ChannelBarProps) {
  const [channels, setChannels] = useState<UserChannel[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!window.fdc3) return;
    void window.fdc3.getUserChannels().then(setChannels);
  }, []);

  const join = async (id: string) => {
    await window.fdc3.joinUserChannel(id);
    const ch = channels.find((c) => c.id === id) ?? null;
    onChannelChange(ch);
    setOpen(false);
  };

  const leave = async () => {
    await window.fdc3.leaveCurrentChannel();
    onChannelChange(null);
    setOpen(false);
  };

  const dot = (color: string, size = 12) => ({
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  });

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px',
          borderRadius: 6,
          border: `1px solid ${currentChannel?.displayMetadata.color ?? 'var(--shell-border)'}`,
          background: currentChannel
            ? currentChannel.displayMetadata.color + '1a'
            : 'var(--shell-panel-2)',
          color: 'var(--shell-text)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        <span style={dot(currentChannel?.displayMetadata.color ?? '#444')} />
        {currentChannel ? currentChannel.displayMetadata.name : 'No Channel'}
        <span style={{ color: 'var(--shell-muted)', fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: 'var(--shell-panel)',
              border: '1px solid var(--shell-border)',
              borderRadius: 8,
              padding: 8,
              zIndex: 1000,
              minWidth: 180,
              boxShadow: 'var(--shell-shadow)',
            }}
          >
            <div style={{ color: 'var(--shell-muted)', fontSize: 10, fontWeight: 800, letterSpacing: 0, padding: '4px 8px 8px', textTransform: 'uppercase' }}>
              User Channels
            </div>
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => void join(ch.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  background:
                    currentChannel?.id === ch.id ? ch.displayMetadata.color + '22' : 'transparent',
                  border: 'none',
                  color: 'var(--shell-text)',
                  padding: '7px 10px',
                  cursor: 'pointer',
                  borderRadius: 6,
                  fontSize: 13,
                  textAlign: 'left',
                }}
              >
                <span style={dot(ch.displayMetadata.color, 14)} />
                {ch.displayMetadata.name}
                {currentChannel?.id === ch.id && (
                  <span style={{ marginLeft: 'auto', color: ch.displayMetadata.color, fontSize: 11 }}>✓</span>
                )}
              </button>
            ))}
            {currentChannel && (
              <>
                <div style={{ borderTop: '1px solid var(--shell-border)', margin: '6px 0' }} />
                <button
                  onClick={() => void leave()}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--shell-muted)',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    borderRadius: 6,
                    fontSize: 12,
                    textAlign: 'left',
                  }}
                >
                  Leave channel
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
