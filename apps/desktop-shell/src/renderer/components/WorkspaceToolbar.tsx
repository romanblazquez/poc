import { useEffect, useRef, useState } from 'react';
import { Save, LayoutTemplate, X } from 'lucide-react';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';

interface WorkspaceToolbarProps {
  onSave?: () => void;
  saveStatus?: string;
  lastSavedAt?: number | null;
  onSaveAsLayout?: (name: string, description: string) => void;
}

function relativeTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function WorkspaceToolbar({ onSave, saveStatus, lastSavedAt, onSaveAsLayout }: WorkspaceToolbarProps) {
  const [label, setLabel] = useState<string>('');
  const [savingLayout, setSavingLayout] = useState(false);
  const [layoutName, setLayoutName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!lastSavedAt) { setLabel(''); return; }
    setLabel(relativeTime(lastSavedAt));
    const id = setInterval(() => setLabel(relativeTime(lastSavedAt)), 5000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  useEffect(() => {
    if (savingLayout) nameRef.current?.focus();
  }, [savingLayout]);

  const displayLabel = saveStatus ?? (lastSavedAt ? `Autosaved ${label}` : '');

  const handleSaveLayout = () => {
    const name = layoutName.trim();
    if (!name || !onSaveAsLayout) return;
    onSaveAsLayout(name, '');
    setSavingLayout(false);
    setLayoutName('');
  };

  const cancelSaveLayout = () => {
    setSavingLayout(false);
    setLayoutName('');
  };

  if (savingLayout) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          ref={nameRef}
          placeholder="Layout name…"
          value={layoutName}
          onChange={(e) => setLayoutName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLayout(); if (e.key === 'Escape') cancelSaveLayout(); }}
          className="h-7 w-40 text-xs"
        />
        <Button size="sm" type="button" onClick={handleSaveLayout} disabled={!layoutName.trim()} className="h-7 gap-1 px-2 text-xs">
          <Save className="size-3" />
          Save
        </Button>
        <button type="button" onClick={cancelSaveLayout} className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {displayLabel && (
        <span className={`text-xs font-semibold ${saveStatus ? 'text-[color:var(--shell-positive)]' : 'text-muted-foreground'}`}>
          {displayLabel}
        </span>
      )}
      {onSaveAsLayout && (
        <Button onClick={() => setSavingLayout(true)} size="sm" type="button" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
          <LayoutTemplate className="size-3.5" />
          Save as Layout
        </Button>
      )}
      {onSave && (
        <Button onClick={onSave} size="sm" type="button" variant="secondary">
          <Save />
          Save
        </Button>
      )}
    </div>
  );
}
