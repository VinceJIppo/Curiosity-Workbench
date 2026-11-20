// The module contract. Each module in src/modules/<name> exports one manifest.
// The shell discovers modules from src/modules/registry.ts only.
import type { ComponentType } from 'preact';
import type { EntitySchema } from '../core/schema/registry';
import type { ChangeType } from '../core/engine/types';
import type { ModuleMigration } from '../core/schema/migrate';
import type { Workspace } from '../core/schema/types';

export interface ViewProps {
  /** Route parameters after the view id, for example #/scenarios/edit/option-c gives ['option-c']. */
  params: string[];
}

export interface ModuleView {
  id: string;
  title: string;
  component: ComponentType<ViewProps>;
  /** Hidden views are routable but not shown as tabs. */
  hidden?: boolean;
}

export interface ModuleManifest {
  id: string;
  title: string;
  /** SVG path data on a 24 x 24 grid. Inline only. */
  icon: string;
  navOrder: number;
  views: ModuleView[];
  /** Entity types this module owns. Registered in the schema registry at startup. */
  entities?: EntitySchema[];
  /** Migrations for this module's records in workspace.modules[id]. */
  migrations?: ModuleMigration;
  /** New scenario change types. */
  changeTypes?: ChangeType<any>[];
  /** Seed records for the sample workspace. */
  sampleData?: (ws: Workspace) => unknown;
  /** Higher wins. The landing page is the module with the highest value. */
  landingPriority?: number;
  /** Hide from the left nav (still routable). */
  hiddenFromNav?: boolean;
}
