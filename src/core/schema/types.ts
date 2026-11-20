// Workspace schema v1. Pure types, no runtime code.
// A workspace is one JSON document and the single source of truth.

export const SCHEMA_VERSION = 1;

export type CaseKey = 'conservative' | 'base' | 'aggressive';

export type AssumptionStatus = 'Open' | 'Assumed' | 'Stated' | 'Measured' | 'Conflict';
export const ASSUMPTION_STATUSES: AssumptionStatus[] = ['Open', 'Assumed', 'Stated', 'Measured', 'Conflict'];

export interface AssumptionAlternate {
  value: number;
  source: string;
  note?: string;
}

export interface Assumption {
  id: string; // R01 style
  label: string;
  value: number | null; // base case
  low?: number | null;
  high?: number | null;
  unit: string;
  status: AssumptionStatus;
  source: string;
  asOf: string;
  usedIn: string;
  notes: string;
  /** Derived assumption: expression over other assumption IDs. */
  formula?: string;
  /** Which bound is the conservative (worse for the proposal) pick. Default: 'high' for $ units, else 'low'. */
  conservativeBound?: 'low' | 'high';
  /** Competing values, for example a Conflict row. */
  alternates?: AssumptionAlternate[];
}

export const ROLE_FAMILIES = [
  'Core Seller',
  'Inside Seller',
  'Regional Director',
  'RVP',
  'Specialist',
  'Solutions Architect',
  'Account Principal Architect',
  'Principal Consultant',
  'Director',
  'Office',
  'Delivery',
  'SalesOps',
  'Other',
] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];

export const PERSON_STATUSES = ['current', 'open req', 'planned', 'backfill', 'departing'] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export interface Person {
  id: string;
  name: string;
  title: string;
  roleFamily: RoleFamily;
  territory?: string;
  team?: string;
  practices: string[];
  managerId?: string;
  location?: string;
  base: number;
  variableTarget: number;
  /** Burden as a fraction (0.25 = 25%). Empty means use the burden assumption. */
  burdenPct?: number | null;
  fte: number;
  status: PersonStatus;
  /** Month index relative to approval (0 = approval month). Negative means already in seat. */
  startMonth?: number | null;
  endMonth?: number | null;
  synthetic?: boolean;
}

export interface Territory {
  id: string;
  name: string;
  rvp?: string;
  regionalDirectors: string[];
}

export const PRACTICE_TYPES = ['practice', 'OEM line', 'pod', 'TSD'] as const;
export interface Practice {
  id: string;
  name: string;
  type: (typeof PRACTICE_TYPES)[number];
}

export interface Account {
  id: string;
  name: string;
  territory?: string;
  owner?: string;
  tier?: 1 | 2 | 3;
  segment?: string;
}

export interface RevenueFact {
  id: string;
  account?: string;
  line: string;
  period: string;
  revenue: number;
  gp: number;
  specialistTouched?: boolean;
  source?: string;
}

export interface Opportunity {
  id: string;
  account?: string;
  line?: string;
  stage?: string;
  amount?: number;
  gp?: number;
  closeDate?: string;
  specialist?: string;
  sa?: string;
}

export const EFFORT_OPP_TYPES = ['VMware', 'Cybersecurity', 'Professional Services', 'Networking', 'Datacenter Colocation', 'Other'] as const;
export interface EffortLog {
  id: string;
  person?: string;
  period?: string;
  account?: string;
  opportunityType: (typeof EFFORT_OPP_TYPES)[number];
  effort: number;
  revenue6mo?: number;
  gp6mo?: number;
  source?: string;
}

export const SERVICE_CATEGORIES = [
  'diagnostic',
  'fractional leader',
  'benchmark subscription',
  'subcontract delivery',
  'outsourced SOC or managed service',
  'recruiting',
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const PRICING_MODELS = ['fixed', 'monthly retainer', 'annual subscription', 'per unit', 'T&M', '% of revenue'] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export interface ExternalService {
  id: string;
  vendor: string;
  name: string;
  category: ServiceCategory;
  pricingModel: PricingModel;
  /** Price per pricing unit: total for fixed, per month for retainer, per year for subscription, per unit, per hour, or fraction of revenue. */
  low: number;
  base: number;
  high: number;
  /** Units or hours per month for per unit and T&M. */
  quantityPerMonth?: number;
  /** Assumption ID or binding key that supplies the price. When set, it wins over low, base and high. */
  priceRef?: string;
  /** Assumption key or ID giving monthly revenue for % of revenue pricing. */
  revenueRef?: string;
  termMonths?: number | null;
  /** Month the service starts when it is part of the baseline. Null means it only starts through a scenario change. */
  startMonth?: number | null;
  source?: string;
  notes?: string;
}

export interface Initiative {
  id: string;
  name: string;
  owner?: string;
  type: 'scorecard' | 'enablement' | 'playbook' | 'lab cycle' | 'pursuit' | 'hiring gate' | 'other';
  status?: string;
  start?: string;
  end?: string;
  scenarioId?: string;
  kpiIds?: string[];
  gate?: string;
}

export interface Kpi {
  id: string;
  name: string;
  definition?: string;
  formula?: string;
  unit?: string;
  target?: number;
  cadence?: string;
  owner?: string;
  direction: 'higher' | 'lower';
}

export interface Vendor {
  id: string;
  name: string;
  kind: 'OEM' | 'distributor' | 'TSD';
  programs?: string;
  partnerTier?: string;
  contacts?: string;
}

/** Built-in entity collections. Modules can register more through the schema registry. */
export interface CoreEntities {
  people: Person[];
  territories: Territory[];
  practices: Practice[];
  accounts: Account[];
  revenueFacts: RevenueFact[];
  opportunities: Opportunity[];
  effortLogs: EffortLog[];
  externalServices: ExternalService[];
  initiatives: Initiative[];
  kpis: Kpi[];
  vendors: Vendor[];
}

export type EntityCollections = CoreEntities & Record<string, unknown[]>;

// ---------- Scenarios ----------

export interface Change {
  id: string;
  type: string; // key into the change type registry
  /** Month the change takes effect (or is released, for hires with a lag). */
  month: number;
  gateId?: string;
  params: Record<string, unknown>;
  note?: string;
  tags?: string[];
  enabled?: boolean;
}

export type GateComparator = '>=' | '<=' | '>' | '<' | '==';

export interface Gate {
  id: string;
  name: string;
  month: number;
  kind: 'manual' | 'kpi';
  /** Manual gates: outcome per evaluation month. Missing entries pass. */
  manualOutcomes?: Record<string, boolean>;
  /** KPI gates: a metric key from the engine (for example sellersPerSpecialist) or an expression. */
  metric?: string;
  comparator?: GateComparator;
  threshold?: number;
  /** Months to wait before rerunning a missed gate. Defaults to the workspace setting. */
  retryMonths?: number;
  /** Maximum reruns before the change is dropped. */
  maxRetries?: number;
}

export interface InheritSegment {
  scenarioId: string;
  fromMonth: number;
  /** Exclusive. Null or missing means to the end of the horizon. */
  toMonth?: number | null;
  /** Only inherit changes carrying one of these tags. Empty means all. */
  tags?: string[];
  /** Changes from the parent scheduled before fromMonth are applied at fromMonth. */
  carryEarlier?: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  inherits?: InheritSegment[];
  changes: Change[];
  gates: Gate[];
  color?: string;
  locked?: boolean;
}

// ---------- Import ----------

export interface Dataset {
  id: string;
  name: string;
  fileName: string;
  sheet?: string;
  importedAt: string;
  entityType: string;
  headers: string[];
  rawRows: Record<string, unknown>[];
  mappingTemplateId?: string;
  rowCount: number;
}

export interface MappingTemplate {
  id: string;
  name: string;
  entityType: string;
  headerSignature: string;
  headers: string[];
  /** canonical field -> source header */
  columnMap: Record<string, string>;
  createdAt: string;
}

// ---------- Workspace ----------

export interface CoverageGroups {
  sellers: string[];
  specialists: string[];
  architects: string[];
}

export interface Settings {
  displayName: string;
  caseKey: CaseKey;
  horizonMonths: number;
  viewMonths: number;
  /** First month label, YYYY-MM. Month 0 is the approval month. */
  approvalMonth: string;
  gateRetryMonths: number;
  /** Semantic key -> assumption ID. Lets an imported register drive the engine without code changes. */
  bindings: Record<string, string>;
  coverageGroups: CoverageGroups;
  /** Semantic key for a headcount anchor -> binding key. Sellers anchor to the register. */
  headcountAnchors: Partial<Record<keyof CoverageGroups, string>>;
}

export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  data: WorkspaceContent;
}

export interface ChangeLogEntry {
  at: string;
  action: string;
  detail?: string;
}

export interface WorkspaceContent {
  settings: Settings;
  assumptions: Assumption[];
  entities: EntityCollections;
  scenarios: Scenario[];
  baselineScenarioId: string;
  datasets: Dataset[];
  mappingTemplates: MappingTemplate[];
  /** Records owned by modules, keyed by module id. */
  modules: Record<string, unknown>;
  moduleVersions: Record<string, number>;
}

export interface Workspace extends WorkspaceContent {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  snapshots: Snapshot[];
  changeLog: ChangeLogEntry[];
}
