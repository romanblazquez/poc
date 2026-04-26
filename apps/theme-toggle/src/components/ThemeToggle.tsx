import { useCallback, useEffect, useState } from 'react';
import type { ThemeContext } from '@fdc3-poc/fdc3-core';
import { AppHeader } from '@fdc3-poc/shared-ui';

type ThemeName = 'light' | 'dark';

const palettes = {
  light: { background: '#f7f9fc', panel: '#ffffff', text: '#172033', muted: '#667085', border: '#d9e1ec', accent: '#2563eb' },
  dark: { background: '#101720', panel: '#192231', text: '#eef4fb', muted: '#a9b6c6', border: '#34465c', accent: '#60a5fa' },
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>('light');
  const [status, setStatus] = useState('Ready');
  const colors = palettes[theme];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!window.fdc3) return;
    const unsubscribe = window.fdc3.addContextListener<ThemeContext>('com.demo.theme', (ctx) => {
      setTheme(ctx.theme);
      document.documentElement.dataset.theme = ctx.theme;
      setStatus(`Received ${ctx.theme}`);
    });
    return unsubscribe;
  }, []);

  const broadcastTheme = useCallback(async (nextTheme: ThemeName) => {
    setTheme(nextTheme);
    setStatus('Broadcasting...');
    if (!window.fdc3) {
      setStatus('FDC3 unavailable');
      return;
    }
    await window.fdc3.broadcast({
      type: 'com.demo.theme',
      name: `${nextTheme} theme`,
      theme: nextTheme,
    } satisfies ThemeContext);
    setStatus(`Broadcast ${nextTheme}`);
  }, []);

  return (
    <div className="workstation-app" style={{ background: colors.background, color: colors.text }}>
      <AppHeader title="Theme" icon="◐" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 14, gap: 10 }}>
        <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 6, padding: 12 }}>
          <div className="workstation-label" style={{ color: colors.muted, marginBottom: 8 }}>Workspace Theme</div>
          <button
            role="switch"
            aria-checked={theme === 'dark'}
            className="workstation-switch"
            onClick={() => void broadcastTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Broadcast workspace theme"
          >
            <span className="workstation-switch__knob" />
            <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
        <div style={{ color: colors.muted, fontSize: 12, fontWeight: 700 }}>{status}</div>
      </div>
    </div>
  );
}
