// Strategy and growth: OEM scorecards, large pursuits, gap analysis and the risk
// register. Pure functions over workspace data; the module renders them.

export interface OemScore {
  id: string;
  oem: string;
  period: string; // sortable, for example FY26 Q4 or 2026-10
  metric: string;
  actual?: number;
  target?: number;
  direction?: 'higher' | 'lower';
  unit?: string;
  source?: string;
}

export const PURSUIT_STAGES = ['Qualify', 'Develop', 'Propose', 'Negotiate', 'Closed won', 'Closed lost', 'No decision'] as const;
export type PursuitStage = (typeof PURSUIT_STAGES)[number];

export interface Pursuit {
  id: string;
  name: string;
  account?: string;
  oems: string[];
  practices: string[];
  stage: PursuitStage;
  value?: number;
  gp?: number;
  closeDate?: string; // YYYY-MM-DD
  owner?: string;
  /** Areas where redesign was weak on this pursuit, for example "No certified NSX engineer". */
  gaps: string[];
  lossReason?: string;
  notes?: string;
}

export const RISK_AREAS = ['OEM performance', 'Capability gap', 'Coverage gap', 'Certification gap', 'Delivery capacity', 'Concentration', 'Competitive', 'Other'] as const;
export const RISK_STATUSES = ['Open', 'Mitigating', 'Closed', 'Accepted'] as const;

export interface Risk {
  id: string;
  title: string;
  area: (typeof RISK_AREAS)[number];
  oem?: string;
  /** 1 (rare) to 5 (almost certain). */
  likelihood: number;
  /** 1 (minor) to 5 (severe). */
  impact: number;
  owner?: string;
  mitigation?: string;
  status: (typeof RISK_STATUSES)[number];
  /** One-time or annual investment proposed to close the gap. */
  investment?: number;
  /** Scenario that models the investment, for cost, GP and payback. */
  scenarioId?: string;
  source?: string;
  /** Key of the gap suggestion it came from, to avoid duplicates. */
  gapKey?: string;
}

export interface GrowthSettings {
  /** Amber when actual misses target by no more than this share. */
  amberTolerance: number;
  /** Risk score at or above this is high. */
  highRisk: number;
  /** Risk score at or above this is medium. */
  mediumRisk: number;
  /** Share of active pursuit GP with one OEM that counts as concentration. */
  concentrationShare: number;
  metrics: string[];
}

export function defaultGrowthSettings(): GrowthSettings {
  return {
    amberTolerance: 0.1,
    highRisk: 15,
    mediumRisk: 8,
    concentrationShare: 0.5,
    metrics: ['GP', 'Revenue', 'GP growth YoY', 'Deal registrations', 'Certified engineers', 'Services attach rate', 'Win rate', 'Pipeline', 'Partner tier requirements met'],
  };
}

// ---------------- Scorecard ----------------

export type Rag = 'green' | 'amber' | 'red' | 'none';

export function rag(s: Pick<OemScore, 'actual' | 'target' | 'direction'>, tolerance: number): Rag {
  if (s.actual == null || s.target == null || !Number.isFinite(s.actual) || !Number.isFinite(s.target)) return 'none';
  const higher = (s.direction ?? 'higher') === 'higher';
  const met = higher ? s.actual >= s.target : s.actual <= s.target;
  if (met) return 'green';
  const miss = s.target === 0 ? Infinity : Math.abs(s.actual - s.target) / Math.abs(s.target);
  return miss <= tolerance ? 'amber' : 'red';
}

export interface ScoreLine {
  oem: string;
  metric: string;
  latest: OemScore;
  prior?: OemScore;
  rag: Rag;
  /** +1 better, -1 worse, 0 same or unknown, judged by direction. */
  trend: -1 | 0 | 1;
}

export function periods(scores: OemScore[]): string[] {
  return [...new Set(scores.map((s) => s.period))].sort();
}

/** Latest value per OEM and metric, with the prior period for the trend. */
export function scorecard(scores: OemScore[], tolerance: number): ScoreLine[] {
  const groups = new Map<string, OemScore[]>();
  for (const s of scores) {
    const k = `${s.oem}|${s.metric}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  const out: ScoreLine[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.period.localeCompare(b.period));
    const latest = sorted[sorted.length - 1];
    const prior = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
    let trend: -1 | 0 | 1 = 0;
    if (prior?.actual != null && latest.actual != null && prior.actual !== latest.actual) {
      const up = latest.actual > prior.actual;
      trend = (latest.direction ?? 'higher') === 'higher' ? (up ? 1 : -1) : up ? -1 : 1;
    }
    out.push({ oem: latest.oem, metric: latest.metric, latest, prior, rag: rag(latest, tolerance), trend });
  }
  return out.sort((a, b) => a.oem.localeCompare(b.oem) || a.metric.localeCompare(b.metric));
}

export function ragCounts(lines: ScoreLine[]): Record<Rag, number> {
  const c: Record<Rag, number> = { green: 0, amber: 0, red: 0, none: 0 };
  for (const l of lines) c[l.rag]++;
  return c;
}

// ---------------- Pursuits ----------------

export const isOpen = (p: Pursuit) => !p.stage.startsWith('Closed') && p.stage !== 'No decision';
export const isWon = (p: Pursuit) => p.stage === 'Closed won';
export const isLost = (p: Pursuit) => p.stage === 'Closed lost' || p.stage === 'No decision';

export interface PursuitStats {
  active: number;
  activeGP: number;
  won: number;
  lost: number;
  wonGP: number;
  lostGP: number;
  /** Won / (won + lost), NaN with no closed pursuits. */
  winRate: number;
  avgPractices: number;
  /** Pursuits touched per year, over the span of close dates. NaN with too little data. */
  perYear: number;
  avgWonGP: number;
  byPractice: Record<string, number>;
  byOem: Record<string, { count: number; gp: number }>;
}

export function pursuitStats(list: Pursuit[]): PursuitStats {
  const won = list.filter(isWon);
  const lost = list.filter(isLost);
  const active = list.filter(isOpen);
  const sum = (xs: Pursuit[], f: (p: Pursuit) => number | undefined) => xs.reduce((s, p) => s + (f(p) ?? 0), 0);
  const byPractice: Record<string, number> = {};
  const byOem: Record<string, { count: number; gp: number }> = {};
  for (const p of list) {
    for (const pr of p.practices) byPractice[pr] = (byPractice[pr] ?? 0) + 1;
    for (const o of p.oems) {
      byOem[o] ??= { count: 0, gp: 0 };
      byOem[o].count++;
      byOem[o].gp += (p.gp ?? 0) / Math.max(1, p.oems.length);
    }
  }
  const dates = list.map((p) => p.closeDate).filter((d): d is string => !!d).sort();
  let perYear = NaN;
  if (dates.length >= 2) {
    const span = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / (365.25 * 86400000);
    if (span >= 0.25) perYear = list.length / span;
  }
  return {
    active: active.length,
    activeGP: sum(active, (p) => p.gp),
    won: won.length,
    lost: lost.length,
    wonGP: sum(won, (p) => p.gp),
    lostGP: sum(lost, (p) => p.gp),
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : NaN,
    avgPractices: list.length ? sum(list, (p) => p.practices.length) / list.length : NaN,
    perYear,
    avgWonGP: won.length ? sum(won, (p) => p.gp) / won.length : NaN,
    byPractice,
    byOem,
  };
}

// ---------------- Gap analysis ----------------

export interface GapSuggestion {
  key: string;
  title: string;
  area: Risk['area'];
  oem?: string;
  likelihood: number;
  impact: number;
  evidence: string;
}

/**
 * Suggests gaps from the data: scorecard metrics off target, gaps named on lost
 * pursuits, practices that never join pursuits, and OEM concentration.
 */
export function suggestGaps(scores: ScoreLine[], pursuits: Pursuit[], practices: { id: string; name: string; type: string }[], settings: GrowthSettings): GapSuggestion[] {
  const out: GapSuggestion[] = [];
  for (const l of scores) {
    if (l.rag !== 'red' && l.rag !== 'amber') continue;
    const worsening = l.trend < 0;
    out.push({
      key: `score:${l.oem}:${l.metric}`,
      title: `${l.oem}: ${l.metric} below target`,
      area: /certif/i.test(l.metric) ? 'Certification gap' : 'OEM performance',
      oem: l.oem,
      likelihood: l.rag === 'red' ? (worsening ? 5 : 4) : worsening ? 3 : 2,
      impact: /gp|revenue|tier/i.test(l.metric) ? 4 : 3,
      evidence: `${l.latest.period}: ${l.latest.actual} vs target ${l.latest.target}${l.prior ? `, ${worsening ? 'worse than' : 'not worse than'} ${l.prior.period}` : ''}`,
    });
  }
  // Gaps named on pursuits, weighted by lost GP.
  const gaps = new Map<string, { lost: number; lostGP: number; all: number; oems: Set<string> }>();
  for (const p of pursuits) {
    for (const g of p.gaps) {
      const k = g.trim();
      if (!k) continue;
      if (!gaps.has(k)) gaps.set(k, { lost: 0, lostGP: 0, all: 0, oems: new Set() });
      const e = gaps.get(k)!;
      e.all++;
      p.oems.forEach((o) => e.oems.add(o));
      if (isLost(p)) {
        e.lost++;
        e.lostGP += p.gp ?? 0;
      }
    }
  }
  for (const [g, e] of gaps) {
    out.push({
      key: `gap:${g.toLowerCase()}`,
      title: g,
      area: /certif/i.test(g) ? 'Certification gap' : /capacity|bandwidth|delivery|staff/i.test(g) ? 'Delivery capacity' : /compet/i.test(g) ? 'Competitive' : 'Capability gap',
      oem: e.oems.size === 1 ? [...e.oems][0] : undefined,
      likelihood: Math.min(5, 1 + e.all),
      impact: e.lostGP > 0 ? Math.min(5, 2 + e.lost) : 2,
      evidence: `Named on ${e.all} pursuit${e.all > 1 ? 's' : ''}; ${e.lost} lost (${Math.round(e.lostGP).toLocaleString('en-US')} GP)`,
    });
  }
  // Practices that never join a pursuit.
  const used = new Set(pursuits.flatMap((p) => p.practices));
  for (const pr of practices.filter((x) => x.type === 'practice' || x.type === 'pod')) {
    if (pursuits.length && !used.has(pr.id))
      out.push({ key: `practice:${pr.id}`, title: `No large pursuits involve ${pr.name}`, area: 'Coverage gap', likelihood: 3, impact: 3, evidence: `${pursuits.length} pursuits tracked; none list ${pr.name}` });
  }
  // OEM concentration of active pursuit GP.
  const active = pursuits.filter(isOpen);
  const total = active.reduce((s, p) => s + (p.gp ?? 0), 0);
  if (total > 0) {
    const byOem = new Map<string, number>();
    for (const p of active) for (const o of p.oems) byOem.set(o, (byOem.get(o) ?? 0) + (p.gp ?? 0) / Math.max(1, p.oems.length));
    for (const [o, gp] of byOem) {
      const share = gp / total;
      if (share >= settings.concentrationShare)
        out.push({ key: `concentration:${o}`, title: `Active pursuit GP concentrated on ${o}`, area: 'Concentration', oem: o, likelihood: 3, impact: share >= 0.75 ? 4 : 3, evidence: `${Math.round(share * 100)}% of active pursuit GP` });
    }
  }
  return out.sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact || a.title.localeCompare(b.title));
}

// ---------------- Risk register ----------------

export const riskScore = (r: Pick<Risk, 'likelihood' | 'impact'>) => Math.max(1, Math.min(5, r.likelihood)) * Math.max(1, Math.min(5, r.impact));

export function riskBand(score: number, s: GrowthSettings): 'high' | 'medium' | 'low' {
  return score >= s.highRisk ? 'high' : score >= s.mediumRisk ? 'medium' : 'low';
}

export function riskFromGap(g: GapSuggestion, id: string): Risk {
  return { id, title: g.title, area: g.area, oem: g.oem, likelihood: g.likelihood, impact: g.impact, status: 'Open', source: g.evidence, gapKey: g.key };
}

/** 5 x 5 counts: heat[likelihood - 1][impact - 1]. Closed risks are left out. */
export function heatMap(risks: Risk[]): number[][] {
  const h = Array.from({ length: 5 }, () => Array(5).fill(0) as number[]);
  for (const r of risks) if (r.status !== 'Closed') h[Math.max(1, Math.min(5, r.likelihood)) - 1][Math.max(1, Math.min(5, r.impact)) - 1]++;
  return h;
}
