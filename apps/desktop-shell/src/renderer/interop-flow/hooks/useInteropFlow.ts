import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppEntry } from '../../App.js';
import { createAutoWiredFlow, mergeFlowWithWorkspaceApps } from '../engine/connector-resolver.js';
import { loadInteropFlow, saveInteropFlow } from '../engine/flow-persistence.js';
import { validateFlow } from '../engine/flow-validator.js';
import type { InteropConnector, InteropFlowDefinition } from '../model/interop-flow-types.js';

/**
 * Derive a FlowPolicy from the current flow definition and push it to the
 * main process so broadcast and intent routing can be enforced immediately.
 *
 * Allowlist semantics: when a flow is active, EVERY capability-compatible
 * source→target pair is evaluated. If there is no enabled connector covering
 * that pair it is added to the blocklist — so deleting a connector blocks the
 * route just like disabling it.
 *
 * We fire-and-forget because policy sync failures are non-critical.
 */
function pushFlowPolicy(flow: InteropFlowDefinition): void {
  if (!window.fdc3?.setFlowPolicy) return;

  const disabledContextRoutes: string[] = [];
  const disabledIntentRoutes: string[] = [];

  // Build lookup sets of routes that have an ENABLED connector.
  const enabledContextRoutes = new Set<string>();
  const enabledIntentRoutes = new Set<string>();
  for (const c of flow.connectors) {
    if (!c.enabled) continue;
    if ((c.mode === 'context' || c.mode === 'theme' || c.mode === 'audit' || c.mode === 'context-to-intent') && c.contextType) {
      enabledContextRoutes.add(`${c.sourceAppId}:${c.contextType}:${c.targetAppId}`);
    }
    if ((c.mode === 'intent' || c.mode === 'context-to-intent') && c.intentName) {
      enabledIntentRoutes.add(`${c.sourceAppId}:${c.intentName}:${c.targetAppId}`);
    }
  }

  // For every capability-compatible pair, block routes not covered by an enabled connector.
  for (const source of flow.nodes) {
    for (const target of flow.nodes) {
      if (source.appId === target.appId) continue;

      for (const broadcast of source.capabilities.broadcasts) {
        if (target.capabilities.listensTo.some((s) => s.type === broadcast.type)) {
          const key = `${source.appId}:${broadcast.type}:${target.appId}`;
          if (!enabledContextRoutes.has(key)) disabledContextRoutes.push(key);
        }
        for (const handled of target.capabilities.handlesIntents) {
          if (handled.acceptsContextTypes.includes(broadcast.type)) {
            const ctxKey = `${source.appId}:${broadcast.type}:${target.appId}`;
            if (!enabledContextRoutes.has(ctxKey)) disabledContextRoutes.push(ctxKey);
          }
        }
      }

      for (const raised of source.capabilities.raisesIntents) {
        if (target.capabilities.handlesIntents.some((s) => s.name === raised.name)) {
          const key = `${source.appId}:${raised.name}:${target.appId}`;
          if (!enabledIntentRoutes.has(key)) disabledIntentRoutes.push(key);
        }
      }
    }
  }

  void window.fdc3.setFlowPolicy({
    enabled: flow.enabled,
    disabledContextRoutes: [...new Set(disabledContextRoutes)],
    disabledIntentRoutes: [...new Set(disabledIntentRoutes)],
  });
}

export function useInteropFlow(workspaceTabId: string, apps: AppEntry[], appIds: string[]) {
  // Initial load: only depends on workspaceTabId so it doesn't reset when apps finish loading.
  const initial = useMemo(() => {
    const stored = loadInteropFlow(workspaceTabId);
    return mergeFlowWithWorkspaceApps(stored ?? undefined, apps, appIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceTabId]); // intentionally omit apps/appIds — see below

  const [flow, setFlow] = useState<InteropFlowDefinition>(initial);
  const validations = useMemo(() => validateFlow(flow), [flow]);

  // Reset flow only when the workspace tab actually changes (user switches tab).
  // Do NOT reset on apps/appIds change — that would wipe auto-wired connectors
  // when the app list finishes loading from IPC after mount.
  useEffect(() => {
    setFlow(initial);
  }, [workspaceTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When apps finish loading, merge them into the current flow so nodes appear
  // without overwriting any connectors the user may have added.
  useEffect(() => {
    if (apps.length === 0) return;
    setFlow((current) => mergeFlowWithWorkspaceApps(current, apps, appIds));
  }, [apps, appIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitFlow = useCallback((next: InteropFlowDefinition) => {
    setFlow(next);
    saveInteropFlow(workspaceTabId, next);
    pushFlowPolicy(next);
  }, [workspaceTabId]);

  const updateConnector = useCallback((connectorId: string, updater: (connector: InteropConnector) => InteropConnector) => {
    commitFlow({
      ...flow,
      connectors: flow.connectors.map((connector) => connector.id === connectorId ? updater(connector) : connector),
    });
  }, [commitFlow, flow]);

  const autoWireFlow = useCallback(() => {
    commitFlow(createAutoWiredFlow(apps, appIds));
  }, [appIds, apps, commitFlow]);

  return {
    autoWireFlow,
    commitFlow,
    flow,
    setFlow: commitFlow,
    updateConnector,
    validations,
  };
}
