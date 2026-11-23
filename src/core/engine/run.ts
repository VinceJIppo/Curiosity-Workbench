// Pure, deterministic scenario engine: (workspace, scenarioId) => monthly series.
// No UI code here.
import type { Change, Gate, Scenario, Workspace, ExternalService } from '../schema/types';
import { resolveAssumptions, type CasePick, type Resolution, type BoundPick } from '../assumptions/resolve';
import { compile, evaluate } from '../expr/expr';
import { DEFAULT_REGISTRY } from './changes';
import type {
  ApplyContext,
  ChangeOutcome,
  GateOutcome,
  MonthRow,
  RunOptions,
  ScenarioResult,
  ScenarioSummary,
  SimPerson,
  SimState,
  SimOverride,
} from './types';
import { ratio } from './calc';

export interface EffectiveChange {
  change: Change;
  origin: string;
  month: number;
  gate?: Gate;
  gateKey?: string;
}

/** Flatten a scenario's own and inherited changes into one ordered list. */
export function effectiveChanges(ws: Workspace, scenarioId: string, seen: Set<string> = new Set()): EffectiveChange[] {
  const sc = ws.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return [];
  if (seen.has(scenarioId)) return []; // inheritance cycle guard
  const nextSeen = new Set(seen).add(scenarioId);
  const out: EffectiveChange[] = [];
  for (const seg of sc.inherits ?? []) {
    const parent = effectiveChanges(ws, seg.scenarioId, nextSeen);
    const to = seg.toMonth ?? Infinity;
    for (const ec of parent) {
      if (seg.tags && seg.tags.length && !(ec.change.tags ?? []).some((t) => seg.tags!.includes(t))) continue;
      if (ec.month >= seg.fromMonth && ec.month < to) out.push(ec);
      else if (ec.month < seg.fromMonth && (seg.carryEarlier ?? true) && seg.fromMonth < to && seg.fromMonth > 0) {
        // Parent change that happened before this segment begins: apply it when the segment starts.
        const shift = seg.fromMonth - ec.month;
        out.push({ ...ec, month: seg.fromMonth, gate: ec.gate ? { ...ec.gate, month: Math.max(ec.gate.month + shift, seg.fromMonth) } : undefined });
      }
    }
  }
  for (const c of sc.changes) {
    const gate = c.gateId ? sc.gates.find((g) => g.id === c.gateId) : undefined;
    out.push({ change: c, origin: sc.id, month: c.month, gate, gateKey: gate ? `${sc.id}:${gate.id}` : undefined });
  }
  return out.map((x, i) => ({ x, i })).sort((a, b) => a.x.month - b.x.month || a.i - b.i).map((y) => y.x);
}

export function scenarioById(ws: Workspace, id: string): Scenario | undefined {
  return ws.scenarios.find((s) => s.id === id);
}

function initialState(ws: Workspace): SimState {
  const people = new Map<string, SimPerson>();
  for (const p of ws.entities.people) {
    let start = p.startMonth ?? null;
    let end = p.endMonth ?? null;
    let reqOpenMonth: number | undefined;
    if (p.status === 'open req') {
      reqOpenMonth = Math.min(0, start ?? 0);
      if (start == null) start = Number.POSITIVE_INFINITY; // open the whole horizon, never filled
    } else if (p.status === 'planned') {
      start = start ?? 0;
    } else {
      start = start ?? -1;
    }
    if (p.status === 'departing' && end == null) end = null;
    people.set(p.id, { ...p, practices: [...(p.practices ?? [])], startMonth: start, endMonth: end, reqOpenMonth, origin: 'baseline' });
  }
  const services = ws.entities.externalServices
    .filter((s) => s.startMonth != null)
    .map((s) => ({ key: `baseline:${s.id}`, service: s, start: s.startMonth as number, end: s.termMonths != null ? (s.startMonth as number) + s.termMonths : null, origin: 'baseline' }));
  return { people, services, overrides: [], tierShifts: [], programs: [] };
}

const isActive = (p: SimPerson, m: number) => p.startMonth <= m && (p.endMonth == null || m < p.endMonth);
const isOpenReq = (p: SimPerson, m: number) => p.reqOpenMonth != null && p.reqOpenMonth <= m && m < p.startMonth && (p.endMonth == null || m < p.endMonth);

export function servicePrice(s: ExternalService, pick: CasePick): number {
  const bound: BoundPick = pick === 'conservative' ? 'high' : pick === 'aggressive' ? 'low' : pick;
  return bound === 'low' ? s.low : bound === 'high' ? s.high : s.base;
}

/** Monthly cost of a running service at month m. */
export function serviceMonthlyCost(s: ExternalService, start: number, end: number | null, m: number, price: number, A: (k: string) => number): number {
  if (m < start || (end != null && m >= end)) return 0;
  switch (s.pricingModel) {
    case 'fixed':
      return m === start ? price : 0;
    case 'monthly retainer':
      return price;
    case 'annual subscription':
      return (m - start) % 12 === 0 ? price : 0;
    case 'per unit':
    case 'T&M':
      return price * (s.quantityPerMonth ?? 0);
    case '% of revenue': {
      const rev = A(s.revenueRef || 'revenue_monthly');
      return Number.isFinite(rev) ? price * rev : 0;
    }
  }
  return 0;
}

function rampFactor(start: number, m: number, ramp: number): number {
  if (start < 0) return 1;
  if (!(ramp > 0)) return 1;
  return Math.min(1, Math.max(0, (m - start + 1) / ramp));
}

const add = (rec: Record<string, number>, k: string, v: number) => {
  rec[k] = (rec[k] ?? 0) + v;
};

export function runScenario(ws: Workspace, scenarioId: string, opts: RunOptions = {}): ScenarioResult {
  const registry = opts.registry ?? DEFAULT_REGISTRY;
  const caseKey: CasePick = opts.caseKey ?? ws.settings.caseKey ?? 'conservative';
  const H = opts.horizon ?? ws.settings.horizonMonths ?? 36;
  const sc = scenarioById(ws, scenarioId);
  if (!sc) throw new Error(`Scenario "${scenarioId}" not found`);
  const bindings = ws.settings.bindings;

  // Baseline run for incremental numbers.
  const isBaseline = scenarioId === ws.baselineScenarioId;
  const baseline = isBaseline ? undefined : (opts.baseline ?? runScenario(ws, ws.baselineScenarioId, { ...opts, baseline: undefined }));

  const resCache = new Map<string, Resolution>();
  const resolve = (overrides: Record<string, number>): Resolution => {
    const key = JSON.stringify(overrides);
    let r = resCache.get(key);
    if (!r) {
      r = resolveAssumptions(ws.assumptions, { caseKey, overrides, forced: opts.forced, bindings });
      resCache.set(key, r);
    }
    return r;
  };
  const base = resolve({});
  const usedIds = new Set<string>();
  const warnings: string[] = [];
  const warn = (msg: string) => {
    if (!warnings.includes(msg)) warnings.push(msg);
  };

  let current = base;
  const A = (k: string) => {
    const r = current.find(k);
    if (!r) {
      warn(`No assumption bound to "${k}". Bind it in Settings.`);
      return NaN;
    }
    r.deps.forEach((d) => usedIds.add(d));
    return r.value;
  };

  const state = initialState(ws);
  const groups = ws.settings.coverageGroups;
  const inGroup = (p: SimPerson, g: string[]) => g.includes(p.roleFamily);
  const sellersRoster0 = [...state.people.values()].filter((p) => isActive(p, 0) && inGroup(p, groups.sellers)).reduce((s, p) => s + p.fte, 0);

  // Pending changes and gates
  const eff = effectiveChanges(ws, scenarioId);
  interface Pending {
    ec: EffectiveChange;
    due: number | null; // null while waiting on a gate
    status: ChangeOutcome['status'];
    message?: string;
  }
  const pending: Pending[] = eff.map((ec) => ({
    ec,
    due: ec.change.enabled === false ? null : ec.gate ? null : ec.month,
    status: ec.change.enabled === false ? 'disabled' : 'held',
  }));
  interface GateState {
    key: string;
    gate: Gate;
    scenarioId: string;
    nextEval: number;
    retries: number;
    passedAt: number | null;
    dropped: boolean;
  }
  const gateStates = new Map<string, GateState>();
  for (const p of pending) {
    if (p.ec.gate && p.ec.gateKey && p.ec.change.enabled !== false && !gateStates.has(p.ec.gateKey)) {
      gateStates.set(p.ec.gateKey, { key: p.ec.gateKey, gate: p.ec.gate, scenarioId: p.ec.origin, nextEval: p.ec.gate.month, retries: 0, passedAt: null, dropped: false });
    }
  }
  const gateOutcomes: GateOutcome[] = [];

  const rows: MonthRow[] = [];
  let prevRow: MonthRow | null = null;

  const activeOverrideValues = (m: number): Record<string, number> => {
    const out: Record<string, number> = {};
    const list = state.overrides.filter((o) => o.from <= m && (o.until == null || m < o.until));
    for (const o of list) {
      const id = base.idFor(o.id) ?? o.id;
      const start = id in out ? out[id] : (base.byId.get(id)?.value ?? NaN);
      const target = o.mode === 'set' ? o.value : o.mode === 'add' ? start + o.value : start * o.value;
      const f = o.rampMonths > 0 ? Math.min(1, (m - o.from + 1) / o.rampMonths) : 1;
      out[id] = start + (target - start) * f;
    }
    return out;
  };

  const computeRow = (m: number): MonthRow => {
    const ov = activeOverrideValues(m);
    current = resolve(ov);
    const row: MonthRow = {
      month: m,
      headcount: 0,
      headcountByRole: {},
      headcountByTeam: {},
      headcountByPractice: {},
      openReqs: 0,
      openReqsByRole: {},
      peopleCost: 0,
      peopleCostByRole: {},
      servicesCost: 0,
      servicesCostByCategory: {},
      totalCost: 0,
      sellersRoster: 0,
      sellers: 0,
      specialists: 0,
      architects: 0,
      sellersPerSpecialist: NaN,
      sellersPerArchitect: NaN,
      specialistsPerPractice: {},
      specialistsNeededStrain: NaN,
      specialistsNeededReference: NaN,
      hoursFreed: 0,
      fteFreed: 0,
      capacityByDestination: {},
      effSpecialists: 0,
      gpPerSpecialistMonthly: 0,
      upliftPct: 0,
      driverFactor: 1,
      effectiveness: 1,
      officeLift: 0,
      campaignFactor: 1,
      gpUplift: 0,
      officeGP: 0,
      pursuitsGP: 0,
      pursuitsCost: 0,
      pursuitsDealFactor: 0,
      cumPursuitsGP: 0,
      cumPursuitsCost: 0,
      gpImpact: 0,
      companyGPPlan: 0,
      companyGP: 0,
      gpGrowthFactor: 1,
      incCost: 0,
      incGP: 0,
      cumIncCost: 0,
      cumIncGP: 0,
      cumNet: 0,
      activeOverrides: ov,
    };
    const burdenDefault = A('burden_pct');
    const ramp = A('ramp_months');
    let officeCost = 0;
    let pursuitsTeamCost = 0;
    for (const p of state.people.values()) {
      if (isOpenReq(p, m)) {
        row.openReqs += p.fte;
        add(row.openReqsByRole, p.roleFamily, p.fte);
      }
      if (!isActive(p, m)) continue;
      row.headcount += p.fte;
      add(row.headcountByRole, p.roleFamily, p.fte);
      add(row.headcountByTeam, p.team || p.territory || 'Unassigned', p.fte);
      const prs = p.practices.length ? p.practices : ['Unassigned'];
      prs.forEach((pr) => add(row.headcountByPractice, pr, p.fte / prs.length));
      const burden = p.burdenPct ?? burdenDefault;
      const monthly = ((p.base + p.variableTarget) * p.fte * (1 + (Number.isFinite(burden) ? burden : 0))) / 12;
      row.peopleCost += monthly;
      add(row.peopleCostByRole, p.roleFamily, monthly);
      if (p.roleFamily === 'Office') officeCost += monthly;
      else if ((p.team ?? '').toLowerCase() === 'large pursuits') pursuitsTeamCost += monthly;
      if (inGroup(p, groups.sellers)) row.sellersRoster += p.fte;
      if (inGroup(p, groups.specialists)) {
        row.specialists += p.fte;
        row.effSpecialists += p.fte * rampFactor(p.startMonth, m, ramp);
        prs.forEach((pr) => add(row.specialistsPerPractice, pr, p.fte / prs.length));
      }
      if (inGroup(p, groups.architects)) row.architects += p.fte;
    }
    for (const s of state.services) {
      const price = s.service.priceRef ? A(s.service.priceRef) : servicePrice(s.service, caseKey);
      const c = serviceMonthlyCost(s.service, s.start, s.end, m, price, A);
      if (c) {
        row.servicesCost += c;
        add(row.servicesCostByCategory, s.service.category, c);
      }
    }
    row.totalCost = row.peopleCost + row.servicesCost;

    // Coverage. Sellers anchor to the register when a binding exists.
    const anchorKey = ws.settings.headcountAnchors.sellers;
    const anchor = anchorKey ? A(anchorKey) : NaN;
    row.sellers = Number.isFinite(anchor) ? anchor + (row.sellersRoster - sellersRoster0) : row.sellersRoster;
    row.sellersPerSpecialist = ratio(row.sellers, row.specialists);
    row.sellersPerArchitect = ratio(row.sellers, row.architects);
    row.specialistsNeededStrain = Math.ceil(row.sellers / A('coverage_strain'));
    row.specialistsNeededReference = Math.ceil(row.sellers / A('coverage_reference'));

    // Capacity from tier shifts.
    const hoursPerFte = A('hours_per_fte_month');
    for (const t of state.tierShifts) {
      if (m < t.from) continue;
      const f = t.rampMonths > 0 ? Math.min(1, (m - t.from + 1) / t.rampMonths) : 1;
      const vol = A(`tier${t.fromTier}_requests`);
      const hFrom = A(`tier${t.fromTier}_hours`);
      const hTo = A(`tier${t.toTier}_hours`);
      const freed = vol * t.pct * f * (hFrom - hTo);
      if (Number.isFinite(freed)) {
        row.hoursFreed += freed;
        add(row.capacityByDestination, t.destination, freed);
      }
    }
    row.fteFreed = hoursPerFte > 0 ? row.hoursFreed / hoursPerFte : 0;

    // GP uplift (driver based).
    const driverFactor = (['win_rate', 'attach_rate', 'utilization'] as const).reduce((f, k) => {
      const now = A(k);
      const then = base.get(k);
      return f * (Number.isFinite(now) && Number.isFinite(then) && then !== 0 ? now / then : 1);
    }, 1);
    const growth = A('gp_growth_after');
    row.gpGrowthFactor = Number.isFinite(growth) ? Math.pow(1 + growth, Math.floor(m / 12)) : 1;
    row.gpPerSpecialistMonthly = (A('gp_per_specialist') / 12) * row.gpGrowthFactor;
    const plan = A('company_gp');
    row.companyGPPlan = Number.isFinite(plan) ? (plan / 12) * row.gpGrowthFactor : 0;
    row.upliftPct = A('gp_uplift');
    row.driverFactor = driverFactor;

    // Office program: specialists get more effective once the office has run for a while,
    // and campaign artifacts add more each full year.
    const office = state.programs.filter((x) => x.kind === 'office' && x.from <= m).sort((a, b) => a.from - b.from)[0];
    if (office) {
      const age = m - office.from;
      row.officeLift = age >= A('office_lift_delay_months') ? A('office_lift') : 0;
      row.campaignFactor = Math.pow(1 + A('campaign_lift'), Math.floor(age / 12));
      row.effectiveness = (1 + row.officeLift) * row.campaignFactor;
      if (!Number.isFinite(row.effectiveness)) row.effectiveness = 1;
    }
    const baseUplift = row.effSpecialists * row.gpPerSpecialistMonthly * row.upliftPct * driverFactor;
    row.gpUplift = Number.isFinite(baseUplift) ? baseUplift * row.effectiveness : 0;
    row.officeGP = Number.isFinite(baseUplift) ? baseUplift * (row.effectiveness - 1) : 0;

    // Large pursuits program: a focused team wins more large deals and grows the ones it wins.
    const pursuits = state.programs.filter((x) => x.kind === 'pursuits' && x.from <= m).sort((a, b) => a.from - b.from)[0];
    if (pursuits) {
      row.pursuitsCost = officeCost * A('pursuits_time_share') + pursuitsTeamCost;
      if (m >= pursuits.from + A('pursuits_cycle_months')) {
        const p0 = A('large_deal_win_rate');
        const p1 = Math.min(1, p0 * (1 + A('pursuits_win_lift')));
        const factor = (A('pursuits_deals_per_year') / 12) * (p1 * (1 + A('pursuits_deal_growth')) - p0);
        row.pursuitsDealFactor = Number.isFinite(factor) ? factor : 0;
        const v = factor * A('large_deal_gp');
        row.pursuitsGP = Number.isFinite(v) ? v : 0;
      }
      if (!Number.isFinite(row.pursuitsCost)) row.pursuitsCost = 0;
    }
    row.gpImpact = row.gpUplift + row.pursuitsGP;
    return row;
  };

  const evalGate = (g: GateState, m: number): { pass: boolean; reason: string } => {
    const gate = g.gate;
    if (gate.kind === 'manual') {
      const v = gate.manualOutcomes?.[String(m)];
      const pass = v !== false;
      return { pass, reason: pass ? 'Manual: pass' : 'Manual: miss' };
    }
    const row = prevRow ?? computeRow(m);
    const metric = gate.metric || 'sellersPerSpecialist';
    let value = NaN;
    try {
      value = evaluate(compile(metric), (n) => {
        const rv = (row as unknown as Record<string, unknown>)[n];
        if (typeof rv === 'number') return rv;
        return A(n);
      });
    } catch (e) {
      return { pass: false, reason: `Gate metric error: ${(e as Error).message}` };
    }
    const t = gate.threshold ?? 0;
    const cmp = gate.comparator ?? '>=';
    const pass = cmp === '>=' ? value >= t : cmp === '<=' ? value <= t : cmp === '>' ? value > t : cmp === '<' ? value < t : value === t;
    return { pass, reason: `${metric} = ${Number.isFinite(value) ? Math.round(value * 100) / 100 : 'n/a'} ${cmp} ${t}` };
  };

  const retryDefault = ws.settings.gateRetryMonths ?? 6;
  for (let m = 0; m <= H; m++) {
    // 1. Gates scheduled this month.
    for (const g of gateStates.values()) {
      if (g.passedAt != null || g.dropped || g.nextEval !== m) continue;
      const { pass, reason } = evalGate(g, m);
      const out: GateOutcome = { gateKey: g.key, gateName: g.gate.name, scenarioId: g.scenarioId, month: m, pass, reason };
      if (pass) {
        g.passedAt = m;
        out.final = 'passed';
        const delay = m - g.gate.month;
        for (const p of pending) if (p.ec.gateKey === g.key && p.status === 'held') p.due = Math.max(p.ec.month + delay, m);
      } else {
        g.retries++;
        const max = g.gate.maxRetries ?? 3;
        if (g.retries > max) {
          g.dropped = true;
          out.final = 'dropped';
          for (const p of pending) if (p.ec.gateKey === g.key && p.status === 'held') p.status = 'dropped';
        } else g.nextEval = m + (g.gate.retryMonths ?? retryDefault);
      }
      gateOutcomes.push(out);
    }
    // 2. Apply changes due this month.
    current = resolve(activeOverrideValues(m));
    for (const p of pending) {
      if (p.status !== 'held' || p.due !== m) continue;
      const t = registry.get(p.ec.change.type);
      if (!t) {
        p.status = 'error';
        p.message = `Unknown change type "${p.ec.change.type}"`;
        warn(p.message);
        continue;
      }
      const ctx: ApplyContext = { ws, month: m, change: p.ec.change, A, horizon: H, warn: (msg) => warn(`${t.label} (${p.ec.change.id}): ${msg}`) };
      try {
        t.apply(state, p.ec.change.params as never, ctx);
        p.status = 'applied';
      } catch (e) {
        p.status = 'error';
        p.message = (e as Error).message;
        warn(`${t.label} (${p.ec.change.id}) failed: ${p.message}`);
      }
    }
    // 3. Compute the month.
    const row = computeRow(m);
    rows.push(row);
    prevRow = row;
  }

  for (const p of pending) if (p.status === 'held') p.status = p.ec.gate ? 'held' : 'beyond horizon';

  // Incremental vs baseline.
  let cumC = 0;
  let cumG = 0;
  let cumPG = 0;
  let cumPC = 0;
  for (const r of rows) {
    const b = baseline?.rows[r.month];
    cumPG += r.pursuitsGP;
    cumPC += r.pursuitsCost;
    r.cumPursuitsGP = cumPG;
    r.cumPursuitsCost = cumPC;
    r.incCost = b ? r.totalCost - b.totalCost : 0;
    r.incGP = b ? r.gpImpact - b.gpImpact : 0;
    r.companyGP = r.companyGPPlan + r.incGP;
    cumC += r.incCost;
    cumG += r.incGP;
    r.cumIncCost = cumC;
    r.cumIncGP = cumG;
    r.cumNet = cumG - cumC;
  }

  const changes: ChangeOutcome[] = pending.map((p) => {
    const t = registry.get(p.ec.change.type);
    return {
      changeId: p.ec.change.id,
      origin: p.ec.origin,
      type: p.ec.change.type,
      label: t ? t.describe(p.ec.change.params as never, ws) : p.ec.change.type,
      plannedMonth: p.ec.month,
      actualMonth: p.status === 'applied' ? p.due : null,
      status: p.status,
      gateKey: p.ec.gateKey,
      message: p.message,
    };
  });

  const conflicts = new Set<string>();
  for (const id of usedIds) {
    const r = base.byId.get(id);
    if (r?.status === 'Conflict') conflicts.add(id);
  }
  for (const r of resCache.values()) for (const id of usedIds) r.byId.get(id)?.conflicts.forEach((c) => conflicts.add(c));

  const result: ScenarioResult = {
    scenarioId,
    scenarioName: sc.name,
    caseKey,
    horizon: H,
    rows,
    summary: {} as ScenarioSummary,
    gates: gateOutcomes,
    changes,
    assumptionIds: [...usedIds].sort(),
    conflicts: [...conflicts].sort(),
    warnings,
    resolution: base,
    baseline,
    people: [...state.people.values()],
  };
  result.summary = summarize(result, ws.settings.viewMonths ?? 24);
  return result;
}

/** Sum of a field over months [from, to). */
export function sumRows(rows: MonthRow[], key: keyof MonthRow, from: number, to: number): number {
  let s = 0;
  for (const r of rows) if (r.month >= from && r.month < to) s += r[key] as number;
  return s;
}

export function summarize(r: ScenarioResult, viewMonths: number): ScenarioSummary {
  const rows = r.rows;
  const years = Math.ceil(r.horizon / 12);
  const costByYear: number[] = [];
  const incCostByYear: number[] = [];
  const gpByYear: number[] = [];
  for (let y = 0; y < years; y++) {
    costByYear.push(sumRows(rows, 'totalCost', y * 12, y * 12 + 12));
    incCostByYear.push(sumRows(rows, 'incCost', y * 12, y * 12 + 12));
    gpByYear.push(sumRows(rows, 'incGP', y * 12, y * 12 + 12));
  }
  const v = Math.min(viewMonths, rows.length);
  const incView = sumRows(rows, 'incCost', 0, v);
  const gpView = sumRows(rows, 'incGP', 0, v);
  // Payback: first month after which cumulative net stays at or above zero, given there was a cost to recover.
  let payback: number | null = null;
  if (rows.some((x) => x.cumIncCost > 0)) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].cumIncCost > 0 && rows[i].cumNet >= 0 && rows.slice(i).every((x) => x.cumNet >= 0)) {
        payback = rows[i].month;
        break;
      }
    }
  } else payback = 0;
  const at = rows[Math.min(v, rows.length - 1)] ?? rows[rows.length - 1];
  const uplift = r.resolution.get('gp_uplift');
  let pursuitsPayback: number | null = null;
  if (rows.some((x) => x.pursuitsCost > 0 || x.pursuitsGP > 0)) {
    for (let i = 0; i < rows.length; i++) {
      const net = (x: MonthRow) => x.cumPursuitsGP - x.cumPursuitsCost;
      if (rows[i].cumPursuitsGP > 0 && net(rows[i]) >= 0 && rows.slice(i).every((x) => net(x) >= 0)) {
        pursuitsPayback = rows[i].month;
        break;
      }
    }
  }
  return {
    viewMonths: v,
    cost2y: sumRows(rows, 'totalCost', 0, 24),
    cost3y: sumRows(rows, 'totalCost', 0, 36),
    inc2y: sumRows(rows, 'incCost', 0, 24),
    inc3y: sumRows(rows, 'incCost', 0, 36),
    incCostByYear,
    costByYear,
    gpByYear,
    incGP2y: sumRows(rows, 'incGP', 0, 24),
    incGP3y: sumRows(rows, 'incGP', 0, 36),
    officeGP2y: sumRows(rows, 'officeGP', 0, 24),
    pursuitsGP2y: sumRows(rows, 'pursuitsGP', 0, 24),
    pursuitsCost2y: sumRows(rows, 'pursuitsCost', 0, 24),
    pursuitsPaybackMonth: pursuitsPayback,
    companyGP1y: sumRows(rows, 'companyGP', 0, 12),
    specialtyGP1y: sumRows(rows, 'gpUplift', 0, 12),
    specialtyShare1y: (() => {
      const c = sumRows(rows, 'companyGP', 0, 12);
      return c > 0 ? sumRows(rows, 'gpUplift', 0, 12) / c : NaN;
    })(),
    pursuitsBreakEvenDealGP: (() => {
      const f = sumRows(rows, 'pursuitsDealFactor', 0, 24);
      return f > 0 ? sumRows(rows, 'pursuitsCost', 0, 24) / f : NaN;
    })(),
    paybackMonth: payback,
    roiView: incView > 0 ? (gpView - incView) / incView : NaN,
    breakEvenGP: incView,
    breakEvenTouchedGP: uplift > 0 ? incView / uplift : NaN,
    coverageAtView: at.sellersPerSpecialist,
    architectCoverageAtView: at.sellersPerArchitect,
    specialistsAtView: at.specialists,
    headcountAtView: at.headcount,
  };
}

export type { SimOverride };
