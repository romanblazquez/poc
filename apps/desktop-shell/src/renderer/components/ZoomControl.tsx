import React, { useEffect, useState, useCallback } from 'react';

/**
 * Shell-wide zoom control. Drives `window.shellChrome.setZoom(factor)` which
 * the main process broadcasts to every preload-injected webContents — shell
 * renderer, detached workspace windows, AND embedded `<webview>` apps — so a
 * single click resizes the entire trader desktop in lockstep.
 */
const STEP = 0.1;
const MIN = 0.5;
const MAX = 2.0;

interface ShellChromeAPI {
  getZoom(): Promise<number>;
  setZoom(factor: number): Promise<number>;
  onZoomChanged(handler: (factor: number) => void): () => void;
}

function clamp(f: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(f * 100) / 100));
}

export function ZoomControl(): React.JSX.Element | null {
  const api = (window as unknown as { shellChrome?: ShellChromeAPI }).shellChrome;
  const [zoom, setZoom] = useState<number>(1);

  useEffect(() => {
    if (!api) return;
    let alive = true;
    void api.getZoom().then((f) => { if (alive) setZoom(f); });
    const unsub = api.onZoomChanged((f) => setZoom(f));
    return () => { alive = false; unsub(); };
  }, [api]);

  const apply = useCallback(async (next: number) => {
    if (!api) return;
    await api.setZoom(clamp(next));
  }, [api]);

  if (!api) return null;
  const pct = Math.round(zoom * 100);

  const btn: React.CSSProperties = {
    width: 24, height: 22,
    padding: 0,
    background: 'var(--shell-panel-2)',
    border: '1px solid var(--shell-border)',
    color: 'var(--shell-text)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  };

  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 6, overflow: 'hidden', border: '0' }}
      title="Zoom the entire workspace"
      role="group"
      aria-label="Zoom"
    >
      <button
        type="button"
        onClick={() => void apply(zoom - STEP)}
        disabled={zoom <= MIN + 0.001}
        style={{ ...btn, borderTopLeftRadius: 6, borderBottomLeftRadius: 6, borderRight: 'none' }}
        aria-label="Zoom out"
      >−</button>
      <button
        type="button"
        onClick={() => void apply(1)}
        style={{ ...btn, width: 50, fontSize: 11, fontWeight: 800, letterSpacing: '0.02em' }}
        aria-label="Reset zoom"
        title={`Zoom ${pct}% (click to reset to 100%)`}
      >{pct}%</button>
      <button
        type="button"
        onClick={() => void apply(zoom + STEP)}
        disabled={zoom >= MAX - 0.001}
        style={{ ...btn, borderTopRightRadius: 6, borderBottomRightRadius: 6, borderLeft: 'none' }}
        aria-label="Zoom in"
      >+</button>
    </div>
  );
}
