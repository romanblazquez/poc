import type { Fdc3DesktopAgent } from '@fdc3-poc/fdc3-core';
declare global { interface Window { fdc3: Fdc3DesktopAgent & { onChannelChanged(h: (ch: unknown) => void): () => void; getAppList(): Promise<unknown[]>; saveWorkspace(n?: string): Promise<void>; }; } }
