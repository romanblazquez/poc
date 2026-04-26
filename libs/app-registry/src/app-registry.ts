import type { AppDefinition } from '@fdc3-poc/fdc3-core';

/**
 * In-memory registry of available applications.
 * Loaded from app-directory.json at shell startup.
 * Can be queried by appId, intent, or context type.
 */
export class AppRegistry {
  private readonly apps = new Map<string, AppDefinition>();

  constructor(apps: AppDefinition[]) {
    for (const app of apps) {
      this.apps.set(app.appId, app);
    }
  }

  getAll(): AppDefinition[] {
    return [...this.apps.values()];
  }

  getById(appId: string): AppDefinition | undefined {
    return this.apps.get(appId);
  }

  /** Find all apps that declare a handler for the given intent */
  findByIntent(intent: string): AppDefinition[] {
    return [...this.apps.values()].filter(
      (app) => app.intents?.some((i) => i.intent === intent),
    );
  }

  /** Find all apps that listen for a specific context type */
  findByContextType(contextType: string): AppDefinition[] {
    return [...this.apps.values()].filter(
      (app) => app.listensForContexts?.includes(contextType) ?? false,
    );
  }

  size(): number {
    return this.apps.size;
  }
}
