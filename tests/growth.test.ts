import { describe, expect, it } from 'vitest';
import { rag, scorecard, ragCounts, pursuitStats, suggestGaps, riskScore, riskBand, riskFromGap, heatMap, defaultGrowthSettings, type OemScore, type Pursuit } from '../src/core/growth/growth';

const S = defaultGrowthSettings();
const sc = (oem: string, period: string, metric: string, actual: number, target: number, direction: 'higher' | 'lower' = 'higher'): OemScore => ({ id: `${oem}${period}${metric}`, oem, period, metric, actual, target, direction });

describe('OEM scorecard', () => {
  it('red, amber and green against target, both directions', () => {
    expect(rag({ actual: 100, target: 100 }, 0.1)).toBe('green');
    expect(rag({ actual: 95, target: 100 }, 0.1)).toBe('amber');
    expect(rag({ actual: 80, target: 100 }, 0.1)).toBe('red');
    expect(rag({ actual: 8, target: 10, direction: 'lower' }, 0.1)).toBe('green');
    expect(rag({ actual: 12, target: 10, direction: 'lower' }, 0.1)).toBe('red');
    expect(rag({ actual: undefined, target: 10 }, 0.1)).toBe('none');
  });
  it('takes the latest period and the trend from the one before', () => {
    const lines = scorecard([sc('PAN', 'FY26 Q3', 'GP', 900, 1000), sc('PAN', 'FY26 Q4', 'GP', 800, 1000), sc('Dell', 'FY26 Q4', 'GP', 1100, 1000)], 0.1);
    const pan = lines.find((l) => l.oem === 'PAN')!;
    expect(pan.latest.period).toBe('FY26 Q4');
    expect(pan.rag).toBe('red');
    expect(pan.trend).toBe(-1);
    expect(ragCounts(lines)).toEqual({ green: 1, amber: 0, red: 1, none: 0 });
  });
});

const P = (id: string, stage: Pursuit['stage'], oems: string[], practices: string[], gp: number, gaps: string[] = [], closeDate?: string): Pursuit => ({ id, name: id, stage, oems, practices, gp, gaps, closeDate });
const pursuits = [
  P('a', 'Closed won', ['PAN'], ['cybersecurity', 'services'], 300, [], '2026-01-15'),
  P('b', 'Closed lost', ['PAN'], ['cybersecurity'], 200, ['No certified XSIAM engineer'], '2026-04-15'),
  P('c', 'Closed lost', ['Broadcom/VMware'], ['services'], 400, ['No certified XSIAM engineer', 'Delivery capacity in Q3'], '2026-07-15'),
  P('d', 'Propose', ['PAN'], ['cybersecurity', 'networking', 'services'], 500, [], '2027-01-15'),
];

describe('large pursuits', () => {
  it('counts, win rate, practices involved and pace', () => {
    const s = pursuitStats(pursuits);
    expect(s).toMatchObject({ active: 1, activeGP: 500, won: 1, lost: 2, wonGP: 300, lostGP: 600, avgWonGP: 300 });
    expect(s.winRate).toBeCloseTo(1 / 3);
    expect(s.avgPractices).toBeCloseTo(7 / 4);
    expect(s.byPractice.services).toBe(3);
    expect(s.perYear).toBeCloseTo(4 / 1, 0);
  });
});

describe('gap analysis and risk register', () => {
  const lines = scorecard([sc('PAN', 'FY26 Q3', 'Certified engineers', 6, 10), sc('PAN', 'FY26 Q4', 'Certified engineers', 5, 10)], 0.1);
  const practices = [{ id: 'cybersecurity', name: 'Cybersecurity', type: 'practice' }, { id: 'services', name: 'Services', type: 'practice' }, { id: 'networking', name: 'Networking', type: 'practice' }, { id: 'microsoft', name: 'Microsoft', type: 'practice' }, { id: 'oem-pan', name: 'Palo Alto Networks', type: 'OEM line' }];
  const gaps = suggestGaps(lines, pursuits, practices, S);
  it('suggests gaps from red metrics, pursuit gaps, idle practices and concentration', () => {
    const keys = gaps.map((g) => g.key);
    expect(keys).toContain('score:PAN:Certified engineers');
    expect(gaps.find((g) => g.key === 'score:PAN:Certified engineers')!.area).toBe('Certification gap');
    const x = gaps.find((g) => g.key === 'gap:no certified xsiam engineer')!;
    expect(x.evidence).toBe('Named on 2 pursuits; 2 lost (600 GP)');
    expect(x.area).toBe('Certification gap');
    expect(gaps.find((g) => g.key === 'gap:delivery capacity in q3')!.area).toBe('Delivery capacity');
    expect(keys).toContain('practice:microsoft');
    expect(keys).not.toContain('practice:oem-pan');
    expect(keys).toContain('concentration:PAN');
  });
  it('scores and bands risks and builds a heat map', () => {
    const r = riskFromGap(gaps[0], 'r1');
    expect(riskScore(r)).toBe(r.likelihood * r.impact);
    expect(riskBand(20, S)).toBe('high');
    expect(riskBand(9, S)).toBe('medium');
    expect(riskBand(4, S)).toBe('low');
    const h = heatMap([{ ...r, likelihood: 5, impact: 4 }, { ...r, likelihood: 5, impact: 4, status: 'Closed' }]);
    expect(h[4][3]).toBe(1);
  });
});
