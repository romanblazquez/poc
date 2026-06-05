import type { Fdc3Context } from './context.js';
import type { FlowPolicy } from './app.js';

export type InteropActivityKind =
  | 'context.broadcasted'
  | 'context.delivered'
  | 'context.blocked'
  | 'intent.raised'
  | 'intent.resolved'
  | 'intent.delivered'
  | 'intent.blocked'
  | 'intent.failed'
  | 'channel.joined'
  | 'channel.left'
  | 'app.opened'
  | 'app.focused'
  | 'appChannel.broadcasted'
  | 'privateChannel.created'
  | 'privateChannel.connected'
  | 'privateChannel.broadcasted'
  | 'directory.updated'
  | 'policy.updated';

export type InteropActivityStatus = 'ok' | 'blocked' | 'error' | 'info';

export interface InteropActivityEvent {
  id: string;
  ts: number;
  kind: InteropActivityKind;
  status: InteropActivityStatus;
  message: string;
  sourceAppId?: string;
  targetAppId?: string;
  appId?: string;
  channelId?: string | null;
  contextType?: string;
  intentName?: string;
  payload?: unknown;
}

export type AppLogLevel = 'debug' | 'info' | 'warning' | 'error';

export type AppLogRuntime = 'shell' | 'workspace' | 'standalone' | 'embedded' | 'external' | 'unknown';

export type AppLogOrigin = 'console' | 'platform' | 'navigation' | 'renderer';

export interface AppLogEvent {
  id: string;
  ts: number;
  appId: string;
  appTitle?: string;
  runtime: AppLogRuntime;
  webContentsId: number;
  level: AppLogLevel;
  origin: AppLogOrigin;
  message: string;
  category?: string;
  data?: unknown;
  line?: number;
  sourceUrl?: string;
  pageUrl?: string;
}

export interface PlatformLogsApi {
  log(level: AppLogLevel | 'warn', message: unknown, data?: unknown, category?: string): Promise<boolean>;
  debug(message: unknown, data?: unknown, category?: string): Promise<boolean>;
  info(message: unknown, data?: unknown, category?: string): Promise<boolean>;
  warn(message: unknown, data?: unknown, category?: string): Promise<boolean>;
  error(message: unknown, data?: unknown, category?: string): Promise<boolean>;
  getLogs(): Promise<AppLogEvent[]>;
  clear(): Promise<boolean>;
  onLog(handler: (event: AppLogEvent) => void): () => void;
  getInfo(): { provider: string; apiVersion: string; capabilities: string[] };
}

export interface RuntimeAppSnapshot {
  appId: string;
  title: string;
  icon?: string;
  category?: string;
  running: boolean;
  webContentsIds: number[];
  currentChannelId?: string | null;
}

export interface RuntimeChannelSnapshot {
  id: string;
  name: string;
  color: string;
  memberAppIds: string[];
  lastContext: Pick<Fdc3Context, 'type' | 'name' | 'id'> | null;
  trafficCount: number;
}

export interface InteropRouteSnapshot {
  id: string;
  type: 'context' | 'intent';
  sourceAppId: string;
  targetAppId: string;
  contextType?: string;
  intentName?: string;
  allowed: boolean;
}

export interface InteropSnapshot {
  generatedAt: number;
  activity: InteropActivityEvent[];
  appLogs: AppLogEvent[];
  apps: RuntimeAppSnapshot[];
  channels: RuntimeChannelSnapshot[];
  routes: InteropRouteSnapshot[];
  flowPolicy: FlowPolicy | null;
  metrics: {
    totalEvents: number;
    blockedEvents: number;
    deliveredEvents: number;
    runningApps: number;
    logEvents: number;
    errorLogEvents: number;
  };
}

export type WorkflowStepKind =
  | 'openApp'
  | 'joinChannel'
  | 'broadcast'
  | 'raiseIntent';

export interface WorkflowStep {
  id: string;
  ts: number;
  kind: WorkflowStepKind;
  appId?: string;
  channelId?: string | null;
  context?: Fdc3Context;
  intentName?: string;
}

export interface WorkflowRecording {
  id: string;
  name: string;
  createdAt: number;
  sourceEventCount: number;
  steps: WorkflowStep[];
}
