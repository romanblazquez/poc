import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppEntry } from '../../App.js';
import { createAutoWiredFlow, mergeFlowWithWorkspaceApps } from '../engine/connector-resolver.js';
import { loadInteropFlow, saveInteropFlow } from '../engine/flow-persistence.js';
import { validateFlow } from '../engine/flow-validator.js';
import type { InteropConnector, InteropFlowDefinition } from '../model/interop-flow-types.js';

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
