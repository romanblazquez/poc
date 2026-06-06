import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Switch } from '../../components/ui/switch.js';

interface FlowToolbarProps {
  workspaceName: string;
  appCount: number;
  canAutoWire: boolean;
  onAutoWire: () => void;
  flowEnabled: boolean;
  onToggleFlowEnabled: (enabled: boolean) => void;
  connectorCount: number;
  validationCount: number;
}

export function FlowToolbar({
  workspaceName,
  appCount,
  canAutoWire,
  onAutoWire,
  flowEnabled,
  onToggleFlowEnabled,
  connectorCount,
  validationCount,
}: FlowToolbarProps) {
  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="truncate text-xs font-extrabold text-foreground">{workspaceName}</div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {appCount} app{appCount === 1 ? '' : 's'} in this workspace
        </div>
      </div>

      <Button
        onClick={onAutoWire}
        disabled={!canAutoWire}
        title="Generate compatible FDC3 connectors automatically from app context and intent capabilities"
        size="sm"
      >
        Auto-wire FDC3
      </Button>

      <div className="flex items-center gap-2 rounded-md border border-border bg-secondary px-2 py-1">
        <label className="flex items-center gap-2 text-[11px] font-bold text-foreground">
          <Switch
            checked={flowEnabled}
            onCheckedChange={onToggleFlowEnabled}
            aria-label="Toggle interop flow"
          />
          <span>Flow Active</span>
        </label>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="secondary">Connectors: {connectorCount}</Badge>
        {validationCount > 0 && (
          <Badge variant="destructive">Invalid: {validationCount}</Badge>
        )}
      </div>
    </div>
  );
}
