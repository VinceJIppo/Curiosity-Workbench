import type { AssumptionStatus, Change, ExternalService, Gate, Person, Workspace } from '../schema/types';
import type { CasePick, Resolution, BoundPick } from '../assumptions/resolve';

export interface SimPerson extends Person {
  startMonth: number;
  endMonth: number | null;
  /** Month the requisition opened. Open req from here until startMonth. */
  reqOpenMonth?: number;
  /** Where the record came from: 'baseline' or the change id that created it. */
  origin: string;
  /** Role fields before the first move, so a backfill copies the vacated seat. */
  seatBefore?: Pick<Person, 'roleFamily' | 'title' | 'territory' | 'team' | 'practices' | 'base' | 'variableTarget' | 'burdenPct' | 'managerId'>;
}

export interface SimService {
  key: string;
  service: ExternalService;
  start: number;
  /** Exclusive. Null runs to the end of the horizon. */
  end: number | null;
  origin: string;
}

export interface SimOverride {
  id: string; // assumption id or binding key
  value: number;
  from: number;
  rampMonths: number;
  mode: 'set' | 'add' | 'multiply';
  origin: string;
  until?: number | null;
}

export interface SimTierShift {
  key: string;
  fromTier: 1 | 2 | 3;
  toTier: 1 | 2 | 3;
  pct: number; // 0..1
  from: number;
  rampMonths: number;
  destination: string;
  origin: string;
}

export type ProgramKind = 'office' | 'pursuits';

export interface SimProgram {
  kind: ProgramKind;
  from: number;
  origin: string;
}

export interface SimState {
  people: Map<string, SimPerson>;
  services: SimService[];
  overrides: SimOverride[];
  tierShifts: SimTierShift[];
  programs: SimProgram[];
}

export interface ApplyContext {
  ws: Workspace;
  month: number;
  change: Change;
  /** Assumption value by ID or binding key under the active case. */
  A: (key: string) => number;
  warn: (msg: string) => void;
  horizon: number;
}

export type FieldKind =
  | 'number'
  | 'percent'
  | 'money'
  | 'text'
  | 'select'
  | 'person'
  | 'roleFamily'
  | 'practices'
  | 'territory'
  | 'assumption'
  | 'service'
  | 'boolean'
  | 'tier';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  help?: string;
  optional?: boolean;
}

/** A change type is a small typed plugin. Modules can register more. */
export interface ChangeType<P = Record<string, unknown>> {
  type: string;
  label: string;
  /** Short label for timeline chips. */
  short: string;
  fields: FieldSpec[];
  defaults(ws: Workspace): P;
  describe(p: P, ws: Workspace): string;
  apply(state: SimState, p: P, ctx: ApplyContext): void;
  validate?(p: P, ws: Workspace): string[];
}

export interface MonthRow {
  month: number;
  headcount: number;
  headcountByRole: Record<string, number>;
  headcountByTeam: Record<string, number>;
  headcountByPractice: Record<string, number>;
  openReqs: number;
  openReqsByRole: Record<string, number>;
  peopleCost: number;
  peopleCostByRole: Record<string, number>;
  servicesCost: number;
  servicesCostByCategory: Record<string, number>;
  totalCost: number;
  sellersRoster: number;
  sellers: number;
  specialists: number;
  architects: number;
  sellersPerSpecialist: number;
  sellersPerArchitect: number;
  specialistsPerPractice: Record<string, number>;
  specialistsNeededStrain: number;
  specialistsNeededReference: number;
  hoursFreed: number;
  fteFreed: number;
  capacityByDestination: Record<string, number>;
  effSpecialists: number;
  gpPerSpecialistMonthly: number;
  upliftPct: number;
  driverFactor: number;
  /** Specialist effectiveness from the office: (1 + office lift once past the delay) x (1 + campaign lift) ^ full years. */
  effectiveness: number;
  officeLift: number;
  campaignFactor: number;
  /** Specialist GP uplift, including effectiveness. */
  gpUplift: number;
  /** The part of gpUplift that comes from office effectiveness. */
  officeGP: number;
  /** GP from large pursuits: deals that would otherwise be lost, plus growth on won deals. */
  pursuitsGP: number;
  /** Share of office and pursuits-team cost spent on large pursuits (an allocation, already inside total cost). */
  pursuitsCost: number;
  /** Expected extra GP per $1 of large-deal GP this month: deals/12 x (focused win rate x (1 + growth) - base win rate). */
  pursuitsDealFactor: number;
  cumPursuitsGP: number;
  cumPursuitsCost: number;
  /** gpUplift + pursuitsGP. Incremental GP compares this with the baseline. */
  gpImpact: number;
  /** Plan company GP this month (this year's plan, grown by later-year growth). */
  companyGPPlan: number;
  /** Company GP with this scenario: plan + incremental GP. */
  companyGP: number;
  /** Growth factor applied to GP for this model year. */
  gpGrowthFactor: number;
  /** Filled when compared with the baseline run. */
  incCost: number;
  incGP: number;
  cumIncCost: number;
  cumIncGP: number;
  cumNet: number;
  /** Override values in force this month, by assumption id. */
  activeOverrides: Record<string, number>;
}

export interface GateOutcome {
  gateKey: string;
  gateName: string;
  scenarioId: string;
  month: number;
  pass: boolean;
  reason: string;
  final?: 'passed' | 'dropped';
}

export interface ChangeOutcome {
  changeId: string;
  origin: string;
  type: string;
  label: string;
  plannedMonth: number;
  actualMonth: number | null;
  status: 'applied' | 'held' | 'dropped' | 'beyond horizon' | 'disabled' | 'error';
  gateKey?: string;
  message?: string;
}

export interface TraceInput {
  label: string;
  value: number;
  unit?: string;
  assumptionId?: string;
  status?: AssumptionStatus;
  source?: string;
  asOf?: string;
  used?: string;
  formula?: string;
  conflicts?: string[];
}

export interface Trace {
  key: string;
  label: string;
  value: number;
  unit: string;
  formula: string;
  inputs: TraceInput[];
  conflicts: string[];
  notes?: string[];
}

export interface ScenarioSummary {
  viewMonths: number;
  cost2y: number;
  cost3y: number;
  inc2y: number;
  inc3y: number;
  incCostByYear: number[];
  costByYear: number[];
  gpByYear: number[];
  incGP2y: number;
  incGP3y: number;
  officeGP2y: number;
  pursuitsGP2y: number;
  pursuitsCost2y: number;
  /** First month cumulative pursuits GP covers the time spent on pursuits and stays ahead. Null without a pursuits program or no payback in the horizon. */
  pursuitsPaybackMonth: number | null;
  /** GP per large deal won at which 24 months of pursuits GP equals 24 months of time spent. */
  pursuitsBreakEvenDealGP: number;
  /** Year 1 (months 0 to 11). */
  companyGP1y: number;
  specialtyGP1y: number;
  specialtyShare1y: number;
  paybackMonth: number | null;
  roiView: number;
  breakEvenGP: number;
  breakEvenTouchedGP: number;
  coverageAtView: number;
  architectCoverageAtView: number;
  specialistsAtView: number;
  headcountAtView: number;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  caseKey: CasePick;
  horizon: number;
  rows: MonthRow[];
  summary: ScenarioSummary;
  gates: GateOutcome[];
  changes: ChangeOutcome[];
  /** Assumption IDs read by this run. */
  assumptionIds: string[];
  /** Conflict assumption IDs that feed any output. */
  conflicts: string[];
  warnings: string[];
  resolution: Resolution;
  /** Baseline result used for incremental numbers (absent on the baseline itself). */
  baseline?: ScenarioResult;
  people: SimPerson[];
}

export interface RunOptions {
  caseKey?: CasePick;
  forced?: Record<string, BoundPick>;
  horizon?: number;
  registry?: Map<string, ChangeType<any>>;
  /** Pre-computed baseline to reuse (for compare and sensitivity). */
  baseline?: ScenarioResult;
}

export type { Gate };
