import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppEntry } from '../App.js';
import { cn } from '../lib/utils.js';
import { AppIcon } from './AppIcon.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';

interface Candidate {
  appId: string;
  title?: string;
  description?: string;
  icon?: string;
  isRunning: boolean;
  instanceId?: number;
}

interface ResolverRequest {
  requestId: string;
  intent: string;
  contextType?: string;
  contextName?: string;
  candidates: Candidate[];
}

interface IntentResolverApi {
  onRequest(handler: (req: ResolverRequest) => void): () => void;
  respond(requestId: string, appId: string | null, instanceId?: number): Promise<void>;
}

function getApi(): IntentResolverApi | undefined {
  return (window as unknown as { shellChrome?: { intentResolver?: IntentResolverApi } }).shellChrome?.intentResolver;
}

const REMEMBER_KEY = 'fdc3.shell.intentResolver.remembered.v1';

function readRemembered(): Record<string, { appId: string; instanceId?: number }> {
  try {
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    return raw ? (JSON.parse(raw) as Record<string, { appId: string; instanceId?: number }>) : {};
  } catch {
    return {};
  }
}

function writeRemembered(map: Record<string, { appId: string; instanceId?: number }>): void {
  try {
    window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(map));
  } catch { /* noop */ }
}

const CATEGORY_COLORS: Record<string, string> = {
  CRM: '#4080e8',
  Investments: '#40c080',
  Markets: '#e8d840',
  Payments: '#e84080',
  Trading: '#91b4ff',
};

interface IntentResolverDialogProps {
  apps: AppEntry[];
}

export function IntentResolverDialog({ apps }: IntentResolverDialogProps): JSX.Element | null {
  const api = getApi();
  const [request, setRequest] = useState<ResolverRequest | null>(null);
  const [remember, setRemember] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const respond = useCallback((req: ResolverRequest, appId: string | null, instanceId?: number) => {
    if (remember && appId) {
      const map = readRemembered();
      map[req.intent] = { appId, instanceId };
      writeRemembered(map);
    }
    void api?.respond(req.requestId, appId, instanceId);
    setRequest(null);
    setRemember(false);
  }, [api, remember]);

  useEffect(() => {
    if (!api) return;
    return api.onRequest((req) => {
      // Check for a remembered choice that is still a valid candidate.
      const remembered = readRemembered()[req.intent];
      if (remembered) {
        const candidate = req.candidates.find(
          (c) => c.appId === remembered.appId &&
            (remembered.instanceId === undefined || c.instanceId === remembered.instanceId),
        );
        if (candidate) {
          void api.respond(req.requestId, candidate.appId, candidate.instanceId);
          return;
        }
      }
      setFocusedIndex(0);
      setRequest(req);
    });
  }, [api]);

  // Keyboard navigation within the candidate list.
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, request.candidates.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const c = request.candidates[focusedIndex];
        if (c) respond(request, c.appId, c.instanceId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, focusedIndex, respond]);

  if (!api || !request) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) respond(request, null); }}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[80vh] w-full max-w-md flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <div className="mb-1 text-[10px] font-black uppercase tracking-[0.08em] text-muted-foreground">
            Resolve intent
          </div>
          <DialogTitle className="text-base font-black">{request.intent}</DialogTitle>
          {(request.contextType ?? request.contextName) && (
            <DialogDescription className="text-xs">
              {request.contextType && <span className="font-mono">{request.contextType}</span>}
              {request.contextName && <span className="text-muted-foreground"> — {request.contextName}</span>}
            </DialogDescription>
          )}
        </DialogHeader>

        <div ref={listRef} className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
          {request.candidates.map((candidate, i) => {
            const appDef = apps.find((a) => a.appId === candidate.appId);
            const categoryColor = CATEGORY_COLORS[appDef?.category ?? ''] ?? 'var(--shell-accent)';
            const isFocused = i === focusedIndex;

            return (
              <button
                key={`${candidate.appId}-${candidate.instanceId ?? 'new'}`}
                type="button"
                onClick={() => respond(request, candidate.appId, candidate.instanceId)}
                onMouseEnter={() => setFocusedIndex(i)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                  isFocused
                    ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)]'
                    : 'border-border bg-card hover:border-[color:var(--shell-accent-border)] hover:bg-secondary',
                )}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-xl"
                  style={{ background: `${categoryColor}20`, borderColor: `${categoryColor}50`, color: categoryColor }}
                >
                  <AppIcon icon={candidate.icon} fallback={(candidate.title ?? candidate.appId).slice(0, 1)} size={22} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="truncate text-sm font-black text-foreground">
                    {candidate.title ?? candidate.appId}
                  </div>
                  {candidate.description && (
                    <div className="line-clamp-1 text-[11px] font-bold text-muted-foreground">
                      {candidate.description}
                    </div>
                  )}
                  {appDef?.category && (
                    <div className="text-[10px] font-bold" style={{ color: categoryColor }}>
                      {appDef.category}
                    </div>
                  )}
                </div>
                <Badge variant={candidate.isRunning ? 'success' : 'secondary'} className="shrink-0">
                  {candidate.isRunning ? 'Running' : 'Open'}
                </Badge>
              </button>
            );
          })}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between border-t px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-[color:var(--shell-accent)]"
            />
            Remember for {request.intent}
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={() => respond(request, null)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
