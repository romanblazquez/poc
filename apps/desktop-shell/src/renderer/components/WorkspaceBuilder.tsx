import type { CSSProperties } from 'react';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import type { AppEntry, WorkspaceRuntimePayload, WorkspaceWindowDraft } from '../App.js';
import { DockviewWorkspaceEditor } from './DockviewWorkspaceEditor.js';

interface WorkspaceBuilderProps {
  apps: AppEntry[];
  channels: UserChannel[];
  currentChannel: UserChannel | null;
  preloadPath: string;
  onApply: (payload: {
    name: string;
    windows: WorkspaceWindowDraft[];
    closeOtherApps: boolean;
    save: boolean;
  }) => Promise<void>;
  onOpenWorkspaceWindow: (payload: WorkspaceRuntimePayload) => Promise<void>;
}

export function WorkspaceBuilder({
  apps,
  currentChannel,
  preloadPath,
  onApply,
}: WorkspaceBuilderProps) {
  return (
    <div style={rootStyle}>
      <DockviewWorkspaceEditor
        apps={apps}
        currentChannel={currentChannel}
        preloadPath={preloadPath}
        onApply={onApply}
      />
    </div>
  );
}

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  width: '100%',
};
