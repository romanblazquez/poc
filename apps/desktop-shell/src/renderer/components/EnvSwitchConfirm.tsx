import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './ui/button.js';

const COUNTDOWN_SECONDS = 10;

export interface EnvSwitchConfirmProps {
  fromName: string;
  toName: string;
  toColor?: string;
  onConfirm(): void;
  onCancel(): void;
}

export function EnvSwitchConfirm({ fromName, toName, toColor, onConfirm, onCancel }: EnvSwitchConfirmProps): React.JSX.Element {
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!confirmedRef.current) {
            confirmedRef.current = true;
            onConfirm();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onConfirm]);

  const handleConfirm = () => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    onConfirm();
  };

  const circumference = 2 * Math.PI * 18;
  const progress = (remaining / COUNTDOWN_SECONDS) * circumference;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-destructive/40 bg-card shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-destructive/20 bg-destructive/5 px-5 py-4">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <div className="text-sm font-extrabold text-foreground">Switching to {toName}</div>
            <div className="text-[11px] text-muted-foreground">You are leaving <strong>{fromName}</strong></div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center gap-5 px-6 py-6">
          {/* Circular countdown */}
          <div className="relative flex items-center justify-center">
            <svg width="48" height="48" className="-rotate-90">
              <circle cx="24" cy="24" r="18" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle
                cx="24" cy="24" r="18"
                fill="none"
                stroke={toColor ?? 'var(--destructive)'}
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - progress}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.9s linear' }}
              />
            </svg>
            <span className="absolute text-base font-black tabular-nums text-foreground">{remaining}</span>
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">
              Switching to{' '}
              <span className="inline-flex items-center gap-1.5">
                {toColor && <span className="inline-block size-2.5 rounded-full" style={{ background: toColor }} />}
                {toName}
              </span>
              {' '}in {remaining}s
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              This will reload the app directory and workspace for {toName}.
              Live data feeds and open contexts will be reset.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t px-5 py-4">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm} style={{ background: toColor }}>
            Switch now
          </Button>
        </div>
      </div>
    </div>
  );
}
