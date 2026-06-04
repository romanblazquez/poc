/**
 * Factory for an AG Grid cell renderer that paints an SVG sparkline.
 *
 * Decoupled from `ag-grid-community` types intentionally — consumers pass
 * their own column definition with `cellRenderer: interopSparklineCellRenderer(...)`
 * and it works against any AG Grid version. The same renderer is what
 * `apps/market-watch` uses today; extracting it here means every consumer
 * gets the polished version "for free".
 */

export interface SparklineRendererOptions {
  /** Field on the row that holds the numeric history array. Default: `'history'`. */
  field?: string;
  /** Width of the rendered SVG in CSS pixels. Default: 96. */
  width?: number;
  /** Height of the rendered SVG in CSS pixels. Default: 22. */
  height?: number;
  /** Override the up/down threshold logic. Default: compares last vs. first sample. */
  trend?: (history: readonly number[]) => 'up' | 'down' | 'flat';
}

interface CellRendererParams {
  data?: Record<string, unknown>;
}

const DEFAULT_TREND = (h: readonly number[]): 'up' | 'down' | 'flat' => {
  if (h.length < 2) return 'flat';
  const first = h[0];
  const last = h[h.length - 1];
  return last > first ? 'up' : last < first ? 'down' : 'flat';
};

/**
 * Build an AG Grid `cellRenderer` function. The returned function is type-erased
 * (`(params: any) => HTMLElement`) so it slots into any `ColDef.cellRenderer`.
 *
 * @example
 *   {
 *     headerName: 'Spark',
 *     valueGetter: ({ data }) => data?.history?.join(','), // forces re-render on history change
 *     cellRenderer: interopSparklineCellRenderer({ field: 'history' }),
 *   }
 */
export function interopSparklineCellRenderer(
  options: SparklineRendererOptions = {},
): (params: CellRendererParams) => HTMLElement {
  const field = options.field ?? 'history';
  const width = options.width ?? 96;
  const height = options.height ?? 22;
  const trendFn = options.trend ?? DEFAULT_TREND;

  return (params: CellRendererParams): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;padding:2px 4px';
    const row = params.data;
    if (!row) return wrap;
    const history = row[field];
    if (!Array.isArray(history) || history.length < 2) return wrap;
    const series = history.filter((n): n is number => typeof n === 'number');
    if (series.length < 2) return wrap;

    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = Math.max(max - min, 0.0001);
    const points = series
      .map((p, i) => {
        const x = (i / (series.length - 1)) * width;
        const y = (1 - (p - min) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const direction = trendFn(series);
    const stroke =
      direction === 'up' ? 'var(--interop-positive, var(--ws-positive, #0f8a4b))'
      : direction === 'down' ? 'var(--interop-negative, var(--ws-negative, #b42318))'
      : 'var(--interop-muted, var(--ws-muted, #8d93b8))';

    wrap.innerHTML = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block">
        <polyline fill="none" stroke="${stroke}" stroke-width="1.4" points="${points}" />
      </svg>
    `;
    return wrap;
  };
}
