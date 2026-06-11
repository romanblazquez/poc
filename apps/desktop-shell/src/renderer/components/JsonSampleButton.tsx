import type * as React from 'react';
import { useState } from 'react';
import { Info } from 'lucide-react';
import { JsonSampleModal } from './JsonSampleModal.js';

export interface JsonSampleButtonProps {
  title: string;
  description: string;
  sample: unknown;
  className?: string;
}

export function JsonSampleButton({ title, description, sample, className }: JsonSampleButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`View ${title} sample`}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className ?? ''}`}
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <JsonSampleModal
          title={title}
          description={description}
          sample={sample}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
