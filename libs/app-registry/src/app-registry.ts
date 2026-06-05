import type { AppDefinition, AppIntent, AppMetadata } from '@fdc3-poc/fdc3-core';

function toAppMetadata(app: AppDefinition): AppMetadata {
  return {
    appId: app.appId,
    name: app.appId,
    title: app.title,
    description: app.description,
    icons: app.icon ? [{ src: app.icon }] : undefined,
  };
}

function intentAcceptsContextType(
  defContextTypes: string[] | null | undefined,
  contextType: string | undefined,
): boolean {
  if (!contextType) return true;
  if (defContextTypes == null) return true; // null = any
  return defContextTypes.includes(contextType);
}

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

  replaceAll(apps: AppDefinition[]): void {
    this.apps.clear();
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

  /**
   * FDC3 2.0 — return the apps and metadata for a named intent.
   * Optional `contextType` narrows to handlers that accept that context type
   * (or whose contextTypes is null/empty, meaning "any").
   * Returns null when nothing matches — callers translate this to NoAppsFound.
   */
  findIntent(intent: string, contextType?: string): AppIntent | null {
    const matches: { app: AppDefinition; displayName?: string }[] = [];
    for (const app of this.apps.values()) {
      const intentDef = app.intents?.find(
        (i) => i.intent === intent && intentAcceptsContextType(i.contextTypes, contextType),
      );
      if (intentDef) matches.push({ app, displayName: intentDef.displayName });
    }
    if (matches.length === 0) return null;
    return {
      intent: { name: intent, displayName: matches[0].displayName },
      apps: matches.map((m) => toAppMetadata(m.app)),
    };
  }

  /**
   * FDC3 2.0 — return every intent that accepts the given context type,
   * grouped as `AppIntent`. Apps with multiple matching intents appear once per intent.
   */
  findIntentsByContext(contextType: string): AppIntent[] {
    const grouped = new Map<string, { displayName?: string; apps: AppDefinition[] }>();
    for (const app of this.apps.values()) {
      for (const intentDef of app.intents ?? []) {
        if (!intentAcceptsContextType(intentDef.contextTypes, contextType)) continue;
        let bucket = grouped.get(intentDef.intent);
        if (!bucket) {
          bucket = { displayName: intentDef.displayName, apps: [] };
          grouped.set(intentDef.intent, bucket);
        }
        if (!bucket.apps.some((a) => a.appId === app.appId)) bucket.apps.push(app);
      }
    }
    return [...grouped.entries()].map(([name, { displayName, apps }]) => ({
      intent: { name, displayName },
      apps: apps.map(toAppMetadata),
    }));
  }
}
