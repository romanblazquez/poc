import React, { useEffect, useState } from 'react';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import type { Fdc3DesktopAgent } from '@fdc3-poc/fdc3-core';

declare global {
  interface Window {
    fdc3: Fdc3DesktopAgent;
  }
}

interface ChannelPickerProps {
  onChannelChange?: (channel: UserChannel | null) => void;
}

export function ChannelPicker({ onChannelChange }: ChannelPickerProps) {
  const [channels, setChannels] = useState<UserChannel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<UserChannel | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void window.fdc3.getUserChannels().then(setChannels);
    void window.fdc3.getCurrentChannel().then(setCurrentChannel);
  }, []);

  const handleJoin = async (channelId: string) => {
    await window.fdc3.joinUserChannel(channelId);
    const ch = channels.find((c) => c.id === channelId) ?? null;
    setCurrentChannel(ch);
    onChannelChange?.(ch);
    setOpen(false);
  };

  const handleLeave = async () => {
    await window.fdc3.leaveCurrentChannel();
    setCurrentChannel(null);
    onChannelChange?.(null);
    setOpen(false);
  };

  const dot = (color: string) => ({
    display: 'inline-block',
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: color,
    marginRight: 6,
    verticalAlign: 'middle',
  });

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 10px',
          borderRadius: 6,
          border: `2px solid ${currentChannel?.displayMetadata.color ?? '#555'}`,
          background: currentChannel ? currentChannel.displayMetadata.color + '22' : '#2a2a3e',
          color: '#e0e0e0',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {currentChannel && (
          <span style={dot(currentChannel.displayMetadata.color)} />
        )}
        {currentChannel ? currentChannel.displayMetadata.name : 'No Channel'}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            right: 0,
            background: '#1e1e2e',
            border: '1px solid #444',
            borderRadius: 8,
            padding: 8,
            zIndex: 1000,
            minWidth: 160,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => void handleJoin(ch.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                background:
                  currentChannel?.id === ch.id ? ch.displayMetadata.color + '33' : 'transparent',
                border: 'none',
                color: '#e0e0e0',
                padding: '6px 10px',
                cursor: 'pointer',
                borderRadius: 4,
                fontSize: 13,
                textAlign: 'left',
              }}
            >
              <span style={dot(ch.displayMetadata.color)} />
              {ch.displayMetadata.name}
            </button>
          ))}
          {currentChannel && (
            <>
              <div style={{ borderTop: '1px solid #444', margin: '6px 0' }} />
              <button
                onClick={() => void handleLeave()}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: '#aaa',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  borderRadius: 4,
                  fontSize: 12,
                  textAlign: 'left',
                }}
              >
                Leave channel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
