import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from './ui/button.js';

interface WorkspaceToolbarProps {
  onSave: () => void;
  saveStatus: string;
  lastSavedAt?: number | null;
}

function relativeTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function WorkspaceToolbar({ onSave, saveStatus, lastSavedAt }: WorkspaceToolbarProps) {
  const [label, setLabel] = useState<string>('');

  useEffect(() => {
    if (!lastSavedAt) { setLabel(''); return; }
    setLabel(relativeTime(lastSavedAt));
    const id = setInterval(() => setLabel(relativeTime(lastSavedAt)), 5000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  const displayLabel = saveStatus || (lastSavedAt ? `Autosaved ${label}` : '');

  return (
    <div className="flex items-center gap-2">
      {displayLabel && (
        <span className={`text-xs font-semibold ${saveStatus ? 'text-[color:var(--shell-positive)]' : 'text-muted-foreground'}`}>
          {displayLabel}
        </span>
      )}
      <Button onClick={onSave} size="sm" type="button" variant="secondary">
        <Save />
        Save
      </Button>
    </div>
  );
}
