import { Save } from 'lucide-react';
import { Button } from './ui/button.js';

interface WorkspaceToolbarProps {
  onSave: () => void;
  saveStatus: string;
}

export function WorkspaceToolbar({ onSave, saveStatus }: WorkspaceToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      {saveStatus && (
        <span className="text-xs font-semibold text-[color:var(--shell-positive)]">{saveStatus}</span>
      )}
      <Button onClick={onSave} size="sm" type="button" variant="secondary">
        <Save />
        Save
      </Button>
    </div>
  );
}
