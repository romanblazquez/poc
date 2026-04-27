import React, { useCallback, useMemo } from 'react';
import type { InteropConnector, InteropFlowDefinition, ConnectorValidation } from '../model/interop-flow-types.js';
import { FDC3_CONTEXT_SCHEMAS, FDC3_INTENT_SCHEMAS, contextLabel, intentLabel } from '../model/fdc3-schema.js';

interface ConnectorConfigPanelProps {
  connector: InteropConnector;
  validation: ConnectorValidation | undefined;
  flow: InteropFlowDefinition;
  onUpdate: (connectorId: string, updater: (c: InteropConnector) => InteropConnector) => void;
  onClose: () => void;
}

export function ConnectorConfigPanel({
  connector,
  validation,
  flow,
  onUpdate,
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

  const handleToggleEnabled = useCallback(() => {
    onUpdate(connector.id, (c) => ({ ...c, enabled: !c.enabled }));
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
      onClose();
    }
  }, [onClose]);

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        top: 60,
        width: 380,
        background: 'var(--interop-panel)',
        border: '1px solid var(--interop-border)',
        borderRadius: 8,
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.24)',
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--interop-border)',
        }}
      >
        <strong style={{ fontSize: 12, color: 'var(--interop-text-strong)' }}>Connector Config</strong>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--interop-text-muted)',
            fontSize: 18,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Source & Target */}
        <div style={{ fontSize: 11, color: 'var(--interop-text)' }}>
          <div>
            <span style={{ color: 'var(--interop-text-muted)' }}>From:</span> <strong>{sourceNode?.label}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--interop-text-muted)' }}>To:</span> <strong>{targetNode?.label}</strong>
          </div>
        </div>

        {/* Mode selector */}
        <div>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--interop-text-muted)', marginBottom: 4 }}>Mode</label>
          <select
            value={connector.mode}
            onChange={(e) => handleChangeMode(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              background: 'var(--interop-panel-2)',
              border: '1px solid var(--interop-border)',
              borderRadius: 4,
              color: 'var(--interop-text-strong)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <option value="context">Context</option>
            <option value="intent">Intent</option>
            <option value="context-to-intent">Context→Intent</option>
            <option value="theme">Theme</option>
            <option value="audit">Audit</option>
          </select>
        </div>

        {/* Context type selector */}
        {(connector.mode === 'context' || connector.mode === 'theme' || connector.mode === 'audit' || connector.mode === 'context-to-intent') && (
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'var(--interop-text-muted)', marginBottom: 4 }}>Context Type</label>
            <select
              value={connector.contextType ?? ''}
              onChange={(e) => handleChangeContextType(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: 'var(--interop-panel-2)',
                border: '1px solid var(--interop-border)',
                borderRadius: 4,
                color: 'var(--interop-text-strong)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              <option value="">-- Select context --</option>
              {availableContextTypes.map((type) => (
                <option key={type} value={type}>
                  {contextLabel(type)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Intent name selector */}
        {(connector.mode === 'intent' || connector.mode === 'context-to-intent') && (
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'var(--interop-text-muted)', marginBottom: 4 }}>Intent</label>
            <select
              value={connector.intentName ?? ''}
              onChange={(e) => handleChangeIntentName(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: 'var(--interop-panel-2)',
                border: '1px solid var(--interop-border)',
                borderRadius: 4,
                color: 'var(--interop-text-strong)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              <option value="">-- Select intent --</option>
              {availableIntentNames.map((name) => (
                <option key={name} value={name}>
                  {intentLabel(name)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Validation message */}
        {validation && (
          <div
            style={{
              padding: '8px',
              background: validation.valid ? 'color-mix(in srgb, var(--interop-success) 14%, transparent)' : 'color-mix(in srgb, var(--interop-danger) 14%, transparent)',
              border: `1px solid ${validation.valid ? 'var(--interop-success)' : 'var(--interop-danger)'}`,
              borderRadius: 4,
              fontSize: 10,
              color: validation.valid ? 'var(--interop-success)' : 'var(--interop-danger)',
            }}
          >
            {validation.valid ? '✓ ' : '⚠ '}
            {validation.message}
          </div>
        )}

        {/* Enabled toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--interop-text)', flex: 1 }}>
            <input type="checkbox" checked={connector.enabled} onChange={handleToggleEnabled} style={{ cursor: 'pointer' }} />
            <span>Enabled</span>
          </label>
          <span style={{ fontSize: 9, color: 'var(--interop-text-muted)' }}>{connector.enabled ? 'Active' : 'Inactive'}</span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '6px 8px',
              background: 'var(--interop-panel-2)',
              border: '1px solid var(--interop-border)',
              borderRadius: 4,
              color: 'var(--interop-text)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
          <button
            onClick={handleDelete}
            style={{
              padding: '6px 8px',
              background: 'color-mix(in srgb, var(--interop-danger) 14%, var(--interop-panel))',
              border: '1px solid color-mix(in srgb, var(--interop-danger) 56%, var(--interop-border))',
              borderRadius: 4,
              color: 'var(--interop-danger)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
