import { useCallback, useEffect, useRef, useState } from 'react';
import type { Fdc3Context, InteropActivityEvent, UserChannel } from '@fdc3-poc/fdc3-core';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover.js';
import { cn } from '../lib/utils.js';

interface ClipboardEntry {
  id: string;
  ts: number;
  context: Fdc3Context;
  contextType: string;
  channelId: string | null;
  channelName?: string;
  sourceAppId?: string;
}

const MAX_ENTRIES = 50;

interface Fdc3Activity {
  onInteropActivity?: (handler: (event: InteropActivityEvent) => void) => () => void;
  broadcast?: (ctx: unknown) => Promise<void>;
  getUserChannels?: () => Promise<UserChannel[]>;
}

function channelColor(channelId: string | null, channels: UserChannel[]): string {
  if (!channelId) return 'var(--shell-accent)';
  return channels.find((c) => c.id === channelId)?.displayMetadata.color ?? 'var(--shell-accent)';
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function copyText(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => undefined);
}

export function ContextClipboard() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [channels, setChannels] = useState<UserChannel[]>([]);
  const [broadcastStatus, setBroadcastStatus] = useState<Record<string, 'ok' | 'err'>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const entriesRef = useRef<ClipboardEntry[]>([]);
  const channelsRef = useRef<UserChannel[]>([]);

  useEffect(() => {
    const fdc3 = window.fdc3 as unknown as Fdc3Activity | undefined;
    void fdc3?.getUserChannels?.().then((chs) => {
      setChannels(chs);
      channelsRef.current = chs;
    });
  }, []);

  useEffect(() => {
    const fdc3 = window.fdc3 as unknown as Fdc3Activity | undefined;
    const unsub = fdc3?.onInteropActivity?.((event) => {
      if (
        event.kind !== 'context.broadcasted' &&
        event.kind !== 'appChannel.broadcasted' &&
        event.kind !== 'privateChannel.broadcasted'
      ) return;

      const ctx = event.payload as Fdc3Context | undefined;
      if (!ctx || typeof ctx !== 'object' || !ctx.type) return;

      const channel = event.channelId
        ? channelsRef.current.find((c) => c.id === event.channelId)
        : undefined;

      const entry: ClipboardEntry = {
        id: event.id,
        ts: event.ts,
        context: ctx,
        contextType: event.contextType ?? ctx.type,
        channelId: event.channelId ?? null,
        channelName: channel?.displayMetadata.name,
        sourceAppId: event.sourceAppId,
      };

      const next = [entry, ...entriesRef.current].slice(0, MAX_ENTRIES);
      entriesRef.current = next;
      setEntries(next);
    });
    return () => unsub?.();
  }, []);

  const handleBroadcast = useCallback(async (entry: ClipboardEntry) => {
    const fdc3 = window.fdc3 as unknown as Fdc3Activity | undefined;
    if (!fdc3?.broadcast) return;
    try {
      await fdc3.broadcast(entry.context);
      setBroadcastStatus((prev) => ({ ...prev, [entry.id]: 'ok' }));
      setTimeout(() => setBroadcastStatus((prev) => { const n = { ...prev }; delete n[entry.id]; return n; }), 1500);
    } catch {
      setBroadcastStatus((prev) => ({ ...prev, [entry.id]: 'err' }));
      setTimeout(() => setBroadcastStatus((prev) => { const n = { ...prev }; delete n[entry.id]; return n; }), 2000);
    }
  }, []);

  const handleCopy = useCallback((entry: ClipboardEntry) => {
    copyText(JSON.stringify(entry.context, null, 2));
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  const filtered = filter
    ? entries.filter((e) =>
        e.contextType.toLowerCase().includes(filter.toLowerCase()) ||
        (e.sourceAppId ?? '').toLowerCase().includes(filter.toLowerCase()) ||
        (e.channelName ?? '').toLowerCase().includes(filter.toLowerCase()),
      )
    : entries;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="relative gap-1.5">
          <span className="text-[13px]">📋</span>
          <span>Clipboard</span>
          {entries.length > 0 && (
            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
              {entries.length > 99 ? '99+' : entries.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="flex w-[460px] flex-col gap-0 overflow-hidden p-0"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="text-sm font-black text-foreground">Context Clipboard</span>
          <Badge variant="secondary" className="shrink-0">{entries.length} captured</Badge>
          {entries.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="ml-auto text-[10px]"
              onClick={() => { setEntries([]); entriesRef.current = []; }}
            >
              Clear all
            </Button>
          )}
        </div>

        {/* Filter */}
        {entries.length > 5 && (
          <div className="border-b px-3 py-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by type, app, channel…"
              className="w-full rounded-md border bg-muted px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[color:var(--shell-accent)]"
            />
          </div>
        )}

        {/* Entry list */}
        <div className="scrollbar-thin max-h-[480px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="text-2xl">📋</span>
              <span className="text-xs font-bold text-muted-foreground">
                {entries.length === 0
                  ? 'No context broadcasts captured yet.\nBroadcasts on any channel will appear here.'
                  : 'No entries match your filter.'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/60">
              {filtered.map((entry) => {
                const color = channelColor(entry.channelId, channels);
                const status = broadcastStatus[entry.id];
                return (
                  <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                    <div
                      className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: color }}
                      title={entry.channelName ?? entry.channelId ?? 'global'}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {/* Type row */}
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[11px] font-black text-foreground">
                          {entry.contextType}
                        </span>
                        {entry.channelName && (
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px]"
                            style={{ color, borderColor: `${color}60` }}
                          >
                            {entry.channelName}
                          </Badge>
                        )}
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {timeLabel(entry.ts)}
                        </span>
                      </div>
                      {/* Source */}
                      {entry.sourceAppId && (
                        <div className="text-[10px] text-muted-foreground">
                          from <span className="font-mono">{entry.sourceAppId}</span>
                        </div>
                      )}
                      {/* Context preview */}
                      <pre className="scrollbar-thin max-h-20 overflow-auto rounded border bg-muted px-2 py-1.5 text-[10px] leading-relaxed text-foreground">
                        {JSON.stringify(entry.context, null, 2)}
                      </pre>
                      {/* Actions */}
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="h-5 px-2 text-[10px]"
                          onClick={() => handleCopy(entry)}
                        >
                          {copiedId === entry.id ? 'Copied!' : 'Copy JSON'}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant={status === 'ok' ? 'default' : status === 'err' ? 'destructive' : 'secondary'}
                          className={cn('h-5 px-2 text-[10px]', !status && 'text-foreground')}
                          onClick={() => void handleBroadcast(entry)}
                        >
                          {status === 'ok' ? 'Broadcast sent ✓' : status === 'err' ? 'Failed' : 'Re-broadcast'}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
