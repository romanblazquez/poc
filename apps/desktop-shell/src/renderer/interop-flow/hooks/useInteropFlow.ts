import { useCallback, useMemo, useState } from 'react';
import type { AppEntry } from '../../App.js';
import { createRecommendedFundsFlow, mergeFlowWithWorkspaceApps } from '../engine/connector-resolver.js';
import { loadInteropFlow, saveInteropFlow } from '../engine/flow-persistence.js';
import { validateFlow } from '../engine/flow-validator.js';
import type { InteropConnector, InteropFlowDefinition } from '../model/interop-flow-types.js';

export function useInteropFlow(workspaceTabId: string, apps: AppEntry[], appIds: string[]) {
  const initial = useMemo(() => {
    const stored = loadInteropFlow(workspaceTabId);
    return mergeFlowWithWorkspaceApps(stored ?? undefined, apps, appIds);
  }, [apps, appIds, workspaceTabId]);
  const [flow, setFlow] = useState<InteropFlowDefinition>(initial);
  const validations = useMemo(() => validateFlow(flow), [flow]);

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

  const autoWireFunds = useCallback(() => {
    commitFlow(createRecommendedFundsFlow(apps, appIds));
  }, [appIds, apps, commitFlow]);

  return {
    autoWireFunds,
    commitFlow,
    flow,
    setFlow: commitFlow,
    updateConnector,
    validations,
  };
}
