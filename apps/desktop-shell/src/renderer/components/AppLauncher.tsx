import React from 'react';
import type { AppEntry } from '../App.js';

const CATEGORY_COLORS: Record<string, string> = {
  CRM: '#4080e8',
  Investments: '#40c080',
  Markets: '#e8d840',
  Payments: '#e84080',
};

interface AppLauncherProps {
  apps: AppEntry[];
  onOpen: (appId: string) => void;
}

export function AppLauncher({ apps, onOpen }: AppLauncherProps) {
  const categories = [...new Set(apps.map((a) => a.category ?? 'Other'))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {categories.map((cat) => (
        <div key={cat}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: CATEGORY_COLORS[cat] ?? '#8080a0',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                height: 1,
                width: 20,
                background: CATEGORY_COLORS[cat] ?? '#8080a0',
                opacity: 0.5,
              }}
            />
            {cat}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {apps
              .filter((a) => (a.category ?? 'Other') === cat)
              .map((app) => (
                <AppCard key={app.appId} app={app} onOpen={onOpen} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AppCard({ app, onOpen }: { app: AppEntry; onOpen: (id: string) => void }) {
  const [hover, setHover] = React.useState(false);

  return (
    <button
      onClick={() => onOpen(app.appId)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: 180,
        padding: '14px 16px',
        background: hover ? '#1e1e3e' : '#141428',
        border: `1px solid ${hover ? '#3a3a6a' : '#1e1e3e'}`,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: hover ? 'translateY(-1px)' : 'none',
        boxShadow: hover ? '0 4px 20px rgba(64, 128, 232, 0.15)' : 'none',
        textAlign: 'left',
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>{app.icon ?? '📱'}</div>
      <div style={{ color: '#d0d0f0', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
        {app.title}
      </div>
      {app.description && (
        <div style={{ color: '#606080', fontSize: 11, lineHeight: 1.4 }}>
          {app.description}
        </div>
      )}
    </button>
  );
}
