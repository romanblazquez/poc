/**
 * A named, saveable dockview arrangement. Layouts are templates — they record
 * which apps (panelIds) appear and exactly how the dockview panels are sized
 * and positioned (dockviewLayout). Users create new workspace tabs from a
 * layout; IT can ship default layouts via config/layouts.json.
 */
export interface LayoutDefinition {
  id: string;
  name: string;
  description?: string;
  /** App IDs that belong to this layout. */
  panelIds: string[];
  /** Serialised dockview JSON snapshot (api.toJSON()). Null = panels open in default positions. */
  dockviewLayout: unknown | null;
  createdAt: number;
  updatedAt: number;
  /** true = shipped by IT via config/layouts.json; cannot be deleted by users. */
  isDefault?: boolean;
}
