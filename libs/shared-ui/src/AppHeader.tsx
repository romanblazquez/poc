import React from 'react';
import { ChannelPicker } from './ChannelPicker.js';
import type { UserChannel } from '@fdc3-poc/fdc3-core';

interface AppHeaderProps {
  title: string;
  icon?: string;
  onChannelChange?: (channel: UserChannel | null) => void;
  children?: React.ReactNode;
}

export function AppHeader({ title, icon, onChannelChange, children }: AppHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: '#16213e',
        borderBottom: '1px solid #2a2a5a',
        height: 48,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
        <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 15, letterSpacing: 0.3 }}>
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {children}
        <ChannelPicker onChannelChange={onChannelChange} />
      </div>
    </div>
  );
}
