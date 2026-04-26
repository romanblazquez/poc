import React from 'react';

interface StatusBadgeProps {
  label: string;
  variant: 'success' | 'warning' | 'error' | 'neutral';
}

const COLORS: Record<StatusBadgeProps['variant'], { bg: string; text: string }> = {
  success: { bg: '#1a4a2e', text: '#4ade80' },
  warning: { bg: '#4a3a1a', text: '#fbbf24' },
  error: { bg: '#4a1a1a', text: '#f87171' },
  neutral: { bg: '#2a2a3e', text: '#a0a0c0' },
};

export function StatusBadge({ label, variant }: StatusBadgeProps) {
  const { bg, text } = COLORS[variant];
  return (
    <span
      style={{
        background: bg,
        color: text,
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}
