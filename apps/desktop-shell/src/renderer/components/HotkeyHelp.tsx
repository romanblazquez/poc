import type * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog.js';

interface HotkeyHelpProps {
  open: boolean;
  onClose(): void;
}

const HOTKEYS = [
  { key: 'Cmd/Ctrl+1', label: 'Workspace' },
  { key: 'Cmd/Ctrl+2', label: 'Interop Flow' },
  { key: 'Cmd/Ctrl+3', label: 'Control Tower' },
  { key: 'Cmd/Ctrl+4', label: 'Manager' },
  { key: 'Cmd/Ctrl+5', label: 'Bridge' },
  { key: 'Cmd/Ctrl+0', label: 'App Launcher' },
  { key: 'Cmd/Ctrl+K', label: 'Ask the Desktop' },
  { key: 'Cmd/Ctrl+B', label: 'Notifications drawer' },
  { key: 'Cmd/Ctrl+/', label: 'Hotkeys' },
];

export function HotkeyHelp({ open, onClose }: HotkeyHelpProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[min(460px,92vw)] p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Shell-level navigation and desk utilities.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {HOTKEYS.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-4 border-b px-5 py-2.5 last:border-b-0"
            >
              <kbd className="min-w-[140px] rounded border border-border bg-muted px-2 py-1 font-mono text-[11px] font-semibold text-foreground">
                {item.key}
              </kbd>
              <span className="text-sm text-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
