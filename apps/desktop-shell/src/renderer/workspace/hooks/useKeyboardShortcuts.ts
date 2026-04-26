import { useEffect } from 'react';

interface KeyboardShortcutOptions {
  enabled: boolean;
  gridSize: number;
  onDelete: () => void;
  onNudge: (dx: number, dy: number) => void;
  onRedo: () => void;
  onUndo: () => void;
}

export function useKeyboardShortcuts({
  enabled,
  gridSize,
  onDelete,
  onNudge,
  onRedo,
  onUndo,
}: KeyboardShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        onRedo();
        return;
      }
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        onUndo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        onDelete();
        return;
      }

      const step = event.shiftKey ? Math.max(1, gridSize / 12) : 1;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onNudge(-step, 0);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNudge(step, 0);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        onNudge(0, -step);
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        onNudge(0, step);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, gridSize, onDelete, onNudge, onRedo, onUndo]);
}

