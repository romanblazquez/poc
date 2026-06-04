/**
 * Interop Copilot — deterministic natural-language → FDC3 plan.
 *
 * Turns a plain-English instruction ("show me apple and pull up the news") into a
 * reviewable list of FDC3 actions (broadcast / open / raiseIntent / joinChannel)
 * that the shell executes against the live fleet. This local planner needs no
 * network and never fails on stage; an optional Claude pass can replace it later
 * via the same `CopilotPlan` shape (see planWithCopilot).
 */

import type { AppEntry } from '../App.js';

export interface CopilotContext {
  type: string;
  id?: Record<string, string>;
  name?: string;
}

export type CopilotStep =
  | { kind: 'joinChannel'; channelId: string; label: string }
  | { kind: 'broadcast'; context: CopilotContext; label: string }
  | { kind: 'open'; appId: string; label: string }
  | { kind: 'raiseIntent'; intent: string; context?: CopilotContext; label: string };

export interface CopilotPlan {
  steps: CopilotStep[];
  summary: string;
  /** Which engine produced the plan — shown as a badge in the UI. */
  mode: 'deterministic' | 'claude';
}

export interface PlannerInputs {
  apps: AppEntry[];
  channels: { id: string; name: string; color: string }[];
  currentChannelId: string | null;
}

/** Common equity name → ticker, so "apple" resolves to AAPL. */
const TICKER_ALIASES: Record<string, string> = {
  apple: 'AAPL', aapl: 'AAPL',
  microsoft: 'MSFT', msft: 'MSFT',
  tesla: 'TSLA', tsla: 'TSLA',
  amazon: 'AMZN', amzn: 'AMZN',
  google: 'GOOGL', alphabet: 'GOOGL', googl: 'GOOGL',
  nvidia: 'NVDA', nvda: 'NVDA',
  meta: 'META', facebook: 'META',
  netflix: 'NFLX', nflx: 'NFLX',
};

/** Demo contacts the fleet understands. */
const CONTACT_ALIASES: Record<string, { name: string; email: string }> = {
  'maria garcia': { name: 'Maria Garcia', email: 'maria.garcia@example.com' },
  maria: { name: 'Maria Garcia', email: 'maria.garcia@example.com' },
  'john smith': { name: 'John Smith', email: 'john.smith@example.com' },
};

const STOPWORDS = new Set(['THE', 'AND', 'FOR', 'GET', 'PUT', 'NEW', 'BUY', 'P&L', 'KYC', 'USD', 'ALL']);

/** Build a keyword → appId index from the directory (title words + appId tokens). */
function indexApps(apps: AppEntry[]): { appId: string; keywords: string[]; app: AppEntry }[] {
  return apps
    .filter((a) => a.appId !== 'fdc3-conformance' && a.appId !== 'external-app' && a.appId !== 'cloud-sample')
    .map((app) => {
      const words = `${app.title} ${app.appId} ${app.category ?? ''}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2);
      return { appId: app.appId, keywords: [...new Set(words)], app };
    });
}

function findInstrumentViewer(apps: AppEntry[]): string | undefined {
  const handler = apps.find((a) => a.capabilities?.handlesIntents?.includes('ViewInstrument'));
  if (handler) return handler.appId;
  const listener = apps.find((a) => a.listensForContexts?.includes('fdc3.instrument'));
  return listener?.appId;
}

function detectTickers(input: string): string[] {
  const lower = input.toLowerCase();
  const found = new Set<string>();
  for (const [alias, ticker] of Object.entries(TICKER_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(lower)) found.add(ticker);
  }
  // Bare uppercase tokens in the ORIGINAL text, e.g. "AAPL", "TSLA".
  for (const tok of input.match(/\b[A-Z]{2,5}\b/g) ?? []) {
    if (!STOPWORDS.has(tok)) found.add(tok);
  }
  return [...found];
}

function detectContact(input: string): { name: string; email: string } | undefined {
  const lower = input.toLowerCase();
  for (const [alias, contact] of Object.entries(CONTACT_ALIASES)) {
    if (lower.includes(alias)) return contact;
  }
  return undefined;
}

function detectChannel(
  input: string,
  channels: { id: string; name: string; color: string }[],
): { id: string; name: string } | undefined {
  const lower = input.toLowerCase();
  for (const ch of channels) {
    if (lower.includes(ch.name.toLowerCase())) return { id: ch.id, name: ch.name };
  }
  return undefined;
}

/**
 * Deterministic planner. Produces an FDC3 action plan from free text using the
 * live app directory and channel list — no model required.
 */
export function buildPlan(input: string, ctx: PlannerInputs): CopilotPlan {
  const lower = ` ${input.toLowerCase()} `;
  const steps: CopilotStep[] = [];
  const appIndex = indexApps(ctx.apps);

  const wantsPayment = /\b(pay|wire|transfer|settle|send money|payment)\b/.test(lower);
  const wantsView = /\b(view|analyz|chart|drill|inspect)\b/.test(lower);

  // 1. Channel switch ("... on green")
  const channel = detectChannel(input, ctx.channels);
  if (channel && channel.id !== ctx.currentChannelId) {
    steps.push({ kind: 'joinChannel', channelId: channel.id, label: `Join ${channel.name} channel` });
  }

  // 2. Instruments → broadcast + ensure a viewer is open + optional intent
  const tickers = detectTickers(input);
  const viewerAppId = findInstrumentViewer(ctx.apps);
  const explicitlyMatchedAppIds = new Set<string>();
  for (const { appId, keywords } of appIndex) {
    if (keywords.some((kw) => lower.includes(` ${kw} `) || lower.includes(` ${kw}s `))) {
      explicitlyMatchedAppIds.add(appId);
    }
  }

  for (const ticker of tickers) {
    const context: CopilotContext = { type: 'fdc3.instrument', id: { ticker }, name: ticker };
    steps.push({ kind: 'broadcast', context, label: `Broadcast fdc3.instrument ${ticker}` });
    if (viewerAppId && !explicitlyMatchedAppIds.has(viewerAppId)) {
      steps.push({ kind: 'open', appId: viewerAppId, label: `Open ${appTitle(ctx.apps, viewerAppId)}` });
    }
    if (wantsView || tickers.length === 1) {
      const handler = ctx.apps.find((a) => a.capabilities?.handlesIntents?.includes('ViewInstrument'));
      if (handler) steps.push({ kind: 'raiseIntent', intent: 'ViewInstrument', context, label: `raiseIntent ViewInstrument ${ticker}` });
    }
  }

  // 3. Contacts → broadcast + open profile + optional payment intent
  const contact = detectContact(input);
  if (contact) {
    const context: CopilotContext = { type: 'fdc3.contact', id: { email: contact.email }, name: contact.name };
    steps.push({ kind: 'broadcast', context, label: `Broadcast fdc3.contact ${contact.name}` });
    if (wantsPayment) {
      const payHandler = ctx.apps.find((a) => a.capabilities?.handlesIntents?.includes('StartPayment'));
      if (payHandler) steps.push({ kind: 'raiseIntent', intent: 'StartPayment', context, label: `raiseIntent StartPayment for ${contact.name}` });
    }
  }

  // 4. Explicitly named apps → open
  for (const appId of explicitlyMatchedAppIds) {
    if (!steps.some((s) => s.kind === 'open' && s.appId === appId)) {
      steps.push({ kind: 'open', appId, label: `Open ${appTitle(ctx.apps, appId)}` });
    }
  }

  const summary = steps.length
    ? `${steps.length} FDC3 action${steps.length > 1 ? 's' : ''} ready`
    : 'No actions recognised — try "show AAPL and open news" or "pay Maria Garcia".';

  return { steps, summary, mode: 'deterministic' };
}

export function appTitle(apps: AppEntry[], appId: string): string {
  return apps.find((a) => a.appId === appId)?.title ?? appId;
}

/**
 * Single entry point used by the UI. Today it always uses the deterministic
 * planner; wiring a Claude pass later is a drop-in replacement that returns the
 * same `CopilotPlan` shape (set `mode: 'claude'`).
 */
export async function planWithCopilot(input: string, ctx: PlannerInputs): Promise<CopilotPlan> {
  return buildPlan(input, ctx);
}
