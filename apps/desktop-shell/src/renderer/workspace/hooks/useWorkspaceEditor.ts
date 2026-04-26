import { useCallback, useMemo, useState } from 'react';
import type { WorkspaceAction } from '../engine/workspace-reducer.js';
import { getActiveTab, workspaceReducer } from '../engine/workspace-reducer.js';
import { createHistoryState, pushHistory, redo, undo } from '../engine/history-engine.js';
import type { WorkspaceEditorState, WorkspaceTabModel } from '../model/workspace-types.js';
import { saveWorkspaceSnapshot } from '../model/layout-snapshot.js';

const TRANSIENT_ACTIONS = new Set<WorkspaceAction['type']>(['set-status', 'select-tile', 'select-tab']);

export function useWorkspaceEditor(initialState: WorkspaceEditorState) {
  const [history, setHistory] = useState(() => createHistoryState(initialState));
  const state = history.present;
  const activeTab = useMemo(() => getActiveTab(state), [state]);

  const dispatch = useCallback((action: WorkspaceAction) => {
    setHistory((current) => {
      const next = workspaceReducer(current.present, action);
      if (TRANSIENT_ACTIONS.has(action.type)) {
        return { ...current, present: next };
      }
      saveWorkspaceSnapshot({ tabs: next.tabs, activeTabId: next.activeTabId });
      return pushHistory(current, next);
    });
  }, []);

  const undoEditor = useCallback(() => {
    setHistory((current) => {
      const next = undo(current);
      saveWorkspaceSnapshot({ tabs: next.present.tabs, activeTabId: next.present.activeTabId });
      return next;
    });
  }, []);

  const redoEditor = useCallback(() => {
    setHistory((current) => {
      const next = redo(current);
      saveWorkspaceSnapshot({ tabs: next.present.tabs, activeTabId: next.present.activeTabId });
      return next;
    });
  }, []);

  return {
    activeTab,
    canRedo: history.future.length > 0,
    canUndo: history.past.length > 0,
    dispatch,
    redo: redoEditor,
    state,
    undo: undoEditor,
  };
}

export function createWorkspaceTab(name: string, channelId: string, theme: 'light' | 'dark'): WorkspaceTabModel {
  const id = `tab-${Date.now()}`;
  return {
    id,
    name,
    channelId,
    theme,
    layout: {
      tiles: [],
      groups: [],
      attachments: [],
      grid: { enabled: true, size: 24, snap: true },
    },
  };
}

