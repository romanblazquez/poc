import type { Fdc3DesktopAgent } from '@fdc3-poc/fdc3-core';

declare global {
  interface Window {
    fdc3: Fdc3DesktopAgent & {
      onChannelChanged(handler: (ch: unknown) => void): () => void;
      getAppList(): Promise<unknown[]>;
      saveWorkspace(name?: string): Promise<void>;
    };
  }
}
