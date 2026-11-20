// Golden tests. These match the assumptions register and must always pass.
import { describe, expect, it } from 'vitest';
import { ratio, specialistsNeeded, loadedFromWageShare } from '../src/core/engine/calc';
import { ratio1, money, moneyRange } from '../src/core/format';
import { sampleWorkspace } from '../src/samples/seed';
import { runScenario } from '../src/core/engine/run';
import { buildVsBuy } from '../src/core/engine/buildbuy';
import { resolveAssumptions } from '../src/core/assumptions/resolve';
import type { Workspace } from '../src/core/schema/types';

describe('coverage ratios', () => {
  it('sellers per specialist', () => {
    expect(ratio1(ratio(70, 5))).toBe('14.0');
    expect(ratio1(ratio(70, 4))).toBe('17.5');
    expect(ratio1(ratio(70, 9))).toBe('7.8');
  });
  it('specialists needed on 70 sellers', () => {
    expect(specialistsNeeded(70, 8)).toBe(9);
    expect(specialistsNeeded(70, 4)).toBe(18);
  });
  it('sellers per architect', () => {
    expect(ratio1(ratio(53, 16))).toBe('3.3');
  });
});

describe('director loaded cost (round only at display)', () => {
  it('per hire', () => {
    expect(Math.round(loadedFromWageShare(161_690, 0.7))).toBe(230_986);
    expect(Math.round(loadedFromWageShare(230_447, 0.7))).toBe(329_210);
  });
  it('two hires over two years', () => {
    const lo = 2 * 2 * loadedFromWageShare(161_690, 0.7);
    const hi = 2 * 2 * loadedFromWageShare(230_447, 0.7);
    expect(Math.round(lo)).toBe(923_943);
    expect(Math.round(hi)).toBe(1_316_840);
    expect(moneyRange(lo, hi)).toBe('$924K to $1.32M');
  });
});

describe('golden numbers through the engine and register', () => {
  const ws = sampleWorkspace();

  it('derived register rows', () => {
    const r = resolveAssumptions(ws.assumptions, { caseKey: 'base', bindings: ws.settings.bindings });
    expect(ratio1(r.get('R24'))).toBe('14.0');
    expect(r.get('R25')).toBe(9);
    expect(r.get('R26')).toBe(18);
    expect(Math.round(r.get('R28'))).toBe(Math.round(196_069 / 0.7));
    expect(r.find('R24')!.conflicts).toEqual(['R01']);
    const alt = resolveAssumptions(ws.assumptions, { caseKey: 'base', bindings: ws.settings.bindings, overrides: { R01: 53 } });
    expect(ratio1(alt.get('R27'))).toBe('3.3');
    const lo = resolveAssumptions(ws.assumptions, { caseKey: 'low', bindings: ws.settings.bindings });
    const hi = resolveAssumptions(ws.assumptions, { caseKey: 'high', bindings: ws.settings.bindings });
    expect(Math.round(lo.get('R28'))).toBe(230_986);
    expect(Math.round(hi.get('R28'))).toBe(329_210);
  });

  it('baseline coverage is 70 / 5 = 14.0 and flags the seller Conflict', () => {
    const r = runScenario(ws, 'baseline');
    expect(r.rows[0].sellers).toBe(70);
    expect(r.rows[0].specialists).toBe(5);
    expect(ratio1(r.rows[0].sellersPerSpecialist)).toBe('14.0');
    expect(r.rows[0].architects).toBe(16);
    expect(r.conflicts).toContain('R01');
  });

  it('sellers per architect on the alternate seller count: 53 / 16 = 3.3', () => {
    const w: Workspace = structuredClone(ws);
    w.scenarios.push({ id: 'alt', name: 'Alt sellers', description: '', gates: [], changes: [{ id: 'o', type: 'override', month: 0, params: { assumptionId: 'R01', useAlternate: 1 } }] });
    const r = runScenario(w, 'alt');
    expect(r.rows[0].sellers).toBe(53);
    expect(ratio1(r.rows[0].sellersPerArchitect)).toBe('3.3');
  });

  it('Option C specialists: 4 at M0 (17.5), 5 by M6, 7 by M18, 9 by M24 (7.8)', () => {
    const r = runScenario(ws, 'option-c');
    expect(r.rows[0].specialists).toBe(4);
    expect(ratio1(r.rows[0].sellersPerSpecialist)).toBe('17.5');
    expect(r.rows[5].specialists).toBe(4);
    expect(r.rows[6].specialists).toBe(5);
    expect(r.rows[17].specialists).toBe(5);
    expect(r.rows[18].specialists).toBe(7);
    expect(r.rows[24].specialists).toBe(9);
    expect(ratio1(r.rows[24].sellersPerSpecialist)).toBe('7.8');
    expect(r.rows[24].specialistsNeededStrain).toBe(9);
    expect(r.rows[24].specialistsNeededReference).toBe(18);
  });

  it('build vs buy: two directors over two years vs diagnostic + fractional leader + reports', () => {
    const b = buildVsBuy(ws, { compKey: 'director_comp', wageShareKey: 'wage_share', count: 2, months: 24, serviceIds: ['svc-diagnostic', 'svc-fractional', 'svc-benchmark'] });
    expect(Math.round(b.low.perHireLoaded)).toBe(230_986);
    expect(Math.round(b.high.perHireLoaded)).toBe(329_210);
    expect(Math.round(b.low.build)).toBe(923_943);
    expect(Math.round(b.high.build)).toBe(1_316_840);
    expect(moneyRange(b.low.build, b.high.build)).toBe('$924K to $1.32M');
    expect(b.low.buyYear1).toBe(126_000);
    expect(b.high.buyYear1).toBe(404_000);
    expect(b.low.buy).toBe(130_000);
    expect(b.high.buy).toBe(408_000);
  });

  it('buy scenario costs 126K to 404K in year one and 130K to 408K over two years', () => {
    const lo = runScenario(ws, 'buy', { caseKey: 'low' });
    const hi = runScenario(ws, 'buy', { caseKey: 'high' });
    expect(lo.summary.incCostByYear[0]).toBe(126_000);
    expect(hi.summary.incCostByYear[0]).toBe(404_000);
    expect(lo.summary.inc2y).toBe(130_000);
    expect(hi.summary.inc2y).toBe(408_000);
    expect(money(hi.summary.inc2y)).toBe('$408K');
  });
});
