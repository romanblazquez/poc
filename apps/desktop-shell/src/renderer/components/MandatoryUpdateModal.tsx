import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { Button } from './ui/button.js';

interface MandatoryUpdate {
  version: string | null;
  label: string | null;
  appCount: number;
  mandatoryCountdownSecs: number;
  mandatoryDeadline: string | null;
  diff: { addedApps: string[]; removedApps: string[]; changedApps: string[] };
}

interface MandatoryUpdateModalProps {
  update: MandatoryUpdate;
  onApply: () => Promise<void>;
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

/**
 * Mandatory update — full-screen blocking overlay.
 *
 * Rules:
 * - Always blocks the entire shell. No dismiss, no defer.
 * - Escape key is blocked globally while mounted.
 * - Countdown auto-applies when it reaches 0.
 * - "Update Now" applies immediately.
 * - If mandatoryDeadline is set, it's shown in the message for context, but
 *   does NOT enable deferral — mandatory always blocks immediately.
 */
export function MandatoryUpdateModal({ update, onApply }: MandatoryUpdateModalProps): React.JSX.Element {
  const totalSecs = update.mandatoryCountdownSecs > 0 ? update.mandatoryCountdownSecs : 60;
  const [remaining, setRemaining] = useState(totalSecs);
  const [applying, setApplying] = useState(false);
  const appliedRef = useRef(false);

  const doApply = useCallback(async () => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    setApplying(true);
    await onApply();
  }, [onApply]);

  // Countdown
  useEffect(() => {
    if (applying) return;
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          void doApply();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [applying, doApply]);

  // Block Escape globally — mandatory cannot be bypassed
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); }
    };
    window.addEventListener('keydown', block, { capture: true });
    return () => window.removeEventListener('keydown', block, { capture: true });
  }, []);

  const pct = Math.round((remaining / totalSecs) * 100);
  const urgency = remaining <= 10
    ? 'var(--shell-negative, #ef4444)'
    : remaining <= 30
      ? '#f59e0b'
      : 'var(--shell-accent, #6366f1)';

  const versionLabel = update.version ? `v${update.version}` : 'new version';
  const { addedApps, removedApps, changedApps } = update.diff;

  const bodyMsg = update.mandatoryDeadline
    ? `Your organisation has deployed a mandatory update${new Date(update.mandatoryDeadline) > new Date() ? ` required by ${formatDeadline(update.mandatoryDeadline)}` : ` (deadline: ${formatDeadline(update.mandatoryDeadline)} — expired)`}. This desktop cannot be used until it is applied.`
    : 'Your organisation has deployed a mandatory update. This desktop cannot be used until it is applied.';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Mandatory update required — desktop locked"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex w-full max-w-md flex-col gap-0 overflow-hidden rounded-2xl border bg-card shadow-2xl"
        style={{ borderColor: urgency }}
      >
        {/* Header */}
        <div
          className="flex items-start gap-4 border-b p-6"
          style={{ borderColor: 'var(--border)', background: `color-mix(in srgb, ${urgency} 10%, transparent)` }}
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
            style={{ background: `color-mix(in srgb, ${urgency} 20%, transparent)` }}
          >
            🔒
          </div>
          <div className="flex-1">
            <div className="text-base font-black text-foreground">Desktop Locked — Mandatory Update</div>
            <div className="mt-0.5 text-sm font-semibold text-muted-foreground">
              {versionLabel}{update.label ? ` · ${update.label}` : ''} · {update.appCount} apps
            </div>
          </div>
        </div>

        {/* Diff summary */}
        {(addedApps.length > 0 || removedApps.length > 0 || changedApps.length > 0) && (
          <div className="grid grid-cols-3 divide-x border-b text-center" style={{ borderColor: 'var(--border)' }}>
            <DiffCell count={addedApps.length} label="Added" color="var(--shell-positive, #22c55e)" />
            <DiffCell count={removedApps.length} label="Removed" color="var(--shell-negative, #ef4444)" />
            <DiffCell count={changedApps.length} label="Changed" color="#f59e0b" />
          </div>
        )}

        {/* Body */}
        <div className="flex flex-col gap-4 p-6">
          <p className="text-sm text-muted-foreground">{bodyMsg}</p>

          {/* Countdown ring */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <svg className="absolute inset-0" viewBox="0 0 96 96" fill="none">
                <circle cx="48" cy="48" r="42" stroke="var(--border)" strokeWidth="6" />
                <circle
                  cx="48" cy="48" r="42"
                  stroke={urgency}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
                  transform="rotate(-90 48 48)"
                  style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.5s' }}
                />
              </svg>
              <span className="text-2xl font-black tabular-nums" style={{ color: urgency }}>
                {remaining}
              </span>
            </div>
            <p className="text-xs font-bold text-muted-foreground">
              {applying ? 'Applying update…' : `Applying automatically in ${remaining}s`}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[10px] font-bold text-muted-foreground">
            This update cannot be deferred. The desktop is locked.
          </p>
          <Button
            type="button"
            disabled={applying}
            onClick={() => void doApply()}
            style={{ background: urgency, borderColor: urgency }}
          >
            {applying ? 'Applying…' : 'Update Now'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DiffCell({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-3">
      <span className="text-lg font-black tabular-nums" style={{ color: count > 0 ? color : 'var(--shell-muted)' }}>
        {count}
      </span>
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
    </div>
  );
}
