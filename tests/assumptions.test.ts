import { describe, expect, it } from 'vitest';
import { resolveAssumptions } from '../src/core/assumptions/resolve';
import type { Assumption } from '../src/core/schema/types';

const a = (x: Partial<Assumption> & { id: string }): Assumption => ({ label: x.id, value: null, unit: '', status: 'Assumed', source: '', asOf: '', usedIn: '', notes: '', ...x });

describe('assumptions engine', () => {
  const list = [
    a({ id: 'R01', value: 70, low: 53, high: 70, status: 'Conflict', conservativeBound: 'high' }),
    a({ id: 'R02', value: 5 }),
    a({ id: 'R03', formula: 'R01 / R02' }),
    a({ id: 'R04', formula: 'R03 * 2' }),
    a({ id: 'R05', value: 100, low: 80, high: 120, unit: '$' }),
  ];
  it('evaluates formulas in dependency order and propagates Conflict', () => {
    const r = resolveAssumptions(list);
    expect(r.get('R04')).toBe(28);
    expect(r.find('R04')!.conflicts).toEqual(['R01']);
    expect(r.find('R04')!.deps.sort()).toEqual(['R01', 'R02', 'R03', 'R04']);
  });
  it('cases: conservative picks the conservative bound, aggressive the other', () => {
    expect(resolveAssumptions(list, { caseKey: 'conservative' }).get('R05')).toBe(120); // $ defaults to high
    expect(resolveAssumptions(list, { caseKey: 'aggressive' }).get('R05')).toBe(80);
    expect(resolveAssumptions(list, { caseKey: 'aggressive' }).get('R03')).toBeCloseTo(53 / 5);
    expect(resolveAssumptions(list, { caseKey: 'base' }).get('R05')).toBe(100);
  });
  it('bindings resolve semantic keys', () => {
    const r = resolveAssumptions(list, { bindings: { sellers: 'R01' } });
    expect(r.get('sellers')).toBe(70);
    expect(r.get('missing')).toBeNaN();
  });
  it('overrides replace values and formulas', () => {
    const r = resolveAssumptions(list, { overrides: { R01: 53 } });
    expect(r.get('R03')).toBeCloseTo(10.6);
    expect(r.find('R01')!.used).toBe('override');
  });
  it('detects cycles without crashing', () => {
    const r = resolveAssumptions([a({ id: 'X', formula: 'Y + 1' }), a({ id: 'Y', formula: 'X + 1' }), a({ id: 'Z', value: 1 })]);
    expect(r.cycles.length).toBeGreaterThan(0);
    expect(r.get('X')).toBeNaN();
    expect(r.find('X')!.error).toMatch(/Circular/);
    expect(r.get('Z')).toBe(1);
  });
  it('reports unknown inputs', () => {
    const r = resolveAssumptions([a({ id: 'X', formula: 'Q * 2' })]);
    expect(r.find('X')!.error).toMatch(/Unknown input/);
  });
});
