// Synthetic sample workspace. Real structure, synthetic comp and names.
// Ships with the app so it is useful on first open and the tests have known answers.
// No real compensation, GP or customer data belongs here.
import type {
  Account,
  Assumption,
  EffortLog,
  ExternalService,
  Kpi,
  Person,
  Practice,
  RevenueFact,
  Scenario,
  Territory,
  Vendor,
  Workspace,
} from '../core/schema/types';
import { SCHEMA_VERSION } from '../core/schema/types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SRC = 'Sample register (synthetic). Replace with your register import.';
const ASOF = '2026-11';

const A = (a: Partial<Assumption> & Pick<Assumption, 'id' | 'label' | 'unit'>): Assumption => ({
  value: null,
  status: 'Assumed',
  source: SRC,
  asOf: ASOF,
  usedIn: '',
  notes: '',
  ...a,
});

export function sampleAssumptions(): Assumption[] {
  return [
    A({
      id: 'R01',
      label: 'Core sellers today',
      value: 70,
      low: 53,
      high: 70,
      unit: 'people',
      status: 'Conflict',
      conservativeBound: 'high',
      usedIn: 'Coverage ratios, specialists needed',
      notes: 'Proposal uses about 70. The territory roster count is 53. Resolve before CEO review.',
      alternates: [{ value: 53, source: 'Territory alignment roster (sample)', note: 'Roster count' }],
    }),
    A({ id: 'R02', label: 'Specialists today', value: 5, unit: 'people', status: 'Measured', usedIn: 'Coverage today' }),
    A({ id: 'R03', label: 'Solutions architects today (excluding principal)', value: 16, unit: 'people', status: 'Measured', usedIn: 'Architect coverage', notes: '16 SAs plus 1 Account Principal Architect = 17 architects.' }),
    A({ id: 'R04', label: 'Wage share of loaded cost', value: 0.7, unit: 'ratio', status: 'Stated', usedIn: 'Loaded cost, build vs buy' }),
    A({ id: 'R05', label: 'Default burden', unit: '%', formula: '1 / R04 - 1', status: 'Assumed', usedIn: 'People cost', notes: 'Derived so that loaded cost = cash comp / wage share.' }),
    A({ id: 'R06', label: 'Reference coverage, sellers per specialist (Alexander Group average)', value: 4, unit: 'ratio', status: 'Stated', usedIn: 'Coverage chart reference band' }),
    A({ id: 'R07', label: 'Field strain line, sellers per specialist', value: 8, unit: 'ratio', status: 'Stated', usedIn: 'Coverage chart, specialists needed' }),
    A({ id: 'R08', label: 'Hiring lag, release to start', value: 3, low: 2, high: 6, unit: 'months', conservativeBound: 'high', usedIn: 'Hires without their own lag' }),
    A({ id: 'R09', label: 'Specialist ramp to full productivity', value: 6, low: 4, high: 9, unit: 'months', conservativeBound: 'high', usedIn: 'GP impact' }),
    A({ id: 'R10', label: 'Specialist-touched GP per specialist per year', value: 2_000_000, low: 1_500_000, high: 2_500_000, unit: '$/yr', conservativeBound: 'low', usedIn: 'GP impact' }),
    A({ id: 'R11', label: 'GP uplift on specialist-touched deals', value: 0.1, low: 0.05, high: 0.15, unit: '%', conservativeBound: 'low', usedIn: 'GP impact, break-even' }),
    A({ id: 'R12', label: 'Win rate', value: 0.3, low: 0.25, high: 0.35, unit: '%', status: 'Measured', conservativeBound: 'low', usedIn: 'GP driver' }),
    A({ id: 'R13', label: 'Services attach rate', value: 0.25, low: 0.2, high: 0.3, unit: '%', conservativeBound: 'low', usedIn: 'GP driver' }),
    A({ id: 'R14', label: 'Specialist utilization', value: 0.75, low: 0.65, high: 0.85, unit: '%', conservativeBound: 'low', usedIn: 'GP driver' }),
    A({ id: 'R15', label: 'Director cash comp', value: 196_069, low: 161_690, high: 230_447, unit: '$/yr', status: 'Stated', conservativeBound: 'high', usedIn: 'Build vs buy, director hires', notes: 'Base is the midpoint of the range.' }),
    A({ id: 'R16', label: 'Productive hours per FTE month', value: 140, unit: 'hours', usedIn: 'Capacity' }),
    A({ id: 'R17', label: 'Tier 1 requests per month', value: 400, unit: 'requests', usedIn: 'Tier shifts' }),
    A({ id: 'R18', label: 'Tier 2 requests per month', value: 150, low: 120, high: 180, unit: 'requests', conservativeBound: 'low', usedIn: 'Tier shifts' }),
    A({ id: 'R19', label: 'Tier 3 requests per month', value: 20, unit: 'requests', usedIn: 'Tier shifts' }),
    A({ id: 'R20', label: 'Hours per Tier 1 request', value: 0.5, unit: 'hours', usedIn: 'Tier shifts' }),
    A({ id: 'R21', label: 'Hours per Tier 2 request', value: 6, low: 4, high: 8, unit: 'hours', conservativeBound: 'low', usedIn: 'Tier shifts' }),
    A({ id: 'R22', label: 'Hours per Tier 3 request', value: 40, unit: 'hours', usedIn: 'Tier shifts' }),
    A({ id: 'R23', label: 'Monthly revenue (for % of revenue pricing)', value: 15_000_000, unit: '$/mo', usedIn: 'Services priced on revenue' }),
    A({ id: 'R24', label: 'Sellers per specialist today', unit: 'ratio', formula: 'R01 / R02', usedIn: 'Headline coverage' }),
    A({ id: 'R25', label: 'Specialists needed at the strain line', unit: 'people', formula: 'ceil(R01 / R07)', usedIn: 'Hiring plan' }),
    A({ id: 'R26', label: 'Specialists needed at the reference ratio', unit: 'people', formula: 'ceil(R01 / R06)', usedIn: 'Hiring plan' }),
    A({ id: 'R27', label: 'Sellers per architect today', unit: 'ratio', formula: 'R01 / R03', usedIn: 'Architect coverage' }),
    A({ id: 'R28', label: 'Director loaded cost', unit: '$/yr', formula: 'R15 / R04', usedIn: 'Build vs buy' }),
    A({ id: 'R29', label: 'Diagnostic engagement price', value: 150_000, low: 50_000, high: 250_000, unit: '$', status: 'Stated', conservativeBound: 'high', usedIn: 'Buy option' }),
    A({ id: 'R30', label: 'Fractional revenue leader, monthly retainer', value: 9_000, low: 6_000, high: 12_500, unit: '$/mo', status: 'Stated', conservativeBound: 'high', usedIn: 'Buy option', notes: '12 months = 72,000 to 150,000.' }),
    A({ id: 'R31', label: 'Benchmark subscription, annual', value: 4_000, low: 4_000, high: 4_000, unit: '$/yr', status: 'Stated', usedIn: 'Buy option', notes: 'About 4,000 a year.' }),
    A({ id: 'R32', label: 'Specialist cash comp (base + variable)', value: 200_000, low: 180_000, high: 230_000, unit: '$/yr', conservativeBound: 'high', usedIn: 'Specialist hires' }),
    A({ id: 'R33', label: 'Avant desk seller cash comp', value: 120_000, low: 100_000, high: 140_000, unit: '$/yr', conservativeBound: 'high', usedIn: 'Avant desk' }),
  ];
}

export const SAMPLE_BINDINGS: Record<string, string> = {
  sellers_baseline: 'R01',
  wage_share: 'R04',
  burden_pct: 'R05',
  coverage_reference: 'R06',
  coverage_strain: 'R07',
  hire_lag_months: 'R08',
  ramp_months: 'R09',
  gp_per_specialist: 'R10',
  gp_uplift: 'R11',
  win_rate: 'R12',
  attach_rate: 'R13',
  utilization: 'R14',
  director_comp: 'R15',
  hours_per_fte_month: 'R16',
  tier1_requests: 'R17',
  tier2_requests: 'R18',
  tier3_requests: 'R19',
  tier1_hours: 'R20',
  tier2_hours: 'R21',
  tier3_hours: 'R22',
  revenue_monthly: 'R23',
  specialist_comp: 'R32',
  avant_desk_comp: 'R33',
};

export function samplePractices(): Practice[] {
  return [
    { id: 'services', name: 'Services', type: 'practice' },
    { id: 'cybersecurity', name: 'Cybersecurity', type: 'practice' },
    { id: 'networking', name: 'Networking', type: 'practice' },
    { id: 'microsoft', name: 'Microsoft', type: 'practice' },
    { id: 'avant', name: 'Avant', type: 'pod' },
    { id: 'oem-pan', name: 'Palo Alto Networks', type: 'OEM line' },
    { id: 'oem-dell', name: 'Dell', type: 'OEM line' },
    { id: 'oem-vmware', name: 'Broadcom/VMware', type: 'OEM line' },
    { id: 'oem-microsoft', name: 'Microsoft (OEM)', type: 'OEM line' },
    { id: 'oem-rapid7', name: 'Rapid7', type: 'OEM line' },
    { id: 'oem-crowdstrike', name: 'CrowdStrike', type: 'OEM line' },
  ];
}

const TERRITORIES = ['Territory 1', 'Territory 2', 'Territory 3', 'Territory 4', 'Territory 5', 'Territory 6'];

export function sampleTerritories(): Territory[] {
  return TERRITORIES.map((name, i) => ({ id: `t${i + 1}`, name, rvp: i < 3 ? 'RVP East (sample)' : 'RVP West (sample)', regionalDirectors: [`Regional Director ${i + 1} (sample)`] }));
}

export function samplePeople(): Person[] {
  const r = rng(42);
  const people: Person[] = [];
  const P = (p: Partial<Person> & Pick<Person, 'id' | 'name' | 'title' | 'roleFamily'>): Person => ({
    practices: [],
    base: 0,
    variableTarget: 0,
    fte: 1,
    status: 'current',
    synthetic: true,
    ...p,
  });
  people.push(P({ id: 'p-rvp-east', name: 'RVP East (sample)', title: 'Regional Vice President', roleFamily: 'RVP', base: 210_000, variableTarget: 110_000 }));
  people.push(P({ id: 'p-rvp-west', name: 'RVP West (sample)', title: 'Regional Vice President', roleFamily: 'RVP', base: 210_000, variableTarget: 110_000 }));
  TERRITORIES.forEach((t, i) => {
    people.push(P({ id: `p-rd-${i + 1}`, name: `Regional Director ${i + 1} (sample)`, title: 'Regional Director', roleFamily: 'Regional Director', territory: `t${i + 1}`, managerId: i < 3 ? 'p-rvp-east' : 'p-rvp-west', base: 170_000, variableTarget: 80_000 }));
  });
  for (let i = 1; i <= 70; i++) {
    const t = ((i - 1) % 6) + 1;
    people.push(
      P({
        id: `p-seller-${String(i).padStart(2, '0')}`,
        name: `Seller ${String(i).padStart(2, '0')}`,
        title: 'Account Executive',
        roleFamily: 'Core Seller',
        territory: `t${t}`,
        managerId: `p-rd-${t}`,
        base: Math.round((95_000 + r() * 30_000) / 500) * 500,
        variableTarget: Math.round((90_000 + r() * 40_000) / 500) * 500,
      }),
    );
  }
  // Specialists (5). Named people carry synthetic comp.
  people.push(P({ id: 'p-vince', name: 'Vince Ippolito', title: 'Regional Sales Manager, Services', roleFamily: 'Specialist', practices: ['services'], team: 'Specialty Sales', base: 150_000, variableTarget: 60_000 }));
  people.push(P({ id: 'p-spec-cyber', name: 'Cybersecurity Specialist (sample)', title: 'Cybersecurity Specialist', roleFamily: 'Specialist', practices: ['cybersecurity', 'oem-pan', 'oem-crowdstrike', 'oem-rapid7'], team: 'Specialty Sales', base: 145_000, variableTarget: 60_000 }));
  people.push(P({ id: 'p-spec-net', name: 'Networking Specialist (sample)', title: 'Networking Specialist', roleFamily: 'Specialist', practices: ['networking', 'avant'], team: 'Specialty Sales', base: 140_000, variableTarget: 60_000 }));
  people.push(P({ id: 'p-spec-msft', name: 'Microsoft Specialist (sample)', title: 'Microsoft Specialist', roleFamily: 'Specialist', practices: ['microsoft'], team: 'Specialty Sales', base: 140_000, variableTarget: 55_000 }));
  people.push(P({ id: 'p-spec-dc', name: 'Datacenter Specialist (sample)', title: 'Datacenter Specialist', roleFamily: 'Specialist', practices: ['services', 'oem-dell', 'oem-vmware'], team: 'Specialty Sales', base: 145_000, variableTarget: 55_000 }));
  // Architects: 16 SAs plus Kurt Page as Account Principal Architect.
  people.push(P({ id: 'p-kurt', name: 'Kurt Page', title: 'Account Principal Architect', roleFamily: 'Account Principal Architect', practices: ['services'], team: 'Solutions Architecture', base: 200_000, variableTarget: 30_000 }));
  const saPractices = ['services', 'cybersecurity', 'networking', 'microsoft'];
  for (let i = 1; i <= 16; i++) {
    people.push(
      P({
        id: `p-sa-${String(i).padStart(2, '0')}`,
        name: `Solutions Architect ${String(i).padStart(2, '0')}`,
        title: 'Solutions Architect',
        roleFamily: 'Solutions Architect',
        territory: `t${((i - 1) % 6) + 1}`,
        practices: [saPractices[(i - 1) % 4]],
        team: 'Solutions Architecture',
        managerId: 'p-kurt',
        base: Math.round((150_000 + r() * 30_000) / 500) * 500,
        variableTarget: Math.round((15_000 + r() * 15_000) / 500) * 500,
      }),
    );
  }
  people.push(P({ id: 'p-sam', name: 'Sam Aguilar', title: 'Placeholder role (replace from roster)', roleFamily: 'SalesOps', team: 'Sales Operations', base: 150_000, variableTarget: 30_000 }));
  people.push(P({ id: 'p-ryan', name: 'Ryan McKee', title: 'Placeholder role (replace from roster)', roleFamily: 'Director', team: 'Alliances', base: 170_000, variableTarget: 40_000 }));
  return people;
}

export function sampleServices(): ExternalService[] {
  return [
    { id: 'svc-diagnostic', vendor: 'Diagnostic firm (sample)', name: 'Sales org diagnostic', category: 'diagnostic', pricingModel: 'fixed', low: 50_000, base: 150_000, high: 250_000, priceRef: 'R29', termMonths: null, startMonth: null, source: 'Quote range (sample)' },
    { id: 'svc-fractional', vendor: 'Fractional leader (sample)', name: 'Fractional revenue leader', category: 'fractional leader', pricingModel: 'monthly retainer', low: 6_000, base: 9_000, high: 12_500, priceRef: 'R30', termMonths: 12, startMonth: null, source: 'Estimate (sample)' },
    { id: 'svc-benchmark', vendor: 'Benchmark provider (sample)', name: 'Benchmark subscription', category: 'benchmark subscription', pricingModel: 'annual subscription', low: 4_000, base: 4_000, high: 4_000, priceRef: 'R31', termMonths: null, startMonth: null, source: 'List price (sample)' },
    { id: 'svc-recruiter', vendor: 'Recruiting firm (sample)', name: 'Specialist search', category: 'recruiting', pricingModel: 'fixed', low: 30_000, base: 40_000, high: 50_000, termMonths: null, startMonth: null, source: 'Estimate (sample)' },
  ];
}

export function sampleScenarios(): Scenario[] {
  const baseline: Scenario = { id: 'baseline', name: 'Baseline', description: 'Current roster and assumptions. 5 specialists, about 70 core sellers (Conflict: 53 on the roster), 17 architects, 6 territories.', changes: [], gates: [], locked: true };

  const specHire = (id: string, month: number, practice: string, lag?: number, tags: string[] = ['hiring']) => ({
    id,
    type: 'hire',
    month,
    tags,
    params: { title: `${practice[0].toUpperCase()}${practice.slice(1)} Specialist`, roleFamily: 'Specialist', count: 1, practices: [practice], team: `${practice[0].toUpperCase()}${practice.slice(1)} pod`, base: 0, variableTarget: 0, compAssumption: 'specialist_comp', fte: 1, ...(lag != null ? { lagMonths: lag } : {}) },
  });

  const optionA: Scenario = {
    id: 'option-a',
    name: 'Option A: pods now',
    description: 'Four practice pods (services, cybersecurity, networking, Microsoft) plus an Avant pod. Specialist hires toward the 1:8 line.',
    changes: [
      { id: 'a-pods', type: 'podAssign', month: 0, tags: ['pods'], params: { roleFamily: 'Specialist', suffix: ' pod' } },
      { id: 'a-avant', type: 'hire', month: 0, tags: ['avant'], params: { title: 'Avant pod seller', roleFamily: 'Inside Seller', count: 1, practices: ['avant'], team: 'Avant pod', base: 0, variableTarget: 0, compAssumption: 'avant_desk_comp', fte: 1 } },
      specHire('a-h1', 0, 'cybersecurity'),
      specHire('a-h2', 0, 'networking'),
      specHire('a-h3', 3, 'microsoft'),
      specHire('a-h4', 3, 'services'),
    ],
    gates: [],
  };

  const optionB: Scenario = {
    id: 'option-b',
    name: 'Option B: three-person office',
    description: 'A three-person office reporting to the CEO (Vince Ippolito, Sam Aguilar, Ryan McKee). Kurt Page becomes Director of Solutions Architecture and his principal seat is backfilled. Troy Sorrento backfills Vince’s specialist seat. Backfills only in year one.',
    changes: [
      { id: 'b-vince', type: 'move', month: 0, tags: ['office'], params: { personId: 'p-vince', roleFamily: 'Office', title: 'Curiosity and Technology Office', team: 'Curiosity and Technology Office' } },
      { id: 'b-sam', type: 'move', month: 0, tags: ['office'], params: { personId: 'p-sam', roleFamily: 'Office', title: 'Curiosity and Technology Office', team: 'Curiosity and Technology Office' } },
      { id: 'b-ryan', type: 'move', month: 0, tags: ['office'], params: { personId: 'p-ryan', roleFamily: 'Office', title: 'Curiosity and Technology Office', team: 'Curiosity and Technology Office' } },
      { id: 'b-kurt', type: 'move', month: 0, tags: ['office'], params: { personId: 'p-kurt', roleFamily: 'Director', title: 'Director of Solutions Architecture', team: 'Solutions Architecture' } },
      { id: 'b-kurt-bf', type: 'backfill', month: 0, tags: ['office'], params: { personId: 'p-kurt', name: 'Principal architect backfill' } },
      { id: 'b-troy', type: 'backfill', month: 0, tags: ['office'], params: { personId: 'p-vince', name: 'Troy Sorrento', lagMonths: 6 } },
    ],
    gates: [],
  };

  const optionC: Scenario = {
    id: 'option-c',
    name: 'Option C: office first, then pods',
    description: 'Option B for months 0 to 12, then Option A’s pods. Specialists 4 to 5 by month 6, +2 released at the month 12 gate (7 by month 18), +2 released at the month 18 gate (9 by month 24). Avant stays with specialists for 12 months, then moves to a dedicated desk.',
    inherits: [
      { scenarioId: 'option-b', fromMonth: 0, toMonth: 12 },
      { scenarioId: 'option-a', fromMonth: 12, toMonth: null, tags: ['pods'], carryEarlier: true },
    ],
    changes: [
      { ...specHire('c-g1-cyber', 12, 'cybersecurity', 6, ['hiring']), gateId: 'g12' },
      { ...specHire('c-g1-net', 12, 'networking', 6, ['hiring']), gateId: 'g12' },
      { ...specHire('c-g2-msft', 18, 'microsoft', 6, ['hiring']), gateId: 'g18' },
      { ...specHire('c-g2-svc', 18, 'services', 6, ['hiring']), gateId: 'g18' },
      { id: 'c-avant', type: 'hire', month: 12, tags: ['avant'], params: { title: 'Avant desk seller', roleFamily: 'Inside Seller', count: 1, practices: ['avant'], team: 'Avant desk', base: 0, variableTarget: 0, compAssumption: 'avant_desk_comp', fte: 1, lagMonths: 0 } },
      { id: 'c-avant-move', type: 'move', month: 12, tags: ['avant'], params: { personId: 'p-spec-net', practices: ['networking'] } },
    ],
    gates: [
      { id: 'g12', name: 'Month 12 gate', month: 12, kind: 'manual', manualOutcomes: {}, retryMonths: 6 },
      { id: 'g18', name: 'Month 18 gate', month: 18, kind: 'manual', manualOutcomes: {}, retryMonths: 6 },
    ],
  };

  const buy: Scenario = {
    id: 'buy',
    name: 'Buy instead of build',
    description: 'A diagnostic, a fractional revenue leader and a benchmark subscription in place of two director hires.',
    changes: [
      { id: 'buy-diag', type: 'serviceStart', month: 0, tags: ['buy'], params: { serviceId: 'svc-diagnostic' } },
      { id: 'buy-frac', type: 'serviceStart', month: 0, tags: ['buy'], params: { serviceId: 'svc-fractional', termMonths: 12 } },
      { id: 'buy-bench', type: 'serviceStart', month: 0, tags: ['buy'], params: { serviceId: 'svc-benchmark' } },
    ],
    gates: [],
  };
  return [baseline, optionA, optionB, optionC, buy];
}

export function sampleAccounts(): Account[] {
  const r = rng(7);
  return Array.from({ length: 30 }, (_, i) => ({
    id: `acct-${String(i + 1).padStart(2, '0')}`,
    name: `Sample Customer ${String(i + 1).padStart(2, '0')}`,
    territory: `t${(i % 6) + 1}`,
    owner: `Seller ${String((i % 70) + 1).padStart(2, '0')}`,
    tier: (r() < 0.2 ? 1 : r() < 0.6 ? 2 : 3) as 1 | 2 | 3,
    segment: ['Commercial', 'Enterprise', 'Public sector'][i % 3],
  }));
}

export function sampleRevenue(): RevenueFact[] {
  const r = rng(11);
  const lines = ['services', 'cybersecurity', 'networking', 'microsoft', 'avant'];
  const out: RevenueFact[] = [];
  let n = 0;
  for (const q of ['FY26 Q1', 'FY26 Q2', 'FY26 Q3', 'FY26 Q4']) {
    for (const line of lines) {
      const revenue = Math.round((1_500_000 + r() * 3_000_000) / 1000) * 1000;
      out.push({ id: `rv-${++n}`, line, period: q, revenue, gp: Math.round(revenue * (0.18 + r() * 0.15)), specialistTouched: r() < 0.5, source: 'Synthetic sample' });
    }
  }
  return out;
}

export function sampleEffort(): EffortLog[] {
  const r = rng(23);
  const types = ['VMware', 'Cybersecurity', 'Professional Services', 'Networking', 'Datacenter Colocation', 'Other'] as const;
  return Array.from({ length: 40 }, (_, i) => {
    const effort = Math.round(1 + r() * 12);
    return {
      id: `e-${i + 1}`,
      person: ['Vince Ippolito', 'Cybersecurity Specialist (sample)', 'Networking Specialist (sample)'][i % 3],
      period: 'FY26 H1',
      account: `Sample Customer ${String((i % 30) + 1).padStart(2, '0')}`,
      opportunityType: types[i % types.length],
      effort,
      revenue6mo: Math.round(effort * (40_000 + r() * 60_000)),
      gp6mo: Math.round(effort * (8_000 + r() * 15_000)),
      source: 'Synthetic sample',
    };
  });
}

export function sampleKpis(): Kpi[] {
  return [
    { id: 'k-coverage', name: 'Sellers per specialist', definition: 'Core sellers divided by specialists', formula: 'sellersPerSpecialist', unit: 'ratio', target: 8, cadence: 'monthly', owner: 'Curiosity and Technology Office', direction: 'lower' },
    { id: 'k-touched-gp', name: 'Specialist-touched GP', definition: 'GP on deals a specialist touched', unit: '$', cadence: 'quarterly', owner: 'Curiosity and Technology Office', direction: 'higher' },
  ];
}

export function sampleVendors(): Vendor[] {
  return [
    { id: 'v-pan', name: 'Palo Alto Networks', kind: 'OEM' },
    { id: 'v-dell', name: 'Dell', kind: 'OEM' },
    { id: 'v-broadcom', name: 'Broadcom/VMware', kind: 'OEM', programs: 'VMware Protection and Recovery' },
    { id: 'v-msft', name: 'Microsoft', kind: 'OEM' },
    { id: 'v-rapid7', name: 'Rapid7', kind: 'OEM' },
    { id: 'v-crowdstrike', name: 'CrowdStrike', kind: 'OEM' },
    { id: 'v-avant', name: 'Avant', kind: 'TSD' },
  ];
}

export const DEFAULT_DISPLAY_NAME = 'Curiosity and Technology Office';

export function sampleWorkspace(now = '2026-11-20T00:00:00.000Z'): Workspace {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'ws-sample',
    name: 'Sample workspace (synthetic)',
    createdAt: now,
    updatedAt: now,
    settings: {
      displayName: DEFAULT_DISPLAY_NAME,
      caseKey: 'conservative',
      horizonMonths: 36,
      viewMonths: 24,
      approvalMonth: '2027-01',
      gateRetryMonths: 6,
      bindings: { ...SAMPLE_BINDINGS },
      coverageGroups: { sellers: ['Core Seller'], specialists: ['Specialist'], architects: ['Solutions Architect'] },
      headcountAnchors: { sellers: 'sellers_baseline' },
    },
    assumptions: sampleAssumptions(),
    entities: {
      people: samplePeople(),
      territories: sampleTerritories(),
      practices: samplePractices(),
      accounts: sampleAccounts(),
      revenueFacts: sampleRevenue(),
      opportunities: [],
      effortLogs: sampleEffort(),
      externalServices: sampleServices(),
      initiatives: [],
      kpis: sampleKpis(),
      vendors: sampleVendors(),
    },
    scenarios: sampleScenarios(),
    baselineScenarioId: 'baseline',
    datasets: [],
    mappingTemplates: [],
    modules: {},
    moduleVersions: {},
    snapshots: [],
    changeLog: [{ at: now, action: 'Created sample workspace' }],
  };
}
