import { useEffect, useMemo, useState } from 'react';
import type { AppLogEvent, AppLogLevel, Fdc3Context, InteropActivityEvent, InteropRouteSnapshot, InteropSnapshot, PlatformLogsApi, UserChannel, WorkflowRecording, WorkflowStep } from '@fdc3-poc/fdc3-core';
import type { AppEntry, SmartWorkspaceTemplate } from '../App.js';
import { cn } from '../lib/utils.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';

interface CommandCenterProps {
  apps: AppEntry[];
  currentChannel: UserChannel | null;
  onOpen: (appId: string) => Promise<void>;
  onComposeWorkspace: (template: SmartWorkspaceTemplate) => Promise<void>;
}

interface CommandCenterFdc3Api {
  getInteropSnapshot(): Promise<InteropSnapshot>;
  onInteropActivity(handler: (event: InteropActivityEvent) => void): () => void;
  broadcast(context: unknown): Promise<void>;
  raiseIntent(intent: string, context?: unknown): Promise<unknown>;
}

declare global {
  interface Window {
    platformLogs?: PlatformLogsApi;
  }
}

type SectionId = 'activity' | 'channels' | 'logs' | 'routes' | 'workflow';

const NAV: { id: SectionId; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'channels', label: 'Channels' },
  { id: 'logs', label: 'Log Trace' },
  { id: 'routes', label: 'Routes' },
  { id: 'workflow', label: 'Workflow' },
];

const WORKSPACE_TEMPLATES: SmartWorkspaceTemplate[] = [
  {
    id: 'smart-client-call',
    name: 'Client Call - Maria Garcia',
    channelId: 'channel-4',
    panelIds: ['customer-search', 'customer-profile', 'portfolio-view', 'payment-action', 'fdc3-conformance'],
    seedContext: { type: 'fdc3.contact', id: { email: 'maria.garcia@example.com' }, name: 'Maria Garcia' },
  },
  {
    id: 'smart-trade-desk',
    name: 'Trade Desk - AAPL',
    channelId: 'channel-5',
    panelIds: ['market-watch', 'chart', 'news', 'order-ticket', 'order-blotter', 'fdc3-conformance'],
    seedContext: { type: 'fdc3.instrument', id: { ticker: 'AAPL' }, name: 'Apple Inc.' },
  },
  {
    id: 'smart-fund-ops',
    name: 'Fund Ops Control',
    channelId: 'channel-5',
    panelIds: ['incoming-orders', 'funds-allocations', 'audit-log', 'fdc3-conformance'],
    seedContext: { type: 'com.demo.fund', id: { fundId: 'FUND-ALPHA', ticker: 'ALPHA' }, name: 'Global Equity Alpha' },
  },
];

const WORKFLOW_STORAGE_KEY = 'fdc3.command-center.workflow.v1';

function appLabel(apps: AppEntry[], appId?: string): string {
  if (!appId) return 'unknown';
  const app = apps.find((entry) => entry.appId === appId);
  return app?.title ?? appId;
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function eventAccent(status: InteropActivityEvent['status']): string {
  if (status === 'blocked') return '#f59e0b';
  if (status === 'error') return '#ef4444';
  if (status === 'info') return 'var(--shell-accent)';
  return 'var(--shell-positive)';
}

function logAccent(level: AppLogLevel): string {
  if (level === 'error') return '#ef4444';
  if (level === 'warning') return '#f59e0b';
  if (level === 'debug') return 'var(--shell-muted)';
  return 'var(--shell-accent)';
}

function routeLabel(route: InteropRouteSnapshot): string {
  return route.type === 'context'
    ? route.contextType ?? 'context'
    : route.intentName ?? 'intent';
}

function readWorkflowRecording(): WorkflowRecording | null {
  try {
    const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY);
    return raw ? JSON.parse(raw) as WorkflowRecording : null;
  } catch {
    return null;
  }
}

function compactWorkflowSteps(events: InteropActivityEvent[]): WorkflowStep[] {
  const seen = new Set<string>();
  const ordered = [...events].reverse();
  const steps: WorkflowStep[] = [];
  for (const event of ordered) {
    let step: Omit<WorkflowStep, 'id'> | null = null;
    if ((event.kind === 'app.opened' || event.kind === 'app.focused') && event.appId) {
      step = { ts: event.ts, kind: 'openApp', appId: event.appId };
    } else if (event.kind === 'channel.joined' && event.appId && event.channelId) {
      step = { ts: event.ts, kind: 'joinChannel', appId: event.appId, channelId: event.channelId };
    } else if (event.kind === 'context.broadcasted' && event.payload && typeof event.payload === 'object') {
      step = { ts: event.ts, kind: 'broadcast', channelId: event.channelId, context: event.payload as Fdc3Context };
    } else if (event.kind === 'intent.raised' && event.intentName) {
      step = {
        ts: event.ts,
        kind: 'raiseIntent',
        intentName: event.intentName,
        context: event.payload && typeof event.payload === 'object' ? event.payload as Fdc3Context : undefined,
      };
    }
    if (!step) continue;
    const key = JSON.stringify({ kind: step.kind, appId: step.appId, channelId: step.channelId, context: step.context, intentName: step.intentName });
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push({ id: `step-${steps.length + 1}`, ...step });
  }
  return steps.slice(-18);
}

export function CommandCenter({ apps, currentChannel, onOpen, onComposeWorkspace }: CommandCenterProps) {
  const [snapshot, setSnapshot] = useState<InteropSnapshot | null>(null);
  const [demoStatus, setDemoStatus] = useState('');
  const [recording, setRecording] = useState<WorkflowRecording | null>(() => readWorkflowRecording());
  const [logLevelFilter, setLogLevelFilter] = useState<AppLogLevel | 'all'>('all');
  const [section, setSection] = useState<SectionId>('activity');
  const fdc3 = window.fdc3 as unknown as CommandCenterFdc3Api | undefined;
  const platformLogs = window.platformLogs;

  const refresh = async (): Promise<void> => {
    if (!fdc3?.getInteropSnapshot) return;
    setSnapshot(await fdc3.getInteropSnapshot());
  };

  useEffect(() => {
    void refresh();
    const unsubscribeActivity = fdc3?.onInteropActivity?.(() => { void refresh(); });
    const unsubscribeLogs = platformLogs?.onLog?.(() => { void refresh(); });
    return () => {
      unsubscribeActivity?.();
      unsubscribeLogs?.();
    };
  }, []);

  const activeRoutes = useMemo(() => snapshot?.routes.filter((route) => route.allowed) ?? [], [snapshot]);
  const blockedRoutes = useMemo(() => snapshot?.routes.filter((route) => !route.allowed) ?? [], [snapshot]);
  const appLogs = useMemo(() => {
    const logs = snapshot?.appLogs ?? [];
    return logLevelFilter === 'all' ? logs : logs.filter((log) => log.level === logLevelFilter);
  }, [logLevelFilter, snapshot]);
  const runningApps = snapshot?.apps.filter((app) => app.running) ?? [];

  const runDemo = async (label: string, action: () => Promise<void>): Promise<void> => {
    setDemoStatus(`${label}...`);
    try {
      await action();
      setDemoStatus(`${label} sent`);
      setTimeout(() => setDemoStatus(''), 1800);
    } catch (error) {
      setDemoStatus(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const openMarketWorkspace = async (): Promise<void> => {
    await Promise.all(['market-watch', 'customer-profile', 'portfolio-view', 'fdc3-conformance'].map((appId) => onOpen(appId)));
  };

  const captureWorkflow = (): void => {
    const events = snapshot?.activity ?? [];
    const steps = compactWorkflowSteps(events);
    const next: WorkflowRecording = {
      id: `workflow-${Date.now().toString(36)}`,
      name: `Workflow Replay ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: Date.now(),
      sourceEventCount: events.length,
      steps,
    };
    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(next));
    setRecording(next);
    setDemoStatus(`Captured ${steps.length} replay steps`);
  };

  const replayWorkflow = async (): Promise<void> => {
    if (!recording || recording.steps.length === 0) {
      setDemoStatus('No workflow captured yet');
      return;
    }
    await runDemo('Replay workflow', async () => {
      for (const step of recording.steps) {
        if (step.kind === 'openApp' && step.appId) {
          await onOpen(step.appId);
        } else if (step.kind === 'joinChannel' && step.channelId) {
          await window.fdc3.joinUserChannel(step.channelId);
        } else if (step.kind === 'broadcast' && step.context) {
          await fdc3?.broadcast(step.context);
        } else if (step.kind === 'raiseIntent' && step.intentName) {
          await fdc3?.raiseIntent(step.intentName, step.context);
        }
      }
    });
  };

  const composeWorkspace = async (template: SmartWorkspaceTemplate): Promise<void> => {
    await runDemo(`Compose ${template.name}`, () => onComposeWorkspace(template));
  };

  const clearPlatformLogs = async (): Promise<void> => {
    await runDemo('Clear platform logs', async () => {
      const allowed = await platformLogs?.clear();
      if (!allowed) throw new Error('not permitted from this window');
      await refresh();
    });
  };

  const writeStructuredLog = async (): Promise<void> => {
    await runDemo('Write structured platform log', async () => {
      const ok = await platformLogs?.info('Structured audit log from Control Tower', {
        desk: 'cash-equities',
        workflow: activeRoutes.length > 0 ? 'live-interop' : 'diagnostics',
        runningApps: runningApps.length,
      }, 'control-tower');
      if (!ok) throw new Error('platformLogs unavailable');
    });
  };

  const navCount: Record<SectionId, number | undefined> = {
    activity: snapshot?.activity.length,
    channels: snapshot?.channels.length,
    logs: appLogs.length,
    routes: snapshot?.routes.length,
    workflow: recording?.steps.length,
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {/* Metric strip */}
      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Runtime Apps" value={String(snapshot?.metrics.runningApps ?? 0)} detail={`${apps.length} registered`} />
        <MetricCard label="Delivered" value={String(snapshot?.metrics.deliveredEvents ?? 0)} detail="contexts + intents" />
        <MetricCard label="Blocked" value={String(snapshot?.metrics.blockedEvents ?? 0)} detail={snapshot?.flowPolicy?.enabled ? 'flow policy active' : 'policy inactive'} tone={snapshot?.metrics.blockedEvents ? '#f59e0b' : 'var(--shell-positive)'} />
        <MetricCard label="App Logs" value={String(snapshot?.metrics.logEvents ?? 0)} detail="console + structured" />
        <MetricCard label="Log Errors" value={String(snapshot?.metrics.errorLogEvents ?? 0)} detail="errors/crashes/navigation" tone={snapshot?.metrics.errorLogEvents ? '#ef4444' : 'var(--shell-positive)'} />
        <MetricCard label="Current Channel" value={currentChannel?.displayMetadata.name ?? 'None'} detail={currentChannel?.id ?? 'global broadcast'} tone={currentChannel?.displayMetadata.color ?? 'var(--shell-muted)'} />
      </div>

      {/* Sidebar nav + panel */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        {/* Left sidebar */}
        <nav className="flex w-36 shrink-0 flex-col gap-0.5 overflow-y-auto rounded-lg border bg-card p-1.5">
          {NAV.map(({ id, label }) => {
            const count = navCount[id];
            return (
              <Button
                key={id}
                type="button"
                variant={section === id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSection(id)}
                className={cn(
                  'w-full justify-start gap-2',
                  section !== id && 'text-muted-foreground',
                )}
              >
                <span className="flex-1 text-left">{label}</span>
                {count != null && (
                  <span className={cn(
                    'ml-auto shrink-0 tabular-nums text-[10px] font-bold',
                    section === id ? 'opacity-70' : 'text-muted-foreground',
                  )}>
                    {count}
                  </span>
                )}
              </Button>
            );
          })}
        </nav>

        {/* Active panel */}
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">

          {section === 'activity' && (
            <Card className="flex min-h-0 w-full flex-col overflow-hidden">
              <CardHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b">
                <CardTitle>Live Activity Timeline</CardTitle>
                <Badge variant="outline">{snapshot?.metrics.totalEvents ?? 0} events</Badge>
              </CardHeader>
              <CardContent className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-3 pb-4">
                {(snapshot?.activity ?? []).slice(0, 80).map((event) => (
                  <ActivityRow key={event.id} event={event} apps={apps} />
                ))}
                {snapshot && snapshot.activity.length === 0 && (
                  <EmptyState title="No traffic yet" detail="Open apps, join a channel, or run the demo controls." />
                )}
              </CardContent>
            </Card>
          )}

          {section === 'channels' && (
            <Card className="flex min-h-0 w-full flex-col overflow-hidden">
              <CardHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b">
                <CardTitle>Channel Visualizer</CardTitle>
                <Badge variant="outline">{runningApps.length} live apps</Badge>
              </CardHeader>
              <CardContent className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4">
                {(snapshot?.channels ?? []).map((channel) => (
                  <div key={channel.id} className="flex flex-col gap-2 rounded-lg border p-4" style={{ borderColor: `${channel.color}55`, background: `${channel.color}12` }}>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: channel.color }} />
                      <strong className="text-sm font-black text-foreground">{channel.name}</strong>
                      <Badge variant="outline" className="ml-auto">{channel.trafficCount} events</Badge>
                    </div>
                    <div className="text-xs font-bold text-muted-foreground">
                      {channel.memberAppIds.length > 0
                        ? channel.memberAppIds.map((appId) => appLabel(apps, appId)).join(' → ')
                        : 'No apps joined'}
                    </div>
                    <div className="text-[11px] font-bold text-[color:var(--shell-subtle)]">
                      Last context: {channel.lastContext?.type ?? 'none'}
                    </div>
                  </div>
                ))}
                {snapshot && snapshot.channels.length === 0 && (
                  <EmptyState title="No channels" detail="Joined apps and channel traffic will appear here." />
                )}
              </CardContent>
            </Card>
          )}

          {section === 'logs' && (
            <Card className="flex min-h-0 w-full flex-col overflow-hidden">
              <CardHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b">
                <CardTitle>Platform Log Trace</CardTitle>
                <Badge variant={logLevelFilter === 'all' ? 'outline' : 'warning'}>
                  {logLevelFilter === 'all' ? `${appLogs.length} logs` : `${logLevelFilter}: ${appLogs.length}`}
                </Badge>
              </CardHeader>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-4 py-2">
                {(['all', 'error', 'warning', 'info', 'debug'] as const).map((level) => (
                  <Button
                    key={level}
                    onClick={() => setLogLevelFilter(level)}
                    size="sm"
                    variant={logLevelFilter === level ? 'default' : 'outline'}
                  >
                    {level}
                  </Button>
                ))}
                <Button className="ml-auto" onClick={() => void clearPlatformLogs()} size="sm" variant="ghost">
                  Clear
                </Button>
              </div>
              <CardContent className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-3 pb-4">
                {appLogs.slice(0, 60).map((log) => (
                  <AppLogRow key={log.id} log={log} apps={apps} />
                ))}
                {snapshot && appLogs.length === 0 && (
                  <EmptyState title="No app logs yet" detail="Console output and window.platformLogs writes will appear here." />
                )}
              </CardContent>
            </Card>
          )}

          {section === 'routes' && (
            <Card className="flex min-h-0 w-full flex-col overflow-hidden">
              <CardHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b">
                <CardTitle>Route Matrix</CardTitle>
                <Badge variant={blockedRoutes.length > 0 ? 'warning' : 'success'}>
                  {activeRoutes.length} allowed / {blockedRoutes.length} blocked
                </Badge>
              </CardHeader>
              <CardContent className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-3 pb-4">
                {(snapshot?.routes ?? []).slice(0, 90).map((route) => (
                  <RouteRow key={route.id} route={route} apps={apps} />
                ))}
                {snapshot && snapshot.routes.length === 0 && (
                  <EmptyState title="No declared routes" detail="Add broadcasts/listeners or intents to the app directory." />
                )}
              </CardContent>
            </Card>
          )}

          {section === 'workflow' && (
            <Card className="flex min-h-0 w-full flex-col overflow-hidden">
              <CardHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b">
                <CardTitle>Workflow Replay + Smart Composer</CardTitle>
                <Badge variant="outline">{demoStatus || 'ready'}</Badge>
              </CardHeader>
              <CardContent className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-3">
                    <div className="text-xs font-black uppercase tracking-[0.06em] text-muted-foreground">
                      Smart workspace composer
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {WORKSPACE_TEMPLATES.map((template) => (
                        <Button key={template.id} onClick={() => void composeWorkspace(template)} size="sm" type="button">
                          {template.name}
                        </Button>
                      ))}
                      <Button onClick={() => void runDemo('Open market workspace', openMarketWorkspace)} size="sm" type="button" variant="secondary">
                        Open Market Apps
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="text-xs font-black uppercase tracking-[0.06em] text-muted-foreground">
                      Workflow time travel
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={captureWorkflow} size="sm" type="button">Capture Current Flow</Button>
                      <Button onClick={() => void replayWorkflow()} size="sm" type="button">Replay Last Flow</Button>
                      <Button
                        onClick={() => void runDemo('Broadcast AAPL', () => fdc3?.broadcast({ type: 'fdc3.instrument', id: { ticker: 'AAPL' }, name: 'Apple Inc.' }) ?? Promise.reject(new Error('FDC3 unavailable')))}
                        size="sm" type="button" variant="secondary"
                      >
                        Broadcast AAPL
                      </Button>
                      <Button
                        onClick={() => void runDemo('Raise ViewInstrument', () => fdc3?.raiseIntent('ViewInstrument', { type: 'fdc3.instrument', id: { ticker: 'AAPL' }, name: 'Apple Inc.' }).then(() => undefined) ?? Promise.reject(new Error('FDC3 unavailable')))}
                        size="sm" type="button" variant="secondary"
                      >
                        Raise ViewInstrument
                      </Button>
                      <Button onClick={() => void writeStructuredLog()} size="sm" type="button" variant="outline">
                        Write Platform Log
                      </Button>
                    </div>
                    <div className="text-[11px] font-bold text-[color:var(--shell-subtle)]">
                      {recording
                        ? `${recording.name}: ${recording.steps.length} steps from ${recording.sourceEventCount} events`
                        : 'No replay captured yet'}
                    </div>
                  </div>

                  {recording && recording.steps.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-black uppercase tracking-[0.06em] text-muted-foreground">
                        Captured steps
                      </div>
                      {recording.steps.map((step, i) => (
                        <div key={step.id} className="flex items-start gap-3 rounded-lg border bg-secondary/40 px-3 py-2.5 text-xs">
                          <span className="shrink-0 tabular-nums font-black text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-black text-foreground">{step.kind}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {step.appId ?? step.channelId ?? step.intentName ?? step.context?.type ?? ''}
                            </span>
                          </div>
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{timeLabel(step.ts)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, tone = 'var(--shell-accent)' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <Card className="flex flex-col gap-1 rounded-lg px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">{label}</div>
      <div className="truncate text-[26px] font-black leading-7" style={{ color: tone }}>{value}</div>
      <div className="truncate text-xs font-bold text-[color:var(--shell-subtle)]">{detail}</div>
    </Card>
  );
}

function ActivityRow({ event, apps }: { event: InteropActivityEvent; apps: AppEntry[] }) {
  const accent = eventAccent(event.status);
  return (
    <Card className="flex flex-col gap-1 rounded-lg p-2.5" style={{ borderColor: `${accent}44`, borderLeft: `4px solid ${accent}`, background: `${accent}12` }}>
      <div className="flex items-center gap-2">
        <strong className="text-xs text-foreground">{event.kind}</strong>
        <span className="ml-auto text-[10px] text-muted-foreground">{timeLabel(event.ts)}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">{event.message}</div>
      <div className="text-[10px] text-[color:var(--shell-subtle)]">
        {[appLabel(apps, event.sourceAppId), event.targetAppId ? `to ${appLabel(apps, event.targetAppId)}` : '', event.channelId ?? '', event.contextType ?? event.intentName ?? '']
          .filter(Boolean)
          .join(' / ')}
      </div>
    </Card>
  );
}

function AppLogRow({ log, apps }: { log: AppLogEvent; apps: AppEntry[] }) {
  const accent = logAccent(log.level);
  const dataLabel = log.data === undefined ? '' : JSON.stringify(log.data);
  return (
    <Card className="flex flex-col gap-1 rounded-lg p-2.5" style={{ borderColor: `${accent}44`, borderLeft: `4px solid ${accent}`, background: `${accent}10` }}>
      <div className="flex items-center gap-2">
        <Badge variant={log.level === 'error' ? 'destructive' : log.level === 'warning' ? 'warning' : 'secondary'}>{log.level}</Badge>
        <span className="truncate text-[11px] font-extrabold text-foreground">
          {appLabel(apps, log.appId)}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">{timeLabel(log.ts)}</span>
      </div>
      <div className="truncate font-mono text-[11px] text-muted-foreground">
        {log.message}
      </div>
      <div className="truncate text-[10px] text-[color:var(--shell-subtle)]">
        {[log.origin, log.runtime, log.category, log.sourceUrl ? `${log.sourceUrl}${log.line ? `:${log.line}` : ''}` : '', dataLabel].filter(Boolean).join(' / ')}
      </div>
    </Card>
  );
}

function RouteRow({ route, apps }: { route: InteropRouteSnapshot; apps: AppEntry[] }) {
  const color = route.allowed ? 'var(--shell-positive)' : '#f59e0b';
  return (
    <Card className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg p-2.5" style={{ background: route.allowed ? 'rgba(63, 185, 80, 0.08)' : 'rgba(245, 158, 11, 0.1)', borderColor: `${color}44` }}>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-extrabold text-foreground">
          {appLabel(apps, route.sourceAppId)} → {appLabel(apps, route.targetAppId)}
        </div>
        <div className="text-[10px] text-muted-foreground">{route.type}: {routeLabel(route)}</div>
      </div>
      <Badge variant={route.allowed ? 'success' : 'warning'}>{route.allowed ? 'allowed' : 'blocked'}</Badge>
    </Card>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-1 text-center text-muted-foreground">
      <strong className="text-sm font-black text-foreground">{title}</strong>
      <span className="text-xs font-bold">{detail}</span>
    </div>
  );
}
