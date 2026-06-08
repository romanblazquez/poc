import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Radio, Lock, LockOpen, PanelLeft, PanelRight, PanelBottom } from 'lucide-react';
import type { Fdc3Context, InteropActivityEvent, InteropSnapshot, UserChannel } from '@fdc3-poc/fdc3-core';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { cn } from '../lib/utils.js';

interface ChannelBarProps {
  currentChannel: UserChannel | null;
  onChannelChange: (ch: UserChannel | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HISTORY_LIMIT = 20;

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => undefined);
}

export function ChannelBar({ currentChannel, onChannelChange, open, onOpenChange }: ChannelBarProps) {
  const [channels, setChannels] = useState<UserChannel[]>([]);
  const [currentContext, setCurrentContext] = useState<Fdc3Context | null>(null);
  const [history, setHistory] = useState<InteropActivityEvent[]>([]);
  const [snapshot, setSnapshot] = useState<InteropSnapshot | null>(null);
  const [copied, setCopied] = useState(false);
  const [locked, setLocked] = useState(false);
  const [position, setPosition] = useState<'left' | 'right' | 'bottom'>(() => {
    const s = window.localStorage.getItem('fdc3.shell.channel-panel.position');
    return (s === 'left' || s === 'right' || s === 'bottom') ? s : 'right';
  });
  const historyRef = useRef<InteropActivityEvent[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset lock when drawer closes
  useEffect(() => { if (!open) setLocked(false); }, [open]);

  // Renderer-document fallback for outside clicks above the backdrop.
  useEffect(() => {
    if (!open || locked) return;
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, locked, onOpenChange]);

  const savePosition = (pos: 'left' | 'right' | 'bottom') => {
    setPosition(pos);
    window.localStorage.setItem('fdc3.shell.channel-panel.position', pos);
  };

  useEffect(() => {
    if (!window.fdc3) return;
    void window.fdc3.getUserChannels().then(setChannels);
  }, []);

  const refresh = useCallback(async () => {
    const fdc3 = window.fdc3 as unknown as {
      getCurrentContext(type?: string): Promise<Fdc3Context | null>;
      getInteropSnapshot(): Promise<InteropSnapshot>;
    } | undefined;
    if (!fdc3 || !currentChannel) return;
    const [ctx, snap] = await Promise.all([
      fdc3.getCurrentContext().catch(() => null),
      fdc3.getInteropSnapshot().catch(() => null),
    ]);
    setCurrentContext(ctx);
    if (snap) setSnapshot(snap);
  }, [currentChannel]);

  useEffect(() => {
    if (!open || !currentChannel) return;
    void refresh();

    const fdc3Activity = window.fdc3 as unknown as {
      onInteropActivity?: (handler: (event: InteropActivityEvent) => void) => () => void;
    } | undefined;

    const unsub = fdc3Activity?.onInteropActivity?.((event) => {
      if (
        event.channelId !== currentChannel.id ||
        !['context.broadcasted', 'context.delivered', 'appChannel.broadcasted'].includes(event.kind)
      ) return;
      const next = [event, ...historyRef.current]
        .sort((a, b) => b.ts - a.ts)
        .slice(0, HISTORY_LIMIT);
      historyRef.current = next;
      setHistory(next);
      void refresh();
    });

    return () => unsub?.();
  }, [open, currentChannel, refresh]);

  const join = async (id: string) => {
    await window.fdc3.joinUserChannel(id);
    const ch = channels.find((c) => c.id === id) ?? null;
    onChannelChange(ch);
    setHistory([]);
    historyRef.current = [];
  };

  const leave = async () => {
    await window.fdc3.leaveCurrentChannel();
    onChannelChange(null);
    setCurrentContext(null);
    setHistory([]);
    historyRef.current = [];
  };

  const handleCopy = () => {
    if (!currentContext) return;
    copyToClipboard(JSON.stringify(currentContext, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const channelColor = currentChannel?.displayMetadata.color ?? '#6b7280';
  const channelSnapshot = snapshot?.channels.find((c) => c.id === currentChannel?.id);
  const memberAppIds = channelSnapshot?.memberAppIds ?? [];

  return (
    <>
      {/* ── Trigger: colored dot button ── */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        title={currentChannel ? `Channel: ${currentChannel.displayMetadata.name}` : 'No channel — click to join one'}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-md transition-colors',
          open
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {currentChannel ? (
          <span
            className="h-3.5 w-3.5 rounded-full ring-2 ring-black/10"
            style={{ backgroundColor: channelColor }}
          />
        ) : (
          <Radio className="size-4" />
        )}
      </button>

      {createPortal(
        <>
          {/* Backdrop captures clicks that would otherwise be swallowed by Electron webviews. */}
          {!locked && (
            <div
              aria-hidden="true"
              onPointerDown={() => onOpenChange(false)}
              className={cn(
                'fixed inset-0 z-[9050] bg-black/30 backdrop-blur-[2px] transition-opacity duration-300',
                open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
              )}
            />
          )}

          {/* Render outside the draggable top bar so left-side controls accept the first click. */}
          <div
            ref={panelRef}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className={cn(
              'fixed z-[9100] flex flex-col bg-card shadow-2xl transition-transform duration-300 ease-out',
              position === 'right' && 'right-0 top-0 h-screen w-[400px]',
              position === 'left'  && 'left-0 top-0 h-screen w-[400px]',
              position === 'bottom' && 'bottom-0 left-0 right-0 h-[400px] w-full',
              position === 'right'  && (open ? 'translate-x-0' : 'translate-x-full'),
              position === 'left'   && (open ? 'translate-x-0' : '-translate-x-full'),
              position === 'bottom' && (open ? 'translate-y-0' : 'translate-y-full'),
            )}
          >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-black text-foreground">Channels</h2>
            <p className="text-[11px] text-muted-foreground">
              {currentChannel
                ? <>On <span className="font-bold" style={{ color: channelColor }}>{currentChannel.displayMetadata.name}</span></>
                : 'Not joined to any channel'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Position picker */}
            <div className="flex overflow-hidden rounded-md border">
              {([
                { pos: 'left',   Icon: PanelLeft   },
                { pos: 'bottom', Icon: PanelBottom  },
                { pos: 'right',  Icon: PanelRight   },
              ] as const).map(({ pos, Icon }) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => savePosition(pos)}
                  title={`Dock ${pos}`}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center border-r last:border-r-0 transition-colors',
                    position === pos
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-3" />
                </button>
              ))}
            </div>
            {/* Lock */}
            <button
              type="button"
              onClick={() => setLocked((v) => !v)}
              title={locked ? 'Unlock — backdrop and auto-close restored' : 'Lock — keep open, no backdrop'}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                locked
                  ? 'bg-primary/15 text-primary hover:bg-primary/25'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            </button>
            {/* Close */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* ── Content — flex-col for left/right, flex-row columns for bottom ── */}
        {position === 'bottom' ? (
          <div className="flex min-h-0 flex-1 flex-row divide-x overflow-hidden">

            {/* Col 1 — channel switcher */}
            <div className="flex w-52 shrink-0 flex-col overflow-y-auto scrollbar-thin px-3 py-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Switch Channel</p>
              <div className="flex flex-col gap-0.5">
                {channels.map((ch) => {
                  const isActive = currentChannel?.id === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => void join(ch.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent',
                        isActive && 'bg-accent/60 font-semibold',
                      )}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: ch.displayMetadata.color }} />
                      <span className="flex-1 truncate">{ch.displayMetadata.name}</span>
                      {isActive && <span className="text-[10px] font-bold" style={{ color: ch.displayMetadata.color }}>✓</span>}
                    </button>
                  );
                })}
              </div>
              {currentChannel && (
                <button
                  type="button"
                  onClick={() => void leave()}
                  className="mt-2 rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  Leave channel
                </button>
              )}
            </div>

            {/* Col 2 — context + members (only when on a channel) */}
            {currentChannel ? (
              <div className="flex min-w-0 flex-1 flex-col overflow-y-auto scrollbar-thin divide-y">
                {/* Channel identity */}
                <div className="flex shrink-0 items-center gap-2.5 px-4 py-2.5" style={{ borderBottomColor: `${channelColor}30` }}>
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: channelColor }} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[11px] font-black text-foreground">{currentChannel.displayMetadata.name}</span>
                    <span className="truncate text-[10px] font-mono text-muted-foreground">{currentChannel.id}</span>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{channelSnapshot?.trafficCount ?? 0} events</Badge>
                </div>
                {/* Current context */}
                <div className="flex flex-1 flex-col px-4 py-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Current Context</span>
                    {currentContext && (
                      <Button type="button" size="xs" variant="ghost" onClick={handleCopy} className="h-5 px-2 text-[10px]">
                        {copied ? 'Copied!' : 'Copy JSON'}
                      </Button>
                    )}
                  </div>
                  {currentContext ? (
                    <pre className="scrollbar-thin flex-1 overflow-auto rounded-md border bg-muted p-2 text-[10px] leading-relaxed text-foreground">
                      {JSON.stringify(currentContext, null, 2)}
                    </pre>
                  ) : (
                    <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs font-bold text-muted-foreground">
                      No context on this channel
                    </div>
                  )}
                </div>
                {/* Members */}
                {memberAppIds.length > 0 && (
                  <div className="shrink-0 px-4 py-2.5">
                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Members ({memberAppIds.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {memberAppIds.map((appId) => (
                        <Badge key={appId} variant="secondary" className="font-mono text-[10px]">{appId}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-xs font-bold text-muted-foreground">
                Join a channel to inspect it
              </div>
            )}

            {/* Col 3 — broadcast history */}
            <div className="flex w-60 shrink-0 flex-col overflow-y-auto scrollbar-thin px-3 py-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Recent Broadcasts</p>
              {history.length === 0 ? (
                <p className="text-xs font-bold text-muted-foreground">No broadcasts yet</p>
              ) : (
                <div className="flex flex-col divide-y divide-border/60">
                  {history.map((event) => (
                    <div key={event.id} className="flex items-start gap-2 py-1.5">
                      <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: channelColor }} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[11px] font-black text-foreground">{event.contextType ?? event.kind}</span>
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{timeLabel(event.ts)}</span>
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {event.sourceAppId ?? 'unknown'}{event.targetAppId ? ` → ${event.targetAppId}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : (
          /* ── Vertical layout (left / right) ── */
          <>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {/* Channel list */}
              <div className="border-b px-4 py-3">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Switch Channel</p>
                <div className="flex flex-col gap-0.5">
                  {channels.map((ch) => {
                    const isActive = currentChannel?.id === ch.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => void join(ch.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent',
                          isActive && 'bg-accent/60 font-semibold',
                        )}
                      >
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: ch.displayMetadata.color }} />
                        <span className="flex-1">{ch.displayMetadata.name}</span>
                        {isActive && <span className="text-xs font-bold" style={{ color: ch.displayMetadata.color }}>✓ Active</span>}
                      </button>
                    );
                  })}
                </div>
                {currentChannel && (
                  <button
                    type="button"
                    onClick={() => void leave()}
                    className="mt-2 w-full rounded-md px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    Leave channel
                  </button>
                )}
              </div>

              {/* Inspector */}
              {currentChannel && (
                <>
                  <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderBottomColor: `${channelColor}40` }}>
                    <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: channelColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-foreground">{currentChannel.displayMetadata.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{currentChannel.id}</div>
                    </div>
                    <Badge variant="outline" className="shrink-0">{channelSnapshot?.trafficCount ?? 0} events</Badge>
                  </div>
                  <div className="border-b px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Current Context</span>
                      {currentContext && (
                        <Button type="button" size="xs" variant="ghost" onClick={handleCopy} className="h-5 px-2 text-[10px]">
                          {copied ? 'Copied!' : 'Copy JSON'}
                        </Button>
                      )}
                    </div>
                    {currentContext ? (
                      <pre className="scrollbar-thin max-h-40 overflow-auto rounded-md border bg-muted p-2.5 text-[11px] leading-relaxed text-foreground">
                        {JSON.stringify(currentContext, null, 2)}
                      </pre>
                    ) : (
                      <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs font-bold text-muted-foreground">
                        No context on this channel
                      </div>
                    )}
                  </div>
                  {memberAppIds.length > 0 && (
                    <div className="border-b px-4 py-3">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Members ({memberAppIds.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {memberAppIds.map((appId) => (
                          <Badge key={appId} variant="secondary" className="font-mono text-[10px]">{appId}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="px-4 py-3">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">Recent Broadcasts</p>
                    {history.length === 0 ? (
                      <p className="text-xs font-bold text-muted-foreground">No broadcasts yet in this session</p>
                    ) : (
                      <div className="flex flex-col divide-y divide-border/60">
                        {history.map((event) => (
                          <div key={event.id} className="flex items-start gap-2.5 py-2">
                            <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: channelColor }} />
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-[11px] font-black text-foreground">{event.contextType ?? event.kind}</span>
                                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{timeLabel(event.ts)}</span>
                              </div>
                              <div className="truncate text-[10px] text-muted-foreground">
                                {event.sourceAppId ?? 'unknown'}{event.targetAppId ? ` → ${event.targetAppId}` : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="shrink-0 border-t px-5 py-3">
              <p className="text-[10px] text-muted-foreground/50">
                FDC3 User Channels · <code className="font-mono">window.fdc3.joinUserChannel()</code>
              </p>
            </div>
          </>
        )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
