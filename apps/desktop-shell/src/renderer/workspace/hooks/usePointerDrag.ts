import type { RefObject } from 'react';

export function getPointerDeltaPercent(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  canvasRef: RefObject<HTMLElement>,
): { dx: number; dy: number } {
  const rect = canvasRef.current?.getBoundingClientRect();
  if (!rect) return { dx: 0, dy: 0 };
  return {
    dx: ((clientX - startX) / rect.width) * 100,
    dy: ((clientY - startY) / rect.height) * 100,
  };
}

