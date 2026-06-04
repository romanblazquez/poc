/**
 * Interop Copilot — the "Ask the Desktop" command bar.
 *
 * Cmd/Ctrl-K opens it. Type plain English; it produces a reviewable FDC3 action
 * plan and, on Run, executes each step against the live fleet through window.fdc3.
 * This is the pitch's wow moment: natural language orchestrating real, independent
 * apps over the open FDC3 standard.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AppEntry } from '../App.js';
import { planWithCopilot, type CopilotPlan, type CopilotStep } from './planner.js';

/** Minimal view of window.fdc3 the executor needs (kept local to avoid global type churn). */
interface CopilotFdc3 {
  getUserChannels(): Promise<{ id: string; displayMetadata: { name: string; color: string } }[]>;
  open(app: { appId: string }): Promise<void>;
  broadcast(context: unknown): Promise<void>;
  joinUserChannel(channelId: string): Promise<void>;
  raiseIntent(intent: string, context?: unknown): Promise<unknown>;
}

function fdc3(): CopilotFdc3 {
  return (window as unknown as { fdc3: CopilotFdc3 }).fdc3;
}

type StepStatus = 'idle' | 'running' | 'done' | 'error';

const EXAMPLES = [
  'show me apple and pull up the news',
  'broadcast TSLA on green',
  'pay Maria Garcia',
  'open market watch and portfolio',
];

const STEP_ICON: Record<CopilotStep['kind'], string> = {
  joinChannel: '⛓',
  broadcast: '📡',
  open: '🪟',
  raiseIntent: '⚡',
};

export function InteropCopilot({
  apps,
  open,
  onClose,
  currentChannelId,
}: {
  apps: AppEntry[];
  open: boolean;
  onClose: () => void;
  currentChannelId: string | null;
}): React.ReactElement | null {
  const [input, setInput] = useState('');
  const [plan, setPlan] = useState<CopilotPlan | null>(null);
  const [statuses, setStatuses] = useState<StepStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [planning, setPlanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setInput('');
      setPlan(null);
      setStatuses([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const generate = useCallback(async () => {
    if (!input.trim()) return;
    setPlanning(true);
    try {
      const channels = (await fdc3().getUserChannels()).map((c) => ({
        id: c.id, name: c.displayMetadata.name, color: c.displayMetadata.color,
      }));
      const next = await planWithCopilot(input, { apps, channels, currentChannelId });
      setPlan(next);
      setStatuses(next.steps.map(() => 'idle'));
    } finally {
      setPlanning(false);
    }
  }, [apps, currentChannelId, input]);

  const run = useCallback(async () => {
    if (!plan || plan.steps.length === 0) return;
    setRunning(true);
    for (let i = 0; i < plan.steps.length; i++) {
      setStatuses((prev) => prev.map((s, idx) => (idx === i ? 'running' : s)));
      try {
        const step = plan.steps[i];
        if (step.kind === 'joinChannel') await fdc3().joinUserChannel(step.channelId);
        else if (step.kind === 'broadcast') await fdc3().broadcast(step.context);
        else if (step.kind === 'open') await fdc3().open({ appId: step.appId });
        else if (step.kind === 'raiseIntent') await fdc3().raiseIntent(step.intent, step.context);
        setStatuses((prev) => prev.map((s, idx) => (idx === i ? 'done' : s)));
        await new Promise((r) => setTimeout(r, 350)); // let the audience see each action land
      } catch {
        setStatuses((prev) => prev.map((s, idx) => (idx === i ? 'error' : s)));
      }
    }
    setRunning(false);
  }, [plan]);

  if (!open) return null;

  const accent = 'var(--shell-accent)';
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', justifyContent: 'center',
        alignItems: 'flex-start', paddingTop: '12vh', background: 'rgba(5, 8, 13, 0.55)', backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640, maxWidth: '92vw', background: 'var(--shell-panel)', border: `1px solid var(--shell-border)`,
          borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.55)', overflow: 'hidden',
        }}
      >
        {/* Input row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--shell-border)' }}>
          <span style={{ color: accent, fontSize: 16, fontWeight: 800 }}>✦</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void generate();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Ask the desktop…  e.g. show me apple and pull up the news"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--shell-text)',
              fontSize: 15, fontWeight: 500,
            }}
          />
          <button
            onClick={() => void generate()}
            disabled={planning || !input.trim()}
            style={{
              background: accent, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px',
              fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: planning || !input.trim() ? 0.5 : 1,
            }}
          >
            {planning ? 'Planning…' : 'Plan ⏎'}
          </button>
        </div>

        {/* Plan / examples */}
        <div style={{ padding: 14, maxHeight: '52vh', overflow: 'auto' }}>
          {!plan && (
            <div style={{ color: 'var(--shell-muted)', fontSize: 12 }}>
              <div style={{ marginBottom: 8, fontWeight: 700, color: 'var(--shell-subtle)' }}>Try:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => { setInput(ex); setTimeout(() => void generate(), 0); }}
                    style={{
                      background: 'var(--shell-panel-2)', border: '1px solid var(--shell-border)', borderRadius: 99,
                      color: 'var(--shell-text)', cursor: 'pointer', fontSize: 11, padding: '5px 11px',
                    }}
                  >{ex}</button>
                ))}
              </div>
            </div>
          )}

          {plan && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ color: 'var(--shell-subtle)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                  Plan (FDC3)
                </span>
                <span style={{ color: 'var(--shell-muted)', fontSize: 11 }}>{plan.summary}</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
                  background: 'var(--shell-accent-soft)', color: 'var(--shell-accent-text)', border: '1px solid var(--shell-accent-border)',
                }}>
                  {plan.mode === 'claude' ? '✦ Claude' : '✦ Deterministic'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {plan.steps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8,
                      background: 'var(--shell-panel-2)',
                      border: `1px solid ${statuses[i] === 'error' ? 'var(--shell-negative)' : statuses[i] === 'done' ? 'var(--shell-positive, #3fb950)' : 'var(--shell-border)'}`,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{STEP_ICON[step.kind]}</span>
                    <span style={{
                      color: 'var(--shell-muted)', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10,
                      fontWeight: 800, textTransform: 'uppercase', minWidth: 78,
                    }}>{step.kind}</span>
                    <span style={{ color: 'var(--shell-text)', fontSize: 12.5, flex: 1 }}>{step.label}</span>
                    <span style={{ fontSize: 13 }}>
                      {statuses[i] === 'running' ? '⏳' : statuses[i] === 'done' ? '✅' : statuses[i] === 'error' ? '⚠️' : ''}
                    </span>
                  </div>
                ))}
              </div>

              {plan.steps.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button
                    onClick={() => void run()}
                    disabled={running}
                    style={{
                      background: 'var(--shell-positive, #3fb950)', color: '#06210f', border: 'none', borderRadius: 8,
                      padding: '9px 18px', fontSize: 13, fontWeight: 850, cursor: 'pointer', opacity: running ? 0.6 : 1,
                    }}
                  >{running ? 'Running…' : '▶ Run plan'}</button>
                  <button
                    onClick={() => { setPlan(null); inputRef.current?.focus(); }}
                    style={{
                      background: 'transparent', color: 'var(--shell-text)', border: '1px solid var(--shell-border)',
                      borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >Edit</button>
                  <span style={{ marginLeft: 'auto', alignSelf: 'center', color: 'var(--shell-subtle)', fontSize: 10 }}>
                    Executed live via window.fdc3 — no app-specific glue
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
