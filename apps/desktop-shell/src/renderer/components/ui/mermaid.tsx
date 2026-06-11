import * as React from 'react';
import mermaid from 'mermaid';
import { cn } from '../../lib/utils.js';

// ── One-time initialization tied to the shell's dark theme ────────────────

let _initialized = false;

function ensureInit(): void {
  if (_initialized) return;
  _initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      // Matches the shell's dark CSS variables (oklch → hex approximations)
      background:           '#0e0e16',
      mainBkg:              '#18181f',
      nodeBorder:           'rgba(255,255,255,0.12)',
      clusterBkg:           '#1e1e28',
      titleColor:           '#f5f5fa',
      primaryColor:         '#1e1e2e',
      primaryTextColor:     '#e8e8f0',
      primaryBorderColor:   'rgba(255,255,255,0.15)',
      secondaryColor:       '#16161e',
      tertiaryColor:        '#1a1a24',
      lineColor:            'rgba(255,255,255,0.28)',
      edgeLabelBackground:  '#0e0e16',
      fontFamily:           'inherit',
      fontSize:             '12px',
    },
    securityLevel: 'loose',
    flowchart:   { curve: 'basis', htmlLabels: false },
    sequence:    { actorFontSize: 12, noteFontSize: 11, messageFontSize: 11 },
    er:          { fontSize: 12 },
  });
}

// ── Counter for unique render IDs ──────────────────────────────────────────

let _idCounter = 0;
function nextId(): string {
  return `mermaid-${++_idCounter}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export interface MermaidDiagramProps {
  /** Mermaid diagram definition string, e.g. "flowchart LR\n  A --> B" */
  definition: string;
  className?: string;
  /** Shown above the diagram — useful inside documentation cards */
  caption?: string;
}

export function MermaidDiagram({ definition, className, caption }: MermaidDiagramProps): React.JSX.Element {
  const [svg, setSvg] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);
  const idRef = React.useRef<string>(nextId());

  React.useEffect(() => {
    ensureInit();
    let cancelled = false;

    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(idRef.current, definition.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message ?? String(err));
          setSvg('');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [definition]);

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/40 bg-destructive/5 p-3', className)}>
        {caption && <div className="mb-2 text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">{caption}</div>}
        <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-destructive">{error}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className={cn('flex min-h-16 items-center justify-center rounded-lg border border-border bg-muted/10', className)}>
        <span className="text-[11px] text-muted-foreground">Rendering diagram…</span>
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border bg-muted/10 p-4', className)}>
      {caption && (
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.06em] text-muted-foreground">{caption}</div>
      )}
      {/* SVG comes from mermaid — sanitized via securityLevel:loose, no user content */}
      {/* eslint-disable-next-line react/no-danger */}
      <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
