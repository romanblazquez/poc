import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import type { InteropConnector, InteropFlowDefinition, ConnectorValidation } from '../model/interop-flow-types.js';
import { validateConnector } from '../engine/flow-validator.js';
import { contextLabel, intentLabel } from '../model/fdc3-schema.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Switch } from '../../components/ui/switch.js';
import { cn } from '../../lib/utils.js';

interface ConnectorConfigPanelProps {
  connector: InteropConnector;
  validation: ConnectorValidation | undefined;
  flow: InteropFlowDefinition;
  onUpdate: (connectorId: string, updater: (c: InteropConnector) => InteropConnector) => void;
  onDelete: (connectorId: string) => void;
  onClose: () => void;
}

type Draft = Pick<InteropConnector, 'mode' | 'contextType' | 'intentName' | 'enabled'>;

function draftFrom(c: InteropConnector): Draft {
  return { mode: c.mode, contextType: c.contextType, intentName: c.intentName, enabled: c.enabled };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return a.mode === b.mode && a.contextType === b.contextType && a.intentName === b.intentName && a.enabled === b.enabled;
}

export function ConnectorConfigPanel({
  connector,
  flow,
  onUpdate,
  onDelete,
  onClose,
}: ConnectorConfigPanelProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(connector));

  // Reset draft when a different connector is opened
  useEffect(() => {
    setDraft(draftFrom(connector));
  }, [connector.id]);

  const sourceNode = flow.nodes.find((n) => n.appId === connector.sourceAppId);
  const targetNode = flow.nodes.find((n) => n.appId === connector.targetAppId);

  const availableContextTypes = useMemo(() => {
    if (draft.mode === 'context' || draft.mode === 'theme' || draft.mode === 'audit' || draft.mode === 'context-to-intent') {
      return sourceNode?.capabilities.broadcasts.map((s) => s.type) ?? [];
    }
    return [];
  }, [draft.mode, sourceNode]);

  const availableIntentNames = useMemo(() => {
    if (draft.mode === 'intent') {
      return sourceNode?.capabilities.raisesIntents.map((s) => s.name) ?? [];
    }
    if (draft.mode === 'context-to-intent') {
      return targetNode?.capabilities.handlesIntents.map((s) => s.name) ?? [];
    }
    return [];
  }, [draft.mode, sourceNode, targetNode]);

  // Validate the draft in real time
  const draftValidation = useMemo((): ConnectorValidation => {
    const provisional: InteropConnector = { ...connector, ...draft };
    return validateConnector(provisional, flow.nodes);
  }, [connector, draft, flow.nodes]);

  const isDirty = !draftsEqual(draft, draftFrom(connector));
  const canSave = isDirty && draftValidation.valid;

  const handleChangeMode = (newMode: string) => {
    setDraft((d) => ({ ...d, mode: newMode as InteropConnector['mode'], contextType: undefined, intentName: undefined }));
  };

  const handleChangeContextType = (newType: string) => {
    setDraft((d) => ({ ...d, contextType: newType }));
  };

  const handleChangeIntentName = (newName: string) => {
    setDraft((d) => ({ ...d, intentName: newName }));
  };

  const handleToggleEnabled = (enabled: boolean) => {
    setDraft((d) => ({ ...d, enabled }));
  };

  const handleSave = useCallback(() => {
    const saved = { ...draft };
    onUpdate(connector.id, (c) => ({ ...c, ...saved }));
    onClose();
  }, [connector.id, draft, onUpdate, onClose]);

  const handleDiscard = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDelete = useCallback(() => {
    if (confirm('Delete this connector?')) {
      onDelete(connector.id);
      onClose();
    }
  }, [connector.id, onDelete, onClose]);

  return (
    <Card className="absolute right-4 top-[60px] z-[1000] max-h-[calc(100%-76px)] w-[min(380px,calc(100vw-32px))] overflow-hidden shadow-2xl">
      {/* Header */}
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-xs">Connector Config</CardTitle>
          <span className={cn('text-[9px] font-semibold', isDirty ? 'text-amber-500' : 'text-muted-foreground')}>
            {isDirty ? 'Unsaved changes' : 'No changes'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleDiscard}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          ×
        </button>
      </CardHeader>

      {/* Content */}
      <CardContent className="flex max-h-[calc(100vh-156px)] flex-col gap-3 overflow-y-auto p-4 scrollbar-thin">
        {/* Source & Target */}
        <div className="rounded-md border border-border bg-secondary/50 p-2 text-[11px] text-foreground">
          <div><span className="text-muted-foreground">From:</span> <strong>{sourceNode?.label}</strong></div>
          <div><span className="text-muted-foreground">To:</span> <strong>{targetNode?.label}</strong></div>
        </div>

        {/* Mode selector */}
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Mode</label>
          <Select value={draft.mode} onValueChange={handleChangeMode}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="context">Context</SelectItem>
              <SelectItem value="intent">Intent</SelectItem>
              <SelectItem value="context-to-intent">Context→Intent</SelectItem>
              <SelectItem value="theme">Theme</SelectItem>
              <SelectItem value="audit">Audit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Context type selector */}
        {(draft.mode === 'context' || draft.mode === 'theme' || draft.mode === 'audit' || draft.mode === 'context-to-intent') && (
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Context Type</label>
            <Select value={draft.contextType ?? ''} onValueChange={handleChangeContextType}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="-- Select context --" />
              </SelectTrigger>
              <SelectContent>
                {availableContextTypes.map((type) => (
                  <SelectItem key={type} value={type}>{contextLabel(type)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Intent name selector */}
        {(draft.mode === 'intent' || draft.mode === 'context-to-intent') && (
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Intent</label>
            <Select value={draft.intentName ?? ''} onValueChange={handleChangeIntentName}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="-- Select intent --" />
              </SelectTrigger>
              <SelectContent>
                {availableIntentNames.map((name) => (
                  <SelectItem key={name} value={name}>{intentLabel(name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Live validation feedback */}
        <div className={cn(
          'rounded-md border p-2 text-[10px] font-bold',
          draftValidation.valid
            ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-500'
            : 'border-red-500/45 bg-red-500/10 text-red-500',
        )}>
          {draftValidation.valid ? '✓ ' : '⚠ '}
          {draftValidation.message}
        </div>

        {/* Enabled toggle */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 p-2">
          <label className="flex flex-1 items-center gap-2 text-[11px] font-bold text-foreground">
            <Switch
              checked={draft.enabled}
              onCheckedChange={handleToggleEnabled}
              aria-label="Toggle connector"
            />
            <span>Enabled</span>
          </label>
          <Badge variant={draft.enabled ? 'success' : 'secondary'}>{draft.enabled ? 'Active' : 'Inactive'}</Badge>
        </div>

        {/* Action buttons */}
        <div className="mt-1 flex gap-2">
          <Button onClick={handleDiscard} variant="secondary" size="sm" className="flex-1">
            {isDirty ? 'Discard' : 'Close'}
          </Button>
          {isDirty && (
            <Button
              onClick={handleSave}
              disabled={!canSave}
              size="sm"
              className="flex-1 gap-1.5"
              title={!draftValidation.valid ? 'Fix validation errors before saving' : 'Save and close'}
            >
              <Save className="size-3.5" />
              Save
            </Button>
          )}
          <Button onClick={handleDelete} variant="destructive" size="sm">
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
