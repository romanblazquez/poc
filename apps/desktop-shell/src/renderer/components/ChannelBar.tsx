import { useCallback, useEffect, useRef, useState } from 'react';
import type { Fdc3Context, InteropActivityEvent, InteropSnapshot, UserChannel } from '@fdc3-poc/fdc3-core';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover.js';
import { cn } from '../lib/utils.js';

interface ChannelBarProps {
  currentChannel: UserChannel | null;
  onChannelChange: (ch: UserChannel | null) => void;
}

const HISTORY_LIMIT = 20;

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => undefined);
}

// ─── Channel Inspector Popover ────────────────────────────────────────────────

interface ChannelInspectorProps {
  channel: UserChannel;
}

function ChannelInspector({ channel }: ChannelInspectorProps) {
  const [open, setOpen] = useState(false);
  const [currentContext, setCurrentContext] = useState<Fdc3Context | null>(null);
  const [history, setHistory] = useState<InteropActivityEvent[]>([]);
  const [snapshot, setSnapshot] = useState<InteropSnapshot | null>(null);
  const [copied, setCopied] = useState(false);
  const historyRef = useRef<InteropActivityEvent[]>([]);
  const color = channel.displayMetadata.color ?? 'var(--shell-accent)';

  const refresh = useCallback(async () => {
    const fdc3 = window.fdc3 as unknown as {
      getCurrentContext(type?: string): Promise<Fdc3Context | null>;
      getInteropSnapshot(): Promise<InteropSnapshot>;
    } | undefined;
    if (!fdc3) return;
    const [ctx, snap] = await Promise.all([
      fdc3.getCurrentContext().catch(() => null),
      fdc3.getInteropSnapshot().catch(() => null),
    ]);
    setCurrentContext(ctx);
    if (snap) setSnapshot(snap);
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();

    const fdc3Activity = window.fdc3 as unknown as {
      onInteropActivity?: (handler: (event: InteropActivityEvent) => void) => () => void;
    } | undefined;

    const unsub = fdc3Activity?.onInteropActivity?.((event) => {
      if (
        event.channelId !== channel.id ||
        !['context.broadcasted', 'context.delivered', 'appChannel.broadcasted'].includes(event.kind)
      ) return;
      const next = [event, ...historyRef.current].slice(0, HISTORY_LIMIT);
      historyRef.current = next;
      setHistory(next);
      void refresh();
    });

    return () => unsub?.();
  }, [open, channel.id, refresh]);

  const handleCopy = () => {
    if (!currentContext) return;
    copyToClipboard(JSON.stringify(currentContext, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const channelSnapshot = snapshot?.channels.find((c) => c.id === channel.id);
  const memberAppIds = channelSnapshot?.memberAppIds ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          title={`Inspect ${channel.displayMetadata.name}`}
          className="h-7 w-7 shrink-0 rounded-full p-0"
          style={{ color }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="sr-only">Inspect channel</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="flex w-[400px] flex-col gap-0 overflow-hidden p-0"
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 border-b px-4 py-3"
          style={{ borderBottomColor: `${color}40` }}
        >
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-foreground">{channel.displayMetadata.name}</div>
            <div className="text-[10px] font-bold text-muted-foreground">{channel.id}</div>
          </div>
          <Badge variant="outline" className="shrink-0">{channelSnapshot?.trafficCount ?? 0} events</Badge>
        </div>

        {/* Current context */}
        <div className="border-b px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">
              Current Context
            </span>
            {currentContext && (
              <Button type="button" size="xs" variant="ghost" onClick={handleCopy} className="h-5 px-2 text-[10px]">
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            )}
          </div>
          {currentContext ? (
            <pre className="scrollbar-thin max-h-36 overflow-auto rounded-md border bg-muted p-2.5 text-[11px] leading-relaxed text-foreground">
              {JSON.stringify(currentContext, null, 2)}
            </pre>
          ) : (
            <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs font-bold text-muted-foreground">
              No context on this channel
            </div>
          )}
        </div>

        {/* Member apps */}
        {memberAppIds.length > 0 && (
          <div className="border-b px-4 py-3">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">
              Members ({memberAppIds.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {memberAppIds.map((appId) => (
                <Badge key={appId} variant="secondary" className="font-mono text-[10px]">{appId}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Broadcast history */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.07em] text-muted-foreground">
            Recent Broadcasts
          </div>
          <div className="scrollbar-thin max-h-44 overflow-y-auto">
            {history.length === 0 ? (
              <div className="px-4 pb-4 text-xs font-bold text-muted-foreground">
                No broadcasts yet in this session
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border/60">
                {history.map((event) => (
                  <div key={event.id} className="flex items-start gap-2.5 px-4 py-2">
                    <div
                      className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[11px] font-black text-foreground">
                          {event.contextType ?? event.kind}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {timeLabel(event.ts)}
                        </span>
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {event.sourceAppId ?? 'unknown'}
                        {event.targetAppId ? ` → ${event.targetAppId}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── ChannelBar ───────────────────────────────────────────────────────────────

export function ChannelBar({ currentChannel, onChannelChange }: ChannelBarProps) {
  const [channels, setChannels] = useState<UserChannel[]>([]);

  useEffect(() => {
    if (!window.fdc3) return;
    void window.fdc3.getUserChannels().then(setChannels);
  }, []);

  const join = async (id: string) => {
    await window.fdc3.joinUserChannel(id);
    const ch = channels.find((c) => c.id === id) ?? null;
    onChannelChange(ch);
  };

  const leave = async () => {
    await window.fdc3.leaveCurrentChannel();
    onChannelChange(null);
  };

  const channelColor = currentChannel?.displayMetadata.color ?? '#555';

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={cn('gap-2 border', currentChannel && 'border-current')}
            style={currentChannel ? { color: channelColor } : undefined}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: channelColor }}
            />
            <span className="max-w-[112px] truncate">
              {currentChannel ? currentChannel.displayMetadata.name : 'No Channel'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>User Channels</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {channels.map((ch) => (
            <DropdownMenuItem
              key={ch.id}
              onClick={() => void join(ch.id)}
              className="gap-2"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: ch.displayMetadata.color }}
              />
              <span className="flex-1">{ch.displayMetadata.name}</span>
              {currentChannel?.id === ch.id && (
                <span className="text-xs" style={{ color: ch.displayMetadata.color }}>✓</span>
              )}
            </DropdownMenuItem>
          ))}
          {currentChannel && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void leave()}>
                Leave channel
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {currentChannel && <ChannelInspector channel={currentChannel} />}
    </div>
  );
}
