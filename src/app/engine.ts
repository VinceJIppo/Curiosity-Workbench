// Memoized engine runs for the UI. Keyed by workspace identity, scenario and case.
import type { Workspace } from '../core/schema/types';
import type { CasePick } from '../core/assumptions/resolve';
import { runScenario } from '../core/engine/run';
import { createRegistry } from '../core/engine/changes';
import type { ChangeType, ScenarioResult } from '../core/engine/types';
import { allChangeTypes } from '../modules/registry';

let registry: Map<string, ChangeType<any>> | null = null;
export function changeRegistry() {
  if (!registry) registry = createRegistry(allChangeTypes());
  return registry;
}

const cache = new WeakMap<Workspace, Map<string, ScenarioResult | Error>>();

export function getRun(ws: Workspace, scenarioId: string, caseKey: CasePick = ws.settings.caseKey): ScenarioResult | Error {
  let m = cache.get(ws);
  if (!m) cache.set(ws, (m = new Map()));
  const key = `${scenarioId}|${caseKey}`;
  let r = m.get(key);
  if (!r) {
    try {
      const baseKey = `${ws.baselineScenarioId}|${caseKey}`;
      let baseline = m.get(baseKey);
      if (!baseline) {
        baseline = runScenario(ws, ws.baselineScenarioId, { caseKey, registry: changeRegistry() });
        m.set(baseKey, baseline);
      }
      r = scenarioId === ws.baselineScenarioId ? baseline : runScenario(ws, scenarioId, { caseKey, registry: changeRegistry(), baseline: baseline instanceof Error ? undefined : baseline });
    } catch (e) {
      r = e as Error;
    }
    m.set(key, r);
  }
  return r;
}
