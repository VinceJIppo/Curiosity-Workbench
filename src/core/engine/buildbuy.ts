// Build vs buy for any role: loaded cost of N hires vs a package of external services.
import type { Workspace } from '../schema/types';
import { resolveAssumptions, type BoundPick } from '../assumptions/resolve';
import { loadedFromWageShare } from './calc';
import { serviceMonthlyCost, servicePrice } from './run';
import type { Trace, TraceInput } from './types';
import { assumptionInput } from './explain';

export interface BuildVsBuyInput {
  /** Binding key or assumption ID for one hire's cash comp. */
  compKey: string;
  /** Binding key or assumption ID for wage share. */
  wageShareKey: string;
  count: number;
  months: number;
  serviceIds: string[];
}

export interface BuildVsBuyBound {
  bound: BoundPick;
  comp: number;
  wageShare: number;
  perHireLoaded: number;
  build: number;
  buildYear1: number;
  buy: number;
  buyYear1: number;
  buyByService: { id: string; name: string; cost: number; year1: number }[];
}

export interface BuildVsBuyResult {
  input: BuildVsBuyInput;
  low: BuildVsBuyBound;
  base: BuildVsBuyBound;
  high: BuildVsBuyBound;
  traces: { build: Trace; buy: Trace };
}

function buyCost(ws: Workspace, ids: string[], months: number, bound: BoundPick, A: (k: string) => number) {
  return ids
    .map((id) => ws.entities.externalServices.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => {
      const price = s.priceRef ? A(s.priceRef) : servicePrice(s, bound);
      const end = s.termMonths != null ? s.termMonths : null;
      let cost = 0;
      let year1 = 0;
      for (let m = 0; m < months; m++) {
        const c = serviceMonthlyCost(s, 0, end, m, price, A);
        cost += c;
        if (m < 12) year1 += c;
      }
      return { id: s.id, name: s.name, cost, year1 };
    });
}

export function buildVsBuy(ws: Workspace, input: BuildVsBuyInput): BuildVsBuyResult {
  const calc = (bound: BoundPick): BuildVsBuyBound => {
    const res = resolveAssumptions(ws.assumptions, { caseKey: bound, bindings: ws.settings.bindings });
    const comp = res.get(input.compKey);
    const wageShare = res.get(input.wageShareKey);
    const perHireLoaded = loadedFromWageShare(comp, wageShare);
    const build = input.count * (input.months / 12) * perHireLoaded;
    const buildYear1 = input.count * Math.min(12, input.months) / 12 * perHireLoaded;
    const svc = buyCost(ws, input.serviceIds, input.months, bound, res.get);
    return {
      bound,
      comp,
      wageShare,
      perHireLoaded,
      build,
      buildYear1,
      buy: svc.reduce((s, x) => s + x.cost, 0),
      buyYear1: svc.reduce((s, x) => s + x.year1, 0),
      buyByService: svc,
    };
  };
  const low = calc('low');
  const base = calc('base');
  const high = calc('high');
  const resBase = resolveAssumptions(ws.assumptions, { caseKey: 'base', bindings: ws.settings.bindings });
  const compIn = assumptionInput(resBase, input.compKey, 'Cash comp per hire');
  const wsIn = assumptionInput(resBase, input.wageShareKey, 'Wage share');
  const conflicts = [...new Set([...(compIn.conflicts ?? []), ...(wsIn.conflicts ?? [])])];
  const build: Trace = {
    key: 'build',
    label: `Build: ${input.count} hires over ${input.months} months`,
    value: base.build,
    unit: '$',
    formula: `hires x (months / 12) x (cash comp / wage share). Low ${Math.round(low.build).toLocaleString('en-US')}, high ${Math.round(high.build).toLocaleString('en-US')}`,
    inputs: [{ label: 'Hires', value: input.count }, { label: 'Months', value: input.months }, { ...compIn, label: `${compIn.label} (low ${low.comp}, high ${high.comp})` }, wsIn],
    conflicts,
  };
  const buyInputs: TraceInput[] = base.buyByService.map((s, i) => ({ label: `${s.name} (low ${Math.round(low.buyByService[i].cost)}, high ${Math.round(high.buyByService[i].cost)})`, value: s.cost, unit: '$', source: ws.entities.externalServices.find((x) => x.id === s.id)?.source }));
  const buy: Trace = {
    key: 'buy',
    label: `Buy over ${input.months} months`,
    value: base.buy,
    unit: '$',
    formula: 'Sum of each service: fixed price once, retainers monthly for their term, subscriptions each 12 months',
    inputs: buyInputs,
    conflicts: [],
  };
  return { input, low, base, high, traces: { build, buy } };
}
