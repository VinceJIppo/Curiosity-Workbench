// Sensitivity: tornado over the assumptions that move a metric most, and
// low/base/high bands on series.
import type { Workspace } from '../schema/types';
import type { CasePick } from '../assumptions/resolve';
import { runScenario } from './run';
import type { MonthRow, ScenarioResult } from './types';

export type MetricFn = (r: ScenarioResult) => number;

export const TORNADO_METRICS: Record<string, { label: string; unit: string; fn: MetricFn }> = {
  netView: {
    label: 'Net (incremental GP less cost) over view',
    unit: '$',
    fn: (r) => r.rows.filter((x) => x.month < r.summary.viewMonths).reduce((s, x) => s + x.incGP - x.incCost, 0),
  },
  incCostView: {
    label: 'Incremental cost over view',
    unit: '$',
    fn: (r) => r.rows.filter((x) => x.month < r.summary.viewMonths).reduce((s, x) => s + x.incCost, 0),
  },
  incGPView: {
    label: 'Incremental GP over view',
    unit: '$',
    fn: (r) => r.rows.filter((x) => x.month < r.summary.viewMonths).reduce((s, x) => s + x.incGP, 0),
  },
  coverageAtView: { label: 'Sellers per specialist at end of view', unit: 'ratio', fn: (r) => r.summary.coverageAtView },
};

export interface TornadoBar {
  id: string;
  label: string;
  lowInput: number;
  highInput: number;
  atLow: number;
  atHigh: number;
  swing: number;
}

export interface TornadoResult {
  metric: string;
  base: number;
  bars: TornadoBar[];
}

export function tornado(ws: Workspace, scenarioId: string, metric: string, caseKey: CasePick, topN = 10): TornadoResult {
  const fn = TORNADO_METRICS[metric]?.fn ?? TORNADO_METRICS.netView.fn;
  const baseRun = runScenario(ws, scenarioId, { caseKey });
  const base = fn(baseRun);
  const candidates = ws.assumptions.filter((a) => !a.formula && a.low != null && a.high != null && a.low !== a.high);
  const bars: TornadoBar[] = [];
  for (const a of candidates) {
    const lo = fn(runScenario(ws, scenarioId, { caseKey, forced: { [a.id]: 'low' } }));
    const hi = fn(runScenario(ws, scenarioId, { caseKey, forced: { [a.id]: 'high' } }));
    const swing = Math.abs((Number.isFinite(hi) ? hi : base) - (Number.isFinite(lo) ? lo : base));
    if (swing > 1e-9) bars.push({ id: a.id, label: a.label, lowInput: a.low as number, highInput: a.high as number, atLow: lo, atHigh: hi, swing });
  }
  bars.sort((x, y) => y.swing - x.swing || x.id.localeCompare(y.id));
  return { metric, base, bars: bars.slice(0, topN) };
}

export interface Bands {
  low: MonthRow[];
  base: MonthRow[];
  high: MonthRow[];
}

/** Runs the scenario with every assumption at its low bound, base, and high bound. */
export function bands(ws: Workspace, scenarioId: string): Bands {
  return {
    low: runScenario(ws, scenarioId, { caseKey: 'low' }).rows,
    base: runScenario(ws, scenarioId, { caseKey: 'base' }).rows,
    high: runScenario(ws, scenarioId, { caseKey: 'high' }).rows,
  };
}
