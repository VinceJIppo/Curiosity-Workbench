// The one file the shell reads to discover modules. To add a module, import its
// manifest here and append it to MODULES. No other file changes.
import type { ModuleManifest } from '../app/module';
import type { ModuleMigration } from '../core/schema/migrate';
import type { ChangeType } from '../core/engine/types';
import { registerEntity } from '../core/schema/registry';
import { homeModule } from './home';
import { scenariosModule } from './scenarios';
import { compareModule } from './compare';
import { assumptionsModule } from './assumptions';
import { peopleModule } from './people';
import { dataModule } from './data';
import { workspaceModule } from './workspace';
import { settingsModule } from './settings';
import { printModule } from './print';

const MODULES: ModuleManifest[] = [homeModule, scenariosModule, compareModule, assumptionsModule, peopleModule, dataModule, workspaceModule, settingsModule, printModule];

let registered = false;
export function allModules(): ModuleManifest[] {
  if (!registered) {
    registered = true;
    for (const m of MODULES) m.entities?.forEach((e) => registerEntity({ ...e, ownerModule: m.id }));
  }
  return [...MODULES].sort((a, b) => a.navOrder - b.navOrder);
}

export function landingModule(): ModuleManifest {
  return [...allModules()].sort((a, b) => (b.landingPriority ?? 0) - (a.landingPriority ?? 0))[0];
}

export function allChangeTypes(): ChangeType<any>[] {
  return allModules().flatMap((m) => m.changeTypes ?? []);
}

export function moduleMigrations(): Record<string, ModuleMigration> {
  return Object.fromEntries(allModules().filter((m) => m.migrations).map((m) => [m.id, m.migrations!]));
}
