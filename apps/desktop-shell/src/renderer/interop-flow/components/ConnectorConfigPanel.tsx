import { useCallback, useMemo } from 'react';
import type { InteropConnector, InteropFlowDefinition, ConnectorValidation } from '../model/interop-flow-types.js';
import { contextLabel, intentLabel } from '../model/fdc3-schema.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Switch } from '../../components/ui/switch.js';

interface ConnectorConfigPanelProps {
  connector: InteropConnector;
  validation: ConnectorValidation | undefined;
  flow: InteropFlowDefinition;
  onUpdate: (connectorId: string, updater: (c: InteropConnector) => InteropConnector) => void;
  onDelete: (connectorId: string) => void;
  onClose: () => void;
}

export function ConnectorConfigPanel({
  connector,
  validation,
  flow,
  onUpdate,
  onDelete,
  onClose,
}: ConnectorConfigPanelProps) {
  const sourceNode = flow.nodes.find((n) => n.appId === connector.sourceAppId);
  const targetNode = flow.nodes.find((n) => n.appId === connector.targetAppId);

  const availableContextTypes = useMemo(() => {
    if (connector.mode === 'context' || connector.mode === 'theme' || connector.mode === 'audit') {
      return sourceNode?.capabilities.broadcasts.map((s) => s.type) ?? [];
    }
    if (connector.mode === 'context-to-intent') {
      return sourceNode?.capabilities.broadcasts.map((s) => s.type) ?? [];
    }
    return [];
  }, [connector.mode, sourceNode]);

  const availableIntentNames = useMemo(() => {
    if (connector.mode === 'intent') {
      return sourceNode?.capabilities.raisesIntents.map((s) => s.name) ?? [];
    }
    if (connector.mode === 'context-to-intent') {
      return targetNode?.capabilities.handlesIntents.map((s) => s.name) ?? [];
    }
    return [];
  }, [connector.mode, sourceNode, targetNode]);

  const handleToggleEnabled = useCallback((enabled: boolean) => {
    onUpdate(connector.id, (c) => ({ ...c, enabled }));
  }, [connector.id, onUpdate]);

  const handleChangeMode = useCallback((newMode: string) => {
    onUpdate(connector.id, (c) => ({
      ...c,
      mode: newMode as InteropConnector['mode'],
      contextType: undefined,
      intentName: undefined,
    }));
  }, [connector.id, onUpdate]);

  const handleChangeContextType = useCallback((newType: string) => {
    onUpdate(connector.id, (c) => ({ ...c, contextType: newType }));
  }, [connector.id, onUpdate]);

  const handleChangeIntentName = useCallback((newName: string) => {
    onUpdate(connector.id, (c) => ({ ...c, intentName: newName }));
  }, [connector.id, onUpdate]);

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
          <span className="text-[9px] text-muted-foreground">Changes save automatically</span>
        </div>
        <Button
          onClick={onClose}
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
        >
          ×
        </Button>
      </CardHeader>

      {/* Content */}
      <CardContent className="flex max-h-[calc(100vh-156px)] flex-col gap-3 overflow-y-auto p-4 scrollbar-thin">
        {/* Source & Target */}
        <div className="rounded-md border border-border bg-secondary/50 p-2 text-[11px] text-foreground">
          <div>
            <span className="text-muted-foreground">From:</span> <strong>{sourceNode?.label}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">To:</span> <strong>{targetNode?.label}</strong>
          </div>
        </div>

        {/* Mode selector */}
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Mode</label>
          <Select value={connector.mode} onValueChange={handleChangeMode}>
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
        {(connector.mode === 'context' || connector.mode === 'theme' || connector.mode === 'audit' || connector.mode === 'context-to-intent') && (
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Context Type</label>
            <Select
              value={connector.contextType ?? ''}
              onValueChange={handleChangeContextType}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="-- Select context --" />
              </SelectTrigger>
              <SelectContent>
                {availableContextTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {contextLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Intent name selector */}
        {(connector.mode === 'intent' || connector.mode === 'context-to-intent') && (
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Intent</label>
            <Select
              value={connector.intentName ?? ''}
              onValueChange={handleChangeIntentName}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="-- Select intent --" />
              </SelectTrigger>
              <SelectContent>
                {availableIntentNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {intentLabel(name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Validation message */}
        {validation && (
          <div className={validation.valid
            ? 'rounded-md border border-emerald-500/45 bg-emerald-500/10 p-2 text-[10px] font-bold text-emerald-500'
            : 'rounded-md border border-red-500/45 bg-red-500/10 p-2 text-[10px] font-bold text-red-500'}
          >
            {validation.valid ? '✓ ' : '⚠ '}
            {validation.message}
          </div>
        )}

        {/* Enabled toggle */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 p-2">
          <label className="flex flex-1 items-center gap-2 text-[11px] font-bold text-foreground">
            <Switch
              checked={connector.enabled}
              onCheckedChange={handleToggleEnabled}
              aria-label="Toggle connector"
            />
            <span>Enabled</span>
          </label>
          <Badge variant={connector.enabled ? 'success' : 'secondary'}>{connector.enabled ? 'Active' : 'Inactive'}</Badge>
        </div>

        {/* Action buttons */}
        <div className="mt-1 flex gap-2">
          <Button onClick={onClose} variant="secondary" size="sm" className="flex-1">
            Close
          </Button>
          <Button onClick={handleDelete} variant="destructive" size="sm">
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
