/** Serialisable state for a single app window. */
export interface WindowState {
  appId: string;
  channelId: string | null;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMinimized: boolean;
}
