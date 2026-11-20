// Workspace migrations. Each step takes a document at version N and returns N + 1.
// Never edit a released step; add a new one and bump SCHEMA_VERSION.
import { SCHEMA_VERSION, type Workspace } from './types';

type Doc = Record<string, any>;

const STEPS: Record<number, (d: Doc) => Doc> = {
  // v0: early prototype documents without a version, with `register` instead of
  // `assumptions` and without settings.bindings.
  0: (d) => {
    const out: Doc = { ...d };
    if (!out.assumptions && Array.isArray(out.register)) out.assumptions = out.register;
    delete out.register;
    out.schemaVersion = 1;
    return out;
  },
};

export class MigrationError extends Error {}

/** Default shape for anything a document may be missing. */
export function emptyWorkspace(now = new Date().toISOString()): Workspace {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `ws-${now.replace(/\D/g, '').slice(0, 14)}`,
    name: 'Untitled workspace',
    createdAt: now,
    updatedAt: now,
    settings: {
      displayName: 'Curiosity and Technology Office',
      caseKey: 'conservative',
      horizonMonths: 36,
      viewMonths: 24,
      approvalMonth: '2027-01',
      gateRetryMonths: 6,
      bindings: {},
      coverageGroups: { sellers: ['Core Seller'], specialists: ['Specialist'], architects: ['Solutions Architect'] },
      headcountAnchors: { sellers: 'sellers_baseline' },
    },
    assumptions: [],
    entities: { people: [], territories: [], practices: [], accounts: [], revenueFacts: [], opportunities: [], effortLogs: [], externalServices: [], initiatives: [], kpis: [], vendors: [] },
    scenarios: [{ id: 'baseline', name: 'Baseline', description: 'Current data and assumptions.', changes: [], gates: [], locked: true }],
    baselineScenarioId: 'baseline',
    datasets: [],
    mappingTemplates: [],
    modules: {},
    moduleVersions: {},
    snapshots: [],
    changeLog: [],
  };
}

export interface ModuleMigration {
  version: number;
  migrate: (fromVersion: number, data: unknown) => unknown;
}

export function migrateWorkspace(input: unknown, moduleMigrations: Record<string, ModuleMigration> = {}): Workspace {
  if (!input || typeof input !== 'object') throw new MigrationError('Not a workspace file');
  let d: Doc = structuredClone(input as Doc);
  let v: number = typeof d.schemaVersion === 'number' ? d.schemaVersion : 0;
  if (v > SCHEMA_VERSION) throw new MigrationError(`This workspace was saved by a newer version (schema ${v}). This app reads up to schema ${SCHEMA_VERSION}.`);
  while (v < SCHEMA_VERSION) {
    const step = STEPS[v];
    if (!step) throw new MigrationError(`No migration from schema ${v}`);
    d = step(d);
    v = d.schemaVersion;
  }
  // Fill anything missing so older or hand-edited files load.
  const base = emptyWorkspace(d.createdAt);
  const ws: Workspace = {
    ...base,
    ...d,
    settings: { ...base.settings, ...(d.settings ?? {}), coverageGroups: { ...base.settings.coverageGroups, ...(d.settings?.coverageGroups ?? {}) } },
    entities: { ...base.entities, ...(d.entities ?? {}) },
    scenarios: Array.isArray(d.scenarios) && d.scenarios.length ? d.scenarios : base.scenarios,
  } as Workspace;
  for (const s of ws.scenarios) {
    s.changes ??= [];
    s.gates ??= [];
  }
  ws.moduleVersions ??= {};
  ws.modules ??= {};
  for (const [id, mm] of Object.entries(moduleMigrations)) {
    const from = ws.moduleVersions[id] ?? 0;
    if (from < mm.version) {
      ws.modules[id] = mm.migrate(from, ws.modules[id]);
      ws.moduleVersions[id] = mm.version;
    }
  }
  return ws;
}
