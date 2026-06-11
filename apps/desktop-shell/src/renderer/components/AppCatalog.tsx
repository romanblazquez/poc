import { useState } from 'react';
import type * as React from 'react';
import type { AppEntry } from '../App.js';
import { cn } from '../lib/utils.js';
import { AppDirectoryEditor } from './AppDirectoryEditor.js';
import { Manager } from './Manager.js';

type Tab = 'registry' | 'distribution';

interface AppCatalogProps {
  apps: AppEntry[];
  onAppsChanged: (apps: AppEntry[]) => void;
}

export function AppCatalog({ apps, onAppsChanged }: AppCatalogProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('registry');

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-0 border-b bg-card px-4">
        {([
          { id: 'registry' as Tab,      label: 'Registry',      description: 'Local catalogue — add, edit, remove apps' },
          { id: 'distribution' as Tab,  label: 'Distribution',  description: 'Remote feed sync, update management, entitlements' },
        ] as const).map(({ id, label, description }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            title={description}
            className={cn(
              'relative px-4 py-2.5 text-sm font-semibold transition-colors',
              tab === id
                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:content-[""]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', tab === 'registry' ? 'p-4' : '')}>
        {tab === 'registry' && (
          <AppDirectoryEditor apps={apps} onAppsChanged={onAppsChanged} />
        )}
        {tab === 'distribution' && (
          <Manager apps={apps} />
        )}
      </div>
    </div>
  );
}
