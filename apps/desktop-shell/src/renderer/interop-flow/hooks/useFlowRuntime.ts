import { useMemo } from 'react';
import type { InteropFlowDefinition } from '../model/interop-flow-types.js';
import { routeContext } from '../engine/context-router.js';
import { routeIntent } from '../engine/intent-router.js';

export function useFlowRuntime(flow: InteropFlowDefinition) {
  return useMemo(() => ({
    previewContextRoute(sourceAppId: string, context: { type?: string; [key: string]: unknown }) {
      return routeContext(flow, sourceAppId, context);
    },
    previewIntentRoute(sourceAppId: string, intentName: string, context?: unknown) {
      return routeIntent(flow, sourceAppId, intentName, context);
    },
  }), [flow]);
}
