import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Returns true when running on macOS. Safe to call in renderer (uses navigator.platform). */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform.toLowerCase().includes('mac');
}

/** The platform-appropriate modifier key label: '⌘' on macOS, 'Ctrl' on Windows/Linux. */
export function modKey(): string {
  return isMacOS() ? '⌘' : 'Ctrl';
}

/** Format a keyboard shortcut for display, e.g. modShortcut('K') → '⌘K' or 'Ctrl+K'. */
export function modShortcut(key: string): string {
  return isMacOS() ? `⌘${key}` : `Ctrl+${key}`;
}
