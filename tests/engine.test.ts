import { describe, expect, it } from 'vitest';
import { sampleWorkspace } from '../src/samples/seed';
import { runScenario, effectiveChanges } from '../src/core/engine/run';
import { explainMonth, explainSummary, MONTH_METRICS, SUMMARY_METRICS } from '../src/core/engine/explain';
import { tornado, bands } from '../src/core/engine/sensitivity';
import { createRegistry } from '../src/core/engine/changes';
import type { Workspace } from '../src/core/schema/types';

const ws = sampleWorkspace();

describe('seed scenarios', () => {
  for (const s of ws.scenarios) {
    it(`${s.name} computes cleanly for every case`, () => {
      for (const c of ['conservative', 'base', 'aggressive'] as const) {
        const r = runScenario(ws, s.id, { caseKey: c });
        expect(r.rows).toHaveLength(37);
        expect(r.warnings).toEqual([]);
        expect(r.changes.every((x) => x.status === 'applied')).toBe(true);
        for (const row of r.rows) expect(Number.isFinite(row.totalCost)).toBe(true);
      }
    });
  }
  it('is deterministic', () => {
    const a = runScenario(ws, 'option-c');
    const b = runScenario(ws, 'option-c');
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows));
  });
  it('baseline has zero incremental cost', () => {
    const r = runScenario(ws, 'baseline');
    expect(r.summary.inc2y).toBe(0);
  });
  it('Option A reaches the 1:8 line', () => {
    const r = runScenario(ws, 'option-a');
    expect(r.rows[24].specialists).toBe(9);
    expect(r.rows[24].sellersPerSpecialist).toBeLessThanOrEqual(8);
    expect(r.rows[0].headcountByTeam['Cybersecurity pod']).toBeGreaterThan(0);
    expect(r.rows[0].openReqs).toBeGreaterThan(0);
  });
  it('Option B: office of three, Kurt to director, backfills', () => {
    const r = runScenario(ws, 'option-b');
    expect(r.rows[0].headcountByRole['Office']).toBe(3);
    expect(r.rows[0].specialists).toBe(4);
    expect(r.rows[6].specialists).toBe(5);
    const troy = r.people.find((p) => p.name === 'Troy Sorrento')!;
    expect(troy.roleFamily).toBe('Specialist');
    expect(troy.startMonth).toBe(6);
    const bf = r.people.find((p) => p.name === 'Principal architect backfill')!;
    expect(bf.roleFamily).toBe('Account Principal Architect');
    expect(r.summary.inc2y).toBeGreaterThan(0);
  });
  it('Option C inherits B then A pods at month 12', () => {
    const eff = effectiveChanges(ws, 'option-c');
    expect(eff.find((e) => e.change.id === 'b-troy')?.month).toBe(0);
    expect(eff.find((e) => e.change.id === 'a-pods')?.month).toBe(12);
    expect(eff.some((e) => e.change.id === 'a-h1')).toBe(false); // A hires are not inherited
    const r = runScenario(ws, 'option-c');
    expect(r.rows[11].headcountByTeam['Cybersecurity pod']).toBeUndefined();
    expect(r.rows[12].headcountByTeam['Cybersecurity pod']).toBeGreaterThan(0);
    expect(r.gates.filter((g) => g.pass)).toHaveLength(2);
  });
  it('a missed gate holds its changes and reruns N months later', () => {
    const w: Workspace = structuredClone(ws);
    const c = w.scenarios.find((s) => s.id === 'option-c')!;
    c.gates[0].manualOutcomes = { '12': false };
    const r = runScenario(w, 'option-c');
    const g = r.gates.filter((x) => x.gateName === 'Month 12 gate');
    expect(g.map((x) => [x.month, x.pass])).toEqual([[12, false], [18, true]]);
    expect(r.rows[18].specialists).toBe(5);
    expect(r.rows[24].specialists).toBe(9); // 2 from gate 18 + 2 held from gate 12 (released at 18, start 24)
    expect(r.changes.find((x) => x.changeId === 'c-g1-cyber')!.actualMonth).toBe(18);
  });
  it('KPI gates evaluate engine metrics', () => {
    const w: Workspace = structuredClone(ws);
    const c = w.scenarios.find((s) => s.id === 'option-c')!;
    Object.assign(c.gates[0], { kind: 'kpi', metric: 'sellersPerSpecialist', comparator: '<=', threshold: 10, maxRetries: 1 });
    const r = runScenario(w, 'option-c');
    const g = r.gates.filter((x) => x.gateName === 'Month 12 gate');
    expect(g[0].pass).toBe(false); // 70 / 5 = 14 > 10
    expect(g.at(-1)!.final).toBe('dropped');
    expect(r.changes.find((x) => x.changeId === 'c-g1-cyber')!.status).toBe('dropped');
  });
  it('tier shifts free capacity with a ramp', () => {
    const w: Workspace = structuredClone(ws);
    w.scenarios.push({ id: 't', name: 'Tier', description: '', gates: [], changes: [{ id: 'ts', type: 'tierShift', month: 3, params: { fromTier: 2, toTier: 1, pct: 0.2, rampMonths: 4, destination: 'Large pursuits' } }] });
    const r = runScenario(w, 't', { caseKey: 'base' });
    expect(r.rows[2].hoursFreed).toBe(0);
    expect(r.rows[3].hoursFreed).toBeCloseTo(150 * 0.2 * 0.25 * 5.5);
    expect(r.rows[6].hoursFreed).toBeCloseTo(150 * 0.2 * 5.5);
    expect(r.rows[6].capacityByDestination['Large pursuits']).toBeCloseTo(165);
  });
  it('driver changes ramp and move GP', () => {
    const w: Workspace = structuredClone(ws);
    w.scenarios.push({ id: 'd', name: 'D', description: '', gates: [], changes: [{ id: 'dr', type: 'driver', month: 0, params: { driver: 'win_rate', mode: 'add', value: 0.03, rampMonths: 3 } }] });
    const r = runScenario(w, 'd', { caseKey: 'base' });
    expect(r.rows[2].driverFactor).toBeCloseTo(0.33 / 0.3);
    expect(r.rows[5].incGP).toBeGreaterThan(0);
  });
  it('custom change types plug in through the registry', () => {
    const reg = createRegistry([{ type: 'noop', label: 'No-op', short: 'Noop', fields: [], defaults: () => ({}), describe: () => 'noop', apply: () => {} }]);
    const w: Workspace = structuredClone(ws);
    w.scenarios.push({ id: 'n', name: 'N', description: '', gates: [], changes: [{ id: 'x', type: 'noop', month: 1, params: {} }] });
    expect(runScenario(w, 'n', { registry: reg }).changes[0].status).toBe('applied');
    expect(runScenario(w, 'n').changes[0].status).toBe('error');
  });
});

describe('show the math', () => {
  const r = runScenario(ws, 'option-c');
  it('explains every month metric with a formula', () => {
    for (const k of Object.keys(MONTH_METRICS)) {
      const t = explainMonth(ws, r, k, 24);
      expect(t.formula.length).toBeGreaterThan(0);
    }
  });
  it('flags the seller Conflict on coverage', () => {
    const t = explainMonth(ws, r, 'sellersPerSpecialist', 24);
    expect(t.conflicts).toContain('R01');
    expect(t.inputs.some((i) => i.assumptionId === 'R01' && i.status === 'Conflict')).toBe(true);
  });
  it('explains summary metrics', () => {
    for (const k of Object.keys(SUMMARY_METRICS)) expect(explainSummary(ws, r, k).label.length).toBeGreaterThan(0);
  });
});

describe('sensitivity', () => {
  it('tornado ranks the top assumptions', () => {
    const t = tornado(ws, 'option-c', 'netView', 'base');
    expect(t.bars.length).toBeGreaterThan(3);
    expect(t.bars.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < t.bars.length; i++) expect(t.bars[i - 1].swing).toBeGreaterThanOrEqual(t.bars[i].swing);
  });
  it('bands bracket the base case', () => {
    const b = bands(ws, 'buy');
    const total = (rows: { incCost: number }[]) => rows.reduce((s, r) => s + r.incCost, 0);
    expect(total(b.low)).toBeLessThan(total(b.base));
    expect(total(b.high)).toBeGreaterThan(total(b.base));
  });
});

describe('office and large pursuits programs', () => {
  const r = runScenario(ws, 'option-b', { caseKey: 'base' });
  it('office makes specialists 30% more effective after 6 months, plus 10% a year from campaigns', () => {
    expect(r.rows[5].effectiveness).toBe(1);
    expect(r.rows[6].effectiveness).toBeCloseTo(1.3);
    expect(r.rows[12].effectiveness).toBeCloseTo(1.3 * 1.1);
    expect(r.rows[24].effectiveness).toBeCloseTo(1.3 * 1.21);
    expect(r.rows[12].officeGP).toBeCloseTo(r.rows[12].gpUplift * (1 - 1 / (1.3 * 1.1)));
  });
  it('scenarios without the office get no lift', () => {
    const a = runScenario(ws, 'option-a', { caseKey: 'base' });
    expect(a.rows.every((x) => x.effectiveness === 1 && x.pursuitsGP === 0)).toBe(true);
    expect(a.summary.pursuitsPaybackMonth).toBeNull();
  });
  it('large pursuits: 8 deals a year, 35% higher win rate, 20% larger wins, after the sales cycle', () => {
    expect(r.rows[5].pursuitsGP).toBe(0);
    // base: 8/12 x 250K x (0.25 x 1.35 x 1.2 - 0.25)
    expect(r.rows[6].pursuitsGP).toBeCloseTo((8 / 12) * 250_000 * (0.25 * 1.35 * 1.2 - 0.25));
    expect(r.rows[6].pursuitsCost).toBeGreaterThan(0);
    // break-even deal GP makes 24 months of pursuits GP equal 24 months of time spent
    const be = r.summary.pursuitsBreakEvenDealGP;
    const f = r.rows.filter((x) => x.month < 24).reduce((s, x) => s + x.pursuitsDealFactor, 0);
    expect(be * f).toBeCloseTo(r.summary.pursuitsCost2y);
  });
  it('incremental GP now includes office effectiveness and pursuits', () => {
    const c = runScenario(ws, 'option-c', { caseKey: 'base' });
    expect(c.summary.officeGP2y).toBeGreaterThan(0);
    expect(c.summary.pursuitsGP2y).toBeGreaterThan(0);
    expect(r.summary.paybackMonth).not.toBeNull();
  });
});
