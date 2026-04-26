import type { InteropFlowDefinition } from '../model/interop-flow-types.js';

export function flowStorageKey(workspaceTabId: string): string {
  return `fdc3.interopFlow.${workspaceTabId}`;
}

export function loadInteropFlow(workspaceTabId: string): InteropFlowDefinition | null {
  const raw = window.localStorage.getItem(flowStorageKey(workspaceTabId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InteropFlowDefinition;
  } catch {
    window.localStorage.removeItem(flowStorageKey(workspaceTabId));
    return null;
  }
}

export function saveInteropFlow(workspaceTabId: string, flow: InteropFlowDefinition): void {
  window.localStorage.setItem(flowStorageKey(workspaceTabId), JSON.stringify(flow));
}
