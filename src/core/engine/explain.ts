// "Show the math": every output number can be explained as a formula over
// named inputs, with each assumption's status and source.
import type { Workspace } from '../schema/types';
import { resolveAssumptions, type Resolution } from '../assumptions/resolve';
import type { MonthRow, ScenarioResult, Trace, TraceInput } from './types';

export function assumptionInput(res: Resolution, key: string, label?: string): TraceInput {
  const r = res.find(key);
  if (!r) return { label: `${label ?? key} (not bound)`, value: NaN };
  return {
    label: label ?? r.label,
    value: r.value,
    unit: r.unit,
    assumptionId: r.id,
    status: r.status,
    source: r.source,
    asOf: r.asOf,
    used: r.used,
    formula: r.formula,
    conflicts: r.conflicts,
  };
}

function resAt(ws: Workspace, result: ScenarioResult, row: MonthRow): Resolution {
  if (!Object.keys(row.activeOverrides).length) return result.resolution;
  return resolveAssumptions(ws.assumptions, { caseKey: result.caseKey, overrides: row.activeOverrides, bindings: ws.settings.bindings });
}

const conflictsOf = (inputs: TraceInput[]) => [...new Set(inputs.flatMap((i) => i.conflicts ?? []))].sort();

function mk(key: string, label: string, value: number, unit: string, formula: string, inputs: TraceInput[], notes?: string[]): Trace {
  return { key, label, value, unit, formula, inputs, conflicts: conflictsOf(inputs), notes };
}

function sellersInputs(ws: Workspace, result: ScenarioResult, row: MonthRow, res: Resolution): TraceInput[] {
  const anchorKey = ws.settings.headcountAnchors.sellers;
  const sellers0 = result.rows[0]?.sellersRoster ?? 0;
  if (!anchorKey || !res.find(anchorKey)) return [{ label: 'Sellers on roster', value: row.sellersRoster }];
  const roster0 = result.baseline ? result.baseline.rows[0].sellersRoster : sellers0;
  const a = assumptionInput(res, anchorKey, 'Sellers (register)');
  return [a, { label: 'Roster change since month 0', value: row.sellersRoster - roster0 }];
}

export const MONTH_METRICS: Record<string, { label: string; unit: string }> = {
  sellersPerSpecialist: { label: 'Sellers per specialist', unit: 'ratio' },
  sellersPerArchitect: { label: 'Sellers per architect', unit: 'ratio' },
  sellers: { label: 'Sellers', unit: 'people' },
  specialists: { label: 'Specialists', unit: 'people' },
  architects: { label: 'Architects', unit: 'people' },
  specialistsNeededStrain: { label: 'Specialists needed at strain line', unit: 'people' },
  specialistsNeededReference: { label: 'Specialists needed at reference', unit: 'people' },
  headcount: { label: 'Headcount', unit: 'FTE' },
  openReqs: { label: 'Open reqs', unit: 'FTE' },
  peopleCost: { label: 'Loaded people cost', unit: '$' },
  servicesCost: { label: 'External services cost', unit: '$' },
  totalCost: { label: 'Total cost', unit: '$' },
  incCost: { label: 'Incremental cost vs baseline', unit: '$' },
  gpUplift: { label: 'GP uplift from specialists', unit: '$' },
  effectiveness: { label: 'Specialist effectiveness from the office', unit: 'ratio' },
  officeGP: { label: 'Specialist GP from office effectiveness', unit: '$' },
  pursuitsGP: { label: 'GP from large pursuits', unit: '$' },
  pursuitsCost: { label: 'Time spent on large pursuits (allocated cost)', unit: '$' },
  gpImpact: { label: 'GP impact (specialists plus pursuits)', unit: '$' },
  incGP: { label: 'Incremental GP vs baseline', unit: '$' },
  cumNet: { label: 'Cumulative net (GP less cost)', unit: '$' },
  hoursFreed: { label: 'Hours freed by tier shifts', unit: 'hours' },
  fteFreed: { label: 'FTE freed by tier shifts', unit: 'FTE' },
};

export function explainMonth(ws: Workspace, result: ScenarioResult, key: string, month: number): Trace {
  const row = result.rows[Math.max(0, Math.min(month, result.rows.length - 1))];
  const res = resAt(ws, result, row);
  const meta = MONTH_METRICS[key] ?? { label: key, unit: '' };
  const label = `${meta.label}, month ${row.month}`;
  const v = (row as unknown as Record<string, number>)[key];
  const g = ws.settings.coverageGroups;
  switch (key) {
    case 'sellers': {
      const ins = sellersInputs(ws, result, row, res);
      return mk(key, label, v, meta.unit, ins.length > 1 ? 'register sellers + roster change since month 0' : 'count of active sellers', ins, [`Seller roles: ${g.sellers.join(', ')}`]);
    }
    case 'specialists':
      return mk(key, label, v, meta.unit, `FTE in ${g.specialists.join(', ')}`, [{ label: 'Specialist FTE', value: row.specialists }]);
    case 'architects':
      return mk(key, label, v, meta.unit, `FTE in ${g.architects.join(', ')}`, [{ label: 'Architect FTE', value: row.architects }]);
    case 'sellersPerSpecialist':
      return mk(key, label, v, meta.unit, 'sellers / specialists', [...sellersInputs(ws, result, row, res), { label: 'Sellers', value: row.sellers }, { label: `Specialists (${g.specialists.join(', ')})`, value: row.specialists }]);
    case 'sellersPerArchitect':
      return mk(key, label, v, meta.unit, 'sellers / architects', [...sellersInputs(ws, result, row, res), { label: 'Sellers', value: row.sellers }, { label: `Architects (${g.architects.join(', ')})`, value: row.architects }]);
    case 'specialistsNeededStrain':
      return mk(key, label, v, meta.unit, 'ceil(sellers / strain line)', [{ label: 'Sellers', value: row.sellers }, assumptionInput(res, 'coverage_strain')]);
    case 'specialistsNeededReference':
      return mk(key, label, v, meta.unit, 'ceil(sellers / reference ratio)', [{ label: 'Sellers', value: row.sellers }, assumptionInput(res, 'coverage_reference')]);
    case 'peopleCost': {
      const notes = Object.entries(row.peopleCostByRole).sort((a, b) => b[1] - a[1]).map(([r, c]) => `${r}: ${Math.round(c).toLocaleString('en-US')}`);
      return mk(key, label, v, '$', 'sum over active people of (base + variable) x FTE x (1 + burden) / 12', [{ label: 'Active FTE', value: row.headcount }, assumptionInput(res, 'burden_pct', 'Default burden (people without their own)'), assumptionInput(res, 'wage_share')], notes);
    }
    case 'servicesCost': {
      const notes = Object.entries(row.servicesCostByCategory).map(([c, x]) => `${c}: ${Math.round(x).toLocaleString('en-US')}`);
      return mk(key, label, v, '$', `sum of running services this month at the ${result.caseKey} price`, [{ label: 'Services cost', value: row.servicesCost }], notes);
    }
    case 'totalCost':
      return mk(key, label, v, '$', 'loaded people cost + external services cost', [{ label: 'People cost', value: row.peopleCost, unit: '$' }, { label: 'Services cost', value: row.servicesCost, unit: '$' }]);
    case 'incCost': {
      const b = result.baseline?.rows[row.month];
      return mk(key, label, v, '$', 'scenario total cost - baseline total cost', [{ label: 'Scenario total', value: row.totalCost, unit: '$' }, { label: 'Baseline total', value: b?.totalCost ?? NaN, unit: '$' }]);
    }
    case 'effectiveness':
      return mk(key, label, v, 'ratio', '(1 + office lift, once the office has run past the delay) x (1 + campaign lift) ^ full years since launch', [
        { label: 'Office lift in force', value: row.officeLift },
        { label: 'Campaign factor', value: row.campaignFactor },
        assumptionInput(res, 'office_lift'),
        assumptionInput(res, 'office_lift_delay_months'),
        assumptionInput(res, 'campaign_lift'),
      ], ['Applies only in scenarios with a "Launch strategy office" change.']);
    case 'officeGP':
      return mk(key, label, v, '$', 'specialist GP uplift before the office x (effectiveness - 1)', [
        { label: 'Effectiveness', value: row.effectiveness },
        { label: 'Specialist GP uplift with the office', value: row.gpUplift, unit: '$' },
        assumptionInput(res, 'office_lift'),
        assumptionInput(res, 'campaign_lift'),
      ]);
    case 'pursuitsGP':
      return mk(key, label, v, '$', 'deals per year / 12 x GP per large deal x (min(1, base win rate x (1 + win lift)) x (1 + deal growth) - base win rate), from the sales cycle month on', [
        assumptionInput(res, 'pursuits_deals_per_year'),
        assumptionInput(res, 'large_deal_gp'),
        assumptionInput(res, 'large_deal_win_rate'),
        assumptionInput(res, 'pursuits_win_lift'),
        assumptionInput(res, 'pursuits_deal_growth'),
        assumptionInput(res, 'pursuits_cycle_months'),
      ], ['The win lift counts deals that would otherwise be lost; the growth counts larger wins on the deals the team touches.']);
    case 'pursuitsCost':
      return mk(key, label, v, '$', 'office loaded cost x share of time on pursuits + loaded cost of anyone on the "Large pursuits" team', [assumptionInput(res, 'pursuits_time_share')], ['An allocation of cost already in the totals; used only for the pursuits payback.']);
    case 'gpImpact':
      return mk(key, label, v, '$', 'specialist GP uplift + large pursuits GP', [{ label: 'Specialist GP uplift', value: row.gpUplift, unit: '$' }, { label: 'Large pursuits GP', value: row.pursuitsGP, unit: '$' }]);
    case 'gpUplift':
      return mk(key, label, v, '$', 'ramped specialists x touched GP per specialist / 12 x uplift x driver factor x office effectiveness', [
        { label: 'Office effectiveness', value: row.effectiveness },
        { label: 'Ramped specialists', value: row.effSpecialists },
        assumptionInput(res, 'gp_per_specialist'),
        assumptionInput(res, 'gp_uplift'),
        { label: 'Driver factor (win x attach x utilization vs today)', value: row.driverFactor },
        assumptionInput(res, 'ramp_months'),
        assumptionInput(res, 'win_rate'),
        assumptionInput(res, 'attach_rate'),
        assumptionInput(res, 'utilization'),
      ]);
    case 'incGP': {
      const b = result.baseline?.rows[row.month];
      return mk(key, label, v, '$', 'scenario GP impact - baseline GP impact (specialist uplift with office effectiveness, plus large pursuits)', [{ label: 'Scenario specialist GP', value: row.gpUplift, unit: '$' }, { label: 'Scenario large pursuits GP', value: row.pursuitsGP, unit: '$' }, { label: 'Baseline GP impact', value: b?.gpImpact ?? NaN, unit: '$' }, assumptionInput(res, 'gp_uplift'), assumptionInput(res, 'gp_per_specialist'), assumptionInput(res, 'office_lift')]);
    }
    case 'cumNet':
      return mk(key, label, v, '$', 'cumulative incremental GP - cumulative incremental cost', [{ label: 'Cumulative incremental GP', value: row.cumIncGP, unit: '$' }, { label: 'Cumulative incremental cost', value: row.cumIncCost, unit: '$' }]);
    case 'hoursFreed':
    case 'fteFreed':
      return mk(key, label, v, meta.unit, key === 'hoursFreed' ? 'sum of tier shifts: requests x share moved x ramp x (hours from - hours to)' : 'hours freed / productive hours per FTE month', [
        { label: 'Hours freed', value: row.hoursFreed },
        assumptionInput(res, 'hours_per_fte_month'),
        assumptionInput(res, 'tier2_requests'),
        assumptionInput(res, 'tier2_hours'),
        assumptionInput(res, 'tier1_hours'),
      ], Object.entries(row.capacityByDestination).map(([d, h]) => `${d}: ${Math.round(h)} hours`));
    default:
      return mk(key, label, v, meta.unit, key, []);
  }
}

export const SUMMARY_METRICS: Record<string, { label: string; unit: string }> = {
  inc2y: { label: '24-month incremental cost', unit: '$' },
  inc3y: { label: '36-month incremental cost', unit: '$' },
  cost2y: { label: '2-year total cost', unit: '$' },
  cost3y: { label: '3-year total cost', unit: '$' },
  incGP2y: { label: '24-month incremental GP', unit: '$' },
  paybackMonth: { label: 'Payback month', unit: 'month' },
  roiView: { label: 'ROI over view window', unit: '%' },
  breakEvenGP: { label: 'Break-even incremental GP', unit: '$' },
  breakEvenTouchedGP: { label: 'Break-even specialist-touched GP', unit: '$' },
  officeGP2y: { label: '24-month specialist GP from the office', unit: '$' },
  pursuitsGP2y: { label: '24-month GP from large pursuits', unit: '$' },
  pursuitsPaybackMonth: { label: 'Large pursuits payback month', unit: 'month' },
  pursuitsBreakEvenDealGP: { label: 'Break-even GP per large deal', unit: '$' },
  coverageAtView: { label: 'Sellers per specialist at end of view', unit: 'ratio' },
  architectCoverageAtView: { label: 'Sellers per architect at end of view', unit: 'ratio' },
};

export function explainSummary(ws: Workspace, result: ScenarioResult, key: string): Trace {
  const s = result.summary;
  const meta = SUMMARY_METRICS[key] ?? { label: key, unit: '' };
  const v = (s as unknown as Record<string, number>)[key];
  const res = result.resolution;
  const vm = s.viewMonths;
  const sumOf = (k: 'incCost' | 'totalCost' | 'incGP', to: number) => result.rows.filter((r) => r.month < to).reduce((a, r) => a + r[k], 0);
  switch (key) {
    case 'inc2y':
    case 'inc3y': {
      const to = key === 'inc2y' ? 24 : 36;
      const people = result.rows.filter((r) => r.month < to).reduce((a, r) => a + r.peopleCost - (result.baseline?.rows[r.month].peopleCost ?? r.peopleCost), 0);
      const svc = result.rows.filter((r) => r.month < to).reduce((a, r) => a + r.servicesCost - (result.baseline?.rows[r.month].servicesCost ?? r.servicesCost), 0);
      const ins: TraceInput[] = [{ label: 'Incremental people cost', value: people, unit: '$' }, { label: 'Incremental services cost', value: svc, unit: '$' }, assumptionInput(res, 'burden_pct'), assumptionInput(res, 'hire_lag_months')];
      return mk(key, meta.label, v, '$', `sum of months 0 to ${to - 1}: scenario cost - baseline cost`, ins, result.changes.filter((c) => c.status === 'applied').map((c) => `M${c.actualMonth}: ${c.label}`));
    }
    case 'cost2y':
    case 'cost3y':
      return mk(key, meta.label, v, '$', `sum of total cost, months 0 to ${key === 'cost2y' ? 23 : 35}`, [{ label: 'Total cost', value: sumOf('totalCost', key === 'cost2y' ? 24 : 36), unit: '$' }, assumptionInput(res, 'burden_pct')]);
    case 'officeGP2y':
      return mk(key, meta.label, v, '$', 'sum of months 0 to 23: specialist GP uplift before the office x (effectiveness - 1)', [assumptionInput(res, 'office_lift'), assumptionInput(res, 'office_lift_delay_months'), assumptionInput(res, 'campaign_lift'), assumptionInput(res, 'gp_per_specialist'), assumptionInput(res, 'gp_uplift')]);
    case 'pursuitsGP2y':
      return mk(key, meta.label, v, '$', 'sum of months 0 to 23 of large pursuits GP', [assumptionInput(res, 'pursuits_deals_per_year'), assumptionInput(res, 'large_deal_gp'), assumptionInput(res, 'large_deal_win_rate'), assumptionInput(res, 'pursuits_win_lift'), assumptionInput(res, 'pursuits_deal_growth'), assumptionInput(res, 'pursuits_cycle_months')]);
    case 'pursuitsPaybackMonth':
      return mk(key, meta.label, v, 'month', 'first month cumulative large pursuits GP covers cumulative time spent on pursuits and stays ahead', [{ label: '24-month pursuits GP', value: s.pursuitsGP2y, unit: '$' }, { label: '24-month time spent (allocated)', value: s.pursuitsCost2y, unit: '$' }, assumptionInput(res, 'pursuits_time_share'), assumptionInput(res, 'large_deal_gp')], v == null ? ['No payback inside the horizon at these assumptions. See break-even GP per large deal.'] : undefined);
    case 'pursuitsBreakEvenDealGP':
      return mk(key, meta.label, v, '$', '24 months of time spent on pursuits / (sum of deals per month x (focused win rate x (1 + growth) - base win rate))', [{ label: '24-month time spent (allocated)', value: s.pursuitsCost2y, unit: '$' }, assumptionInput(res, 'large_deal_gp', 'GP per large deal assumed today'), assumptionInput(res, 'pursuits_deals_per_year'), assumptionInput(res, 'large_deal_win_rate'), assumptionInput(res, 'pursuits_win_lift'), assumptionInput(res, 'pursuits_deal_growth'), assumptionInput(res, 'pursuits_time_share')]);
    case 'incGP2y':
      return mk(key, meta.label, v, '$', 'sum of months 0 to 23: scenario GP uplift - baseline GP uplift', [assumptionInput(res, 'gp_per_specialist'), assumptionInput(res, 'gp_uplift'), assumptionInput(res, 'ramp_months')]);
    case 'paybackMonth':
      return mk(key, meta.label, v, 'month', 'first month where cumulative incremental GP covers cumulative incremental cost and stays covered', [{ label: `Cumulative GP at M${vm}`, value: sumOf('incGP', vm), unit: '$' }, { label: `Cumulative cost at M${vm}`, value: sumOf('incCost', vm), unit: '$' }, assumptionInput(res, 'gp_uplift'), assumptionInput(res, 'gp_per_specialist')], v == null ? ['No payback inside the horizon'] : undefined);
    case 'roiView':
      return mk(key, meta.label, v, '%', `(incremental GP - incremental cost) / incremental cost, months 0 to ${vm - 1}`, [{ label: 'Incremental GP', value: sumOf('incGP', vm), unit: '$' }, { label: 'Incremental cost', value: sumOf('incCost', vm), unit: '$' }, assumptionInput(res, 'gp_uplift')]);
    case 'breakEvenGP':
      return mk(key, meta.label, v, '$', `incremental GP needed to cover incremental cost over ${vm} months`, [{ label: 'Incremental cost', value: sumOf('incCost', vm), unit: '$' }]);
    case 'breakEvenTouchedGP':
      return mk(key, meta.label, v, '$', 'incremental cost / GP uplift on specialist-touched deals', [{ label: 'Incremental cost', value: sumOf('incCost', vm), unit: '$' }, assumptionInput(res, 'gp_uplift')]);
    case 'coverageAtView':
      return explainMonth(ws, result, 'sellersPerSpecialist', vm);
    case 'architectCoverageAtView':
      return explainMonth(ws, result, 'sellersPerArchitect', vm);
    default:
      return mk(key, meta.label, v, meta.unit, key, []);
  }
}
