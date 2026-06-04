import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AppLogEvent, AppLogLevel, Fdc3Context, InteropActivityEvent, InteropRouteSnapshot, InteropSnapshot, PlatformLogsApi, UserChannel, WorkflowRecording, WorkflowStep } from '@fdc3-poc/fdc3-core';
import type { AppEntry, SmartWorkspaceTemplate } from '../App.js';

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

const PANEL: CSSProperties = {
  background: 'linear-gradient(180deg, var(--shell-panel), var(--shell-panel-2))',
  border: '1px solid var(--shell-border)',
  borderRadius: 12,
  boxShadow: 'var(--shell-shadow)',
  minHeight: 0,
  overflow: 'hidden',
};

const PANEL_HEADER: CSSProperties = {
  alignItems: 'center',
  borderBottom: '1px solid var(--shell-border)',
  color: 'var(--shell-muted)',
  display: 'flex',
  fontSize: 11,
  fontWeight: 900,
  justifyContent: 'space-between',
  letterSpacing: 0.7,
  padding: '10px 12px',
  textTransform: 'uppercase',
};

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

const WORKFLOW_STORAGE_KEY = 'fdc3.command-center.workflow.v1';

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
  const fdc3 = window.fdc3 as unknown as CommandCenterFdc3Api | undefined;
  const platformLogs = window.platformLogs;

  const refresh = async (): Promise<void> => {
    if (!fdc3?.getInteropSnapshot) return;
    setSnapshot(await fdc3.getInteropSnapshot());
  };

  useEffect(() => {
    void refresh();
    const unsubscribeActivity = fdc3?.onInteropActivity?.(() => {
      void refresh();
    });
    const unsubscribeLogs = platformLogs?.onLog?.(() => {
      void refresh();
    });
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
      const ok = await platformLogs?.info('Structured audit log from Command Center', {
        desk: 'cash-equities',
        workflow: activeRoutes.length > 0 ? 'live-interop' : 'diagnostics',
        runningApps: runningApps.length,
      }, 'command-center');
      if (!ok) throw new Error('platformLogs unavailable');
    });
  };

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1.15fr 0.85fr', gridTemplateRows: 'auto 1fr', minHeight: 0, flex: 1 }}>
      <section style={{ ...PANEL, gridColumn: '1 / -1' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 1, background: 'var(--shell-border)' }}>
          <MetricCard label="Runtime Apps" value={String(snapshot?.metrics.runningApps ?? 0)} detail={`${apps.length} registered`} />
          <MetricCard label="Delivered" value={String(snapshot?.metrics.deliveredEvents ?? 0)} detail="contexts + intents" />
          <MetricCard label="Blocked" value={String(snapshot?.metrics.blockedEvents ?? 0)} detail={snapshot?.flowPolicy?.enabled ? 'flow policy active' : 'policy inactive'} tone={snapshot?.metrics.blockedEvents ? '#f59e0b' : 'var(--shell-positive)'} />
          <MetricCard label="App Logs" value={String(snapshot?.metrics.logEvents ?? 0)} detail="console + structured" />
          <MetricCard label="Log Errors" value={String(snapshot?.metrics.errorLogEvents ?? 0)} detail="errors/crashes/navigation" tone={snapshot?.metrics.errorLogEvents ? '#ef4444' : 'var(--shell-positive)'} />
          <MetricCard label="Current Channel" value={currentChannel?.displayMetadata.name ?? 'None'} detail={currentChannel?.id ?? 'global broadcast'} tone={currentChannel?.displayMetadata.color ?? 'var(--shell-muted)'} />
        </div>
      </section>

      <section style={{ ...PANEL, display: 'flex', flexDirection: 'column' }}>
        <div style={PANEL_HEADER}>
          <span>Live Activity Timeline</span>
          <span>{snapshot?.metrics.totalEvents ?? 0} events</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto', padding: 12 }}>
          {(snapshot?.activity ?? []).slice(0, 80).map((event) => (
            <ActivityRow key={event.id} event={event} apps={apps} />
          ))}
          {snapshot && snapshot.activity.length === 0 && (
            <EmptyState title="No traffic yet" detail="Open apps, join a channel, or run the demo controls." />
          )}
        </div>
      </section>

      <div style={{ display: 'grid', gap: 12, gridTemplateRows: 'minmax(190px, 0.55fr) minmax(230px, 0.75fr) minmax(260px, 1fr)', minHeight: 0 }}>
        <section style={{ ...PANEL, display: 'flex', flexDirection: 'column' }}>
          <div style={PANEL_HEADER}>
            <span>Channel Visualizer</span>
            <span>{runningApps.length} live apps</span>
          </div>
          <div style={{ display: 'grid', gap: 8, padding: 12, overflow: 'auto', flex: 1, minHeight: 0 }}>
            {(snapshot?.channels ?? []).map((channel) => (
              <div key={channel.id} style={{ border: `1px solid ${channel.color}55`, borderRadius: 10, padding: 10, background: `${channel.color}12` }}>
                <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                  <span style={{ background: channel.color, borderRadius: 99, height: 12, width: 12 }} />
                  <strong style={{ color: 'var(--shell-text)', fontSize: 12 }}>{channel.name}</strong>
                  <span style={{ color: 'var(--shell-muted)', fontSize: 11, marginLeft: 'auto' }}>{channel.trafficCount} events</span>
                </div>
                <div style={{ color: 'var(--shell-muted)', fontSize: 11, marginTop: 6 }}>
                  {channel.memberAppIds.length > 0
                    ? channel.memberAppIds.map((appId) => appLabel(apps, appId)).join(' -> ')
                    : 'No apps joined'}
                </div>
                <div style={{ color: 'var(--shell-subtle)', fontSize: 10, marginTop: 4 }}>
                  Last context: {channel.lastContext?.type ?? 'none'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...PANEL, display: 'flex', flexDirection: 'column' }}>
          <div style={PANEL_HEADER}>
            <span>Platform Log Trace</span>
            <span>{logLevelFilter === 'all' ? `${appLogs.length} logs` : `${logLevelFilter}: ${appLogs.length}`}</span>
          </div>
          <div style={{ alignItems: 'center', borderBottom: '1px solid var(--shell-border)', display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10 }}>
            {(['all', 'error', 'warning', 'info', 'debug'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setLogLevelFilter(level)}
                style={{
                  background: logLevelFilter === level ? 'var(--shell-accent-soft)' : 'transparent',
                  border: '1px solid var(--shell-border)',
                  borderRadius: 999,
                  color: logLevelFilter === level ? 'var(--shell-accent-text)' : 'var(--shell-muted)',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 900,
                  padding: '5px 8px',
                  textTransform: 'uppercase',
                }}
              >
                {level}
              </button>
            ))}
            <button
              onClick={() => void clearPlatformLogs()}
              style={{ background: 'transparent', border: '1px solid var(--shell-border)', borderRadius: 999, color: 'var(--shell-muted)', cursor: 'pointer', fontSize: 10, fontWeight: 900, marginLeft: 'auto', padding: '5px 8px', textTransform: 'uppercase' }}
            >
              Clear
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'auto', padding: 12 }}>
            {appLogs.slice(0, 60).map((log) => (
              <AppLogRow key={log.id} log={log} apps={apps} />
            ))}
            {snapshot && appLogs.length === 0 && (
              <EmptyState title="No app logs yet" detail="Console output and window.platformLogs writes will appear here." />
            )}
          </div>
        </section>

        <section style={{ ...PANEL, display: 'flex', flexDirection: 'column' }}>
          <div style={PANEL_HEADER}>
            <span>Route Matrix</span>
            <span>{activeRoutes.length} allowed / {blockedRoutes.length} blocked</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'auto', padding: 12 }}>
            {(snapshot?.routes ?? []).slice(0, 90).map((route) => (
              <RouteRow key={route.id} route={route} apps={apps} />
            ))}
            {snapshot && snapshot.routes.length === 0 && (
              <EmptyState title="No declared routes" detail="Add broadcasts/listeners or intents to the app directory." />
            )}
          </div>
        </section>
      </div>

      <section style={{ ...PANEL, gridColumn: '1 / -1' }}>
        <div style={PANEL_HEADER}>
          <span>Workflow Replay + Smart Composer</span>
          <span>{demoStatus || 'ready'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 12, padding: 12 }}>
          <div>
            <div style={{ color: 'var(--shell-muted)', fontSize: 11, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>
              Smart workspace composer
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {WORKSPACE_TEMPLATES.map((template) => (
                <DemoButton key={template.id} onClick={() => void composeWorkspace(template)}>
                  {template.name}
                </DemoButton>
              ))}
              <DemoButton onClick={() => void runDemo('Open market workspace', openMarketWorkspace)}>
                Open Market Apps
              </DemoButton>
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--shell-muted)', fontSize: 11, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>
              Workflow time travel
            </div>
            <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <DemoButton onClick={captureWorkflow}>Capture Current Flow</DemoButton>
              <DemoButton onClick={() => void replayWorkflow()}>Replay Last Flow</DemoButton>
              <DemoButton onClick={() => void runDemo('Broadcast AAPL', () => fdc3?.broadcast({ type: 'fdc3.instrument', id: { ticker: 'AAPL' }, name: 'Apple Inc.' }) ?? Promise.reject(new Error('FDC3 unavailable')))}>
                Broadcast AAPL
              </DemoButton>
              <DemoButton onClick={() => void runDemo('Raise ViewInstrument', () => fdc3?.raiseIntent('ViewInstrument', { type: 'fdc3.instrument', id: { ticker: 'AAPL' }, name: 'Apple Inc.' }).then(() => undefined) ?? Promise.reject(new Error('FDC3 unavailable')))}>
                Raise ViewInstrument
              </DemoButton>
              <DemoButton onClick={() => void writeStructuredLog()}>
                Write Platform Log
              </DemoButton>
            </div>
            <div style={{ color: 'var(--shell-subtle)', fontSize: 10, marginTop: 8 }}>
              {recording
                ? `${recording.name}: ${recording.steps.length} steps from ${recording.sourceEventCount} events`
                : 'No replay captured yet'}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, detail, tone = 'var(--shell-accent)' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div style={{ background: 'var(--shell-panel)', padding: '14px 16px' }}>
      <div style={{ color: 'var(--shell-muted)', fontSize: 10, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: tone, fontSize: 26, fontWeight: 950, lineHeight: '30px', marginTop: 3 }}>{value}</div>
      <div style={{ color: 'var(--shell-subtle)', fontSize: 11 }}>{detail}</div>
    </div>
  );
}

function ActivityRow({ event, apps }: { event: InteropActivityEvent; apps: AppEntry[] }) {
  const accent = eventAccent(event.status);
  return (
    <div style={{ border: `1px solid ${accent}44`, borderLeft: `4px solid ${accent}`, borderRadius: 9, background: `${accent}12`, padding: '8px 10px' }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
        <strong style={{ color: 'var(--shell-text)', fontSize: 12 }}>{event.kind}</strong>
        <span style={{ color: 'var(--shell-muted)', fontSize: 10, marginLeft: 'auto' }}>{timeLabel(event.ts)}</span>
      </div>
      <div style={{ color: 'var(--shell-muted)', fontSize: 11, marginTop: 4 }}>{event.message}</div>
      <div style={{ color: 'var(--shell-subtle)', fontSize: 10, marginTop: 4 }}>
        {[appLabel(apps, event.sourceAppId), event.targetAppId ? `to ${appLabel(apps, event.targetAppId)}` : '', event.channelId ?? '', event.contextType ?? event.intentName ?? '']
          .filter(Boolean)
          .join(' / ')}
      </div>
    </div>
  );
}

function AppLogRow({ log, apps }: { log: AppLogEvent; apps: AppEntry[] }) {
  const accent = logAccent(log.level);
  const dataLabel = log.data === undefined ? '' : JSON.stringify(log.data);
  return (
    <div style={{ border: `1px solid ${accent}44`, borderLeft: `4px solid ${accent}`, borderRadius: 9, background: `${accent}10`, padding: '8px 10px' }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
        <strong style={{ color: accent, fontSize: 11, textTransform: 'uppercase' }}>{log.level}</strong>
        <span style={{ color: 'var(--shell-text)', fontSize: 11, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {appLabel(apps, log.appId)}
        </span>
        <span style={{ color: 'var(--shell-muted)', fontSize: 10, marginLeft: 'auto' }}>{timeLabel(log.ts)}</span>
      </div>
      <div style={{ color: 'var(--shell-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {log.message}
      </div>
      <div style={{ color: 'var(--shell-subtle)', fontSize: 10, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {[log.origin, log.runtime, log.category, log.sourceUrl ? `${log.sourceUrl}${log.line ? `:${log.line}` : ''}` : '', dataLabel].filter(Boolean).join(' / ')}
      </div>
    </div>
  );
}

function RouteRow({ route, apps }: { route: InteropRouteSnapshot; apps: AppEntry[] }) {
  const color = route.allowed ? 'var(--shell-positive)' : '#f59e0b';
  return (
    <div style={{ alignItems: 'center', background: route.allowed ? 'rgba(63, 185, 80, 0.08)' : 'rgba(245, 158, 11, 0.1)', border: `1px solid ${color}44`, borderRadius: 8, display: 'grid', gap: 8, gridTemplateColumns: '1fr auto', padding: '8px 10px' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--shell-text)', fontSize: 11, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {appLabel(apps, route.sourceAppId)} {'->'} {appLabel(apps, route.targetAppId)}
        </div>
        <div style={{ color: 'var(--shell-muted)', fontSize: 10 }}>{route.type}: {routeLabel(route)}</div>
      </div>
      <span style={{ color, fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>{route.allowed ? 'allowed' : 'blocked'}</span>
    </div>
  );
}

function DemoButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--shell-accent-soft)',
        border: '1px solid var(--shell-accent-border)',
        borderRadius: 8,
        color: 'var(--shell-accent-text)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 900,
        height: 32,
        padding: '0 13px',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ alignItems: 'center', color: 'var(--shell-muted)', display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center', minHeight: 120, textAlign: 'center' }}>
      <strong style={{ color: 'var(--shell-text)', fontSize: 12 }}>{title}</strong>
      <span style={{ fontSize: 11 }}>{detail}</span>
    </div>
  );
}
