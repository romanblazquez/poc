import { useEffect, useState } from 'react';
import type { UserChannel } from '@fdc3-poc/fdc3-core';
import { Button } from './ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';
import { cn } from '../lib/utils.js';

interface ChannelBarProps {
  currentChannel: UserChannel | null;
  onChannelChange: (ch: UserChannel | null) => void;
}

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className={cn(
            'gap-2 border',
            currentChannel && 'border-current',
          )}
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
  );
}
