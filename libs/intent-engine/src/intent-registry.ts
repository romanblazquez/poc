/**
 * IntentRegistry — tracks which windows have registered intent listeners.
 *
 * The app directory declares STATIC intent capabilities (for resolver UI).
 * The intent registry tracks RUNTIME registrations (which window is listening right now).
 * Both are needed: static for showing "Payment Action handles StartPayment",
 * runtime for knowing which webContents to forward the message to.
 */

export interface IntentListenerRecord {
  webContentsId: number;
  appId: string;
  intent: string;
}

export class IntentRegistry {
  /** intent → Set<webContentsId> */
  private readonly listeners = new Map<string, Set<number>>();
  /** webContentsId → appId */
  private readonly windowAppMap = new Map<number, string>();

  registerListener(webContentsId: number, appId: string, intent: string): void {
    if (!this.listeners.has(intent)) {
      this.listeners.set(intent, new Set());
    }
    this.listeners.get(intent)!.add(webContentsId);
    this.windowAppMap.set(webContentsId, appId);
  }

  unregisterListener(webContentsId: number, intent: string): void {
    this.listeners.get(intent)?.delete(webContentsId);
  }

  removeWindow(webContentsId: number): void {
    for (const set of this.listeners.values()) {
      set.delete(webContentsId);
    }
    this.windowAppMap.delete(webContentsId);
  }

  getListeners(intent: string): number[] {
    return [...(this.listeners.get(intent) ?? [])];
  }

  hasListeners(intent: string): boolean {
    const set = this.listeners.get(intent);
    return !!set && set.size > 0;
  }

  getAppId(webContentsId: number): string | undefined {
    return this.windowAppMap.get(webContentsId);
  }
}
