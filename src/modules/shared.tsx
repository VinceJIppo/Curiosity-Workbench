// Helpers shared by modules. Modules import from here, never from each other.
import type { Scenario, Workspace } from '../core/schema/types';
import type { ScenarioResult } from '../core/engine/types';
import { getRun } from '../app/engine';
import { monthDate } from '../core/format';
import { useUi } from '../app/ui';

export { scenarioStyle } from '../ui/compare';

export function useActiveScenario(ws: Workspace): Scenario {
  const ui = useUi();
  return ws.scenarios.find((s) => s.id === ui.activeScenarioId) ?? ws.scenarios.find((s) => s.id !== ws.baselineScenarioId) ?? ws.scenarios[0];
}

export function run(ws: Workspace, id: string): ScenarioResult | Error {
  return getRun(ws, id, ws.settings.caseKey);
}

export function monthFmt(ws: Workspace) {
  return (m: number) => (m % 12 === 0 ? `M${m}` : `M${m}`);
}

export function monthTitle(ws: Workspace, m: number) {
  return `M${m} (${monthDate(ws.settings.approvalMonth, m)})`;
}

export const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function caseLabel(c: string) {
  return c === 'conservative' ? 'Conservative' : c === 'base' ? 'Base' : c === 'aggressive' ? 'Aggressive' : c;
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function ErrorBox({ error }: { error: Error }) {
  return <div class="callout error">The engine could not run this scenario: {error.message}</div>;
}
