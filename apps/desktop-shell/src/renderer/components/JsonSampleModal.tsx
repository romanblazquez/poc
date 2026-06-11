import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { Button } from './ui/button.js';

export interface JsonSampleModalProps {
  title: string;
  description: string;
  sample: unknown;
  onClose(): void;
}

export function JsonSampleModal({ title, description, sample, onClose }: JsonSampleModalProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const json = JSON.stringify(sample, null, 2);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex shrink-0 items-start gap-3 border-b px-5 py-4">
          <div className="flex-1">
            <div className="text-sm font-black text-foreground">{title}</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* JSON body */}
        <div className="relative min-h-0 flex-1 overflow-auto">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="absolute right-3 top-3 z-10 h-7 gap-1.5 text-xs"
          >
            {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <pre className="overflow-auto p-5 font-mono text-[11px] leading-relaxed text-foreground">
            <code>{json}</code>
          </pre>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end border-t px-5 py-3">
          <Button type="button" size="sm" variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
