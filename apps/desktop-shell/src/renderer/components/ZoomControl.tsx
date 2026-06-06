import React, { useEffect, useState, useCallback } from 'react';
import { Button } from './ui/button.js';

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

  return (
    <div
      className="inline-flex items-stretch overflow-hidden rounded-md border"
      title="Zoom the entire workspace"
      role="group"
      aria-label="Zoom"
    >
      <Button
        type="button"
        onClick={() => void apply(zoom - STEP)}
        disabled={zoom <= MIN + 0.001}
        className="h-7 w-7 rounded-none border-0 border-r px-0"
        size="icon-sm"
        variant="secondary"
        aria-label="Zoom out"
      >−</Button>
      <Button
        type="button"
        onClick={() => void apply(1)}
        className="h-7 w-14 rounded-none border-0 border-r px-0 text-xs"
        size="icon-sm"
        variant="secondary"
        aria-label="Reset zoom"
        title={`Zoom ${pct}% (click to reset to 100%)`}
      >{pct}%</Button>
      <Button
        type="button"
        onClick={() => void apply(zoom + STEP)}
        disabled={zoom >= MAX - 0.001}
        className="h-7 w-7 rounded-none border-0 px-0"
        size="icon-sm"
        variant="secondary"
        aria-label="Zoom in"
      >+</Button>
    </div>
  );
}
