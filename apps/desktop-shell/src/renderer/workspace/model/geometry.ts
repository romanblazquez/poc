export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Edge = 'left' | 'right' | 'top' | 'bottom';

export function right(rect: Rect): number {
  return rect.x + rect.width;
}

export function bottom(rect: Rect): number {
  return rect.y + rect.height;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return rangesOverlap(a.x, right(a), b.x, right(b)) && rangesOverlap(a.y, bottom(a), b.y, bottom(b));
}

export function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const maxRight = Math.max(...rects.map(right));
  const maxBottom = Math.max(...rects.map(bottom));
  return { x, y, width: maxRight - x, height: maxBottom - y };
}

export function moveRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

export function snapValue(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function normalizeRect(rect: Rect): Rect {
  return {
    x: Number(rect.x.toFixed(3)),
    y: Number(rect.y.toFixed(3)),
    width: Number(rect.width.toFixed(3)),
    height: Number(rect.height.toFixed(3)),
  };
}

