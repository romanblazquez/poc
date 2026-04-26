/**
 * Canonical IPC event names shared between the preload script and the main process.
 * Using constants prevents typos and makes refactoring safe.
 *
 * Convention:
 *   fdc3:<verb>        — renderer → main (invoke / send)
 *   fdc3:<noun>Update  — main → renderer (send)
 */
export const IpcEvents = {
  // ─── Renderer → Main (ipcRenderer.invoke) ────────────────────────────────
  BROADCAST: 'fdc3:broadcast',
  RAISE_INTENT: 'fdc3:raiseIntent',
  ADD_CONTEXT_LISTENER: 'fdc3:addContextListener',
  REMOVE_CONTEXT_LISTENER: 'fdc3:removeContextListener',
  ADD_INTENT_LISTENER: 'fdc3:addIntentListener',
  REMOVE_INTENT_LISTENER: 'fdc3:removeIntentListener',
  COMPLETE_INTENT: 'fdc3:completeIntent',
  JOIN_CHANNEL: 'fdc3:joinChannel',
  LEAVE_CHANNEL: 'fdc3:leaveChannel',
  GET_CURRENT_CHANNEL: 'fdc3:getCurrentChannel',
  GET_USER_CHANNELS: 'fdc3:getUserChannels',
  OPEN_APP: 'fdc3:openApp',
  GET_WINDOW_ID: 'fdc3:getWindowId',
  SAVE_WORKSPACE: 'fdc3:saveWorkspace',
  APPLY_WORKSPACE: 'fdc3:applyWorkspace',
  GET_APP_LIST: 'fdc3:getAppList',
  GET_PRELOAD_PATH: 'fdc3:getPreloadPath',
  OPEN_WORKSPACE_WINDOW: 'fdc3:openWorkspaceWindow',
  GET_WORKSPACE_WINDOW_PAYLOAD: 'fdc3:getWorkspaceWindowPayload',
  UPDATE_WORKSPACE_WINDOW_PAYLOAD: 'fdc3:updateWorkspaceWindowPayload',
  CLOSE_CURRENT_WINDOW: 'fdc3:closeCurrentWindow',

  // ─── Main → Renderer (webContents.send) ──────────────────────────────────
  CONTEXT_UPDATE: 'fdc3:contextUpdate',
  INTENT_FIRE: 'fdc3:intentFire',
  CHANNEL_CHANGED: 'fdc3:channelChanged',
  APP_LIST_CHANGED: 'fdc3:appListChanged',
  WORKSPACE_WINDOW_CLOSED: 'fdc3:workspaceWindowClosed',
} as const;

export type IpcEventKey = keyof typeof IpcEvents;
export type IpcEventValue = (typeof IpcEvents)[IpcEventKey];
