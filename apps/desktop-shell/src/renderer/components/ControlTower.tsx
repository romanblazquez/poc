import { useState } from 'react';
import { CommandCenter } from './CommandCenter.js';
import { Insights } from './Insights.js';
import type { AppEntry, SmartWorkspaceTemplate, WorkspaceTab } from '../App.js';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import { DashboardHeader, DashboardPage, StatusBadge } from './ui/dashboard.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.js';

interface ControlTowerProps {
  apps: AppEntry[];
  currentChannel: UserChannel | null;
  onOpen: (appId: string) => Promise<void>;
  onComposeWorkspace: (template: SmartWorkspaceTemplate) => Promise<void>;
  workspaceTabs: WorkspaceTab[];
  activeWorkspaceId: string;
}

type TowerView = 'live' | 'intelligence';

export function ControlTower({
  apps,
  currentChannel,
  onOpen,
  onComposeWorkspace,
  workspaceTabs,
  activeWorkspaceId,
}: ControlTowerProps): JSX.Element {
  const [view, setView] = useState<TowerView>('live');

  return (
    <Tabs
      value={view}
      onValueChange={(value) => setView(value as TowerView)}
      className="h-full min-h-0 overflow-hidden"
    >
      <DashboardPage>
        <DashboardHeader
          eyebrow="FDC3 operations"
          title="Interop Control Tower"
          description="Live route governance, workflow replay, channel telemetry, app health, and exportable audit intelligence."
          meta={<StatusBadge label={view === 'live' ? 'Live Ops' : 'Intelligence'} tone="accent" />}
          actions={
            <TabsList className="shrink-0">
              <TabsTrigger value="live">Live Ops</TabsTrigger>
              <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
            </TabsList>
          }
        />

        <TabsContent value="live" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
          <CommandCenter
            apps={apps}
            currentChannel={currentChannel}
            onOpen={onOpen}
            onComposeWorkspace={onComposeWorkspace}
          />
        </TabsContent>
        <TabsContent value="intelligence" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
          <Insights apps={apps} workspaceTabs={workspaceTabs} activeWorkspaceId={activeWorkspaceId} />
        </TabsContent>
      </DashboardPage>
    </Tabs>
  );
}
