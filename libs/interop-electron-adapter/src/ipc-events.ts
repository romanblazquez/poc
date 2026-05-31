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
  RECALL_WORKSPACE_WINDOW: 'fdc3:recallWorkspaceWindow',
  CLOSE_CURRENT_WINDOW: 'fdc3:closeCurrentWindow',
  GET_THEME: 'fdc3:getTheme',
  SET_THEME: 'fdc3:setTheme',
  SET_FLOW_POLICY: 'fdc3:setFlowPolicy',
  GET_INTEROP_SNAPSHOT: 'fdc3:getInteropSnapshot',
  APP_LOG_WRITE: 'platform:appLogWrite',
  GET_APP_LOGS: 'platform:getAppLogs',
  CLEAR_APP_LOGS: 'platform:clearAppLogs',
  GET_DISPLAYS: 'fdc3:getDisplays',
  GET_INFO: 'fdc3:getInfo',
  FIND_INTENT: 'fdc3:findIntent',
  FIND_INTENTS_BY_CONTEXT: 'fdc3:findIntentsByContext',
  GET_OR_CREATE_APP_CHANNEL: 'fdc3:getOrCreateAppChannel',
  APP_CHANNEL_BROADCAST: 'fdc3:appChannelBroadcast',
  APP_CHANNEL_ADD_LISTENER: 'fdc3:appChannelAddListener',
  APP_CHANNEL_REMOVE_LISTENER: 'fdc3:appChannelRemoveListener',
  APP_CHANNEL_GET_CURRENT_CONTEXT: 'fdc3:appChannelGetCurrentContext',
  CREATE_PRIVATE_CHANNEL: 'fdc3:createPrivateChannel',
  PRIVATE_CHANNEL_BROADCAST: 'fdc3:privateChannelBroadcast',
  PRIVATE_CHANNEL_ADD_LISTENER: 'fdc3:privateChannelAddListener',
  PRIVATE_CHANNEL_REMOVE_LISTENER: 'fdc3:privateChannelRemoveListener',
  PRIVATE_CHANNEL_GET_CURRENT_CONTEXT: 'fdc3:privateChannelGetCurrentContext',
  PRIVATE_CHANNEL_DISCONNECT: 'fdc3:privateChannelDisconnect',
  PRIVATE_CHANNEL_CONNECT: 'fdc3:privateChannelConnect',
  INTENT_RESOLVER_GET_PAYLOAD: 'fdc3:intentResolverGetPayload',
  INTENT_RESOLVER_PICK: 'fdc3:intentResolverPick',
  INTENT_RESOLVER_CANCEL: 'fdc3:intentResolverCancel',

  // ─── Main → Renderer (webContents.send) ──────────────────────────────────
  CONTEXT_UPDATE: 'fdc3:contextUpdate',
  INTENT_FIRE: 'fdc3:intentFire',
  CHANNEL_CHANGED: 'fdc3:channelChanged',
  APP_LIST_CHANGED: 'fdc3:appListChanged',
  WORKSPACE_WINDOW_CLOSED: 'fdc3:workspaceWindowClosed',
  THEME_CHANGED: 'fdc3:themeChanged',
  APP_CHANNEL_CONTEXT: 'fdc3:appChannelContext',
  PRIVATE_CHANNEL_CONTEXT: 'fdc3:privateChannelContext',
  PRIVATE_CHANNEL_LISTENER_ADDED: 'fdc3:privateChannelListenerAdded',
  PRIVATE_CHANNEL_LISTENER_REMOVED: 'fdc3:privateChannelListenerRemoved',
  PRIVATE_CHANNEL_DISCONNECTED: 'fdc3:privateChannelDisconnected',
  INTEROP_ACTIVITY: 'fdc3:interopActivity',
  APP_LOG: 'platform:appLog',
} as const;

export type IpcEventKey = keyof typeof IpcEvents;
export type IpcEventValue = (typeof IpcEvents)[IpcEventKey];
