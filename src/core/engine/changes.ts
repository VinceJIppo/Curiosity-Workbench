// Built-in change types. Each is a small typed plugin: fields drive the
// generic form, apply() mutates the simulation state at the change month.
import type { ChangeType, SimPerson, SimState } from './types';
import type { Person, RoleFamily, Workspace } from '../schema/types';
import { ROLE_FAMILIES } from '../schema/types';
import { DRIVER_KEYS } from './bindings';

const personName = (ws: Workspace, id: unknown) => ws.entities.people.find((p) => p.id === id)?.name ?? String(id ?? '?');
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const optNum = (v: unknown): number | undefined => (v === '' || v == null ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : []);

function lag(p: { lagMonths?: unknown }, ctx: { A: (k: string) => number }): number {
  const own = optNum(p.lagMonths);
  if (own != null) return Math.max(0, Math.round(own));
  const a = ctx.A('hire_lag_months');
  return Number.isFinite(a) ? Math.max(0, Math.round(a)) : 0;
}

function getPerson(state: SimState, id: unknown, warn: (m: string) => void): SimPerson | undefined {
  const p = state.people.get(String(id));
  if (!p) warn(`Person "${id}" not found`);
  return p;
}

export interface HireParams {
  name?: string;
  title: string;
  roleFamily: RoleFamily;
  count: number;
  practices?: string[] | string;
  territory?: string;
  team?: string;
  managerId?: string;
  base: number;
  variableTarget: number;
  burdenPct?: number | '';
  fte: number;
  lagMonths?: number | '';
  /** Binding key or assumption ID for cash comp. Overrides base and variable when set. */
  compAssumption?: string;
}

const hire: ChangeType<HireParams> = {
  type: 'hire',
  label: 'Add role or hire',
  short: 'Hire',
  fields: [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'roleFamily', label: 'Role family', kind: 'roleFamily' },
    { key: 'count', label: 'Count', kind: 'number' },
    { key: 'name', label: 'Name (optional)', kind: 'text', optional: true },
    { key: 'practices', label: 'Practices', kind: 'practices', optional: true },
    { key: 'territory', label: 'Territory', kind: 'territory', optional: true },
    { key: 'team', label: 'Team', kind: 'text', optional: true },
    { key: 'managerId', label: 'Manager', kind: 'person', optional: true },
    { key: 'base', label: 'Base salary', kind: 'money' },
    { key: 'variableTarget', label: 'Variable target', kind: 'money' },
    { key: 'compAssumption', label: 'Comp from assumption (replaces base and variable)', kind: 'assumption', optional: true },
    { key: 'burdenPct', label: 'Burden (blank uses assumption)', kind: 'percent', optional: true },
    { key: 'fte', label: 'FTE', kind: 'number' },
    { key: 'lagMonths', label: 'Months from release to start (blank uses hiring lag)', kind: 'number', optional: true },
  ],
  defaults: () => ({ title: 'Specialist', roleFamily: 'Specialist', count: 1, base: 0, variableTarget: 0, fte: 1, practices: [] }),
  describe: (p) => `${num(p.count, 1)} x ${p.title || p.roleFamily}${p.name ? ` (${p.name})` : ''}`,
  validate: (p) => {
    const e: string[] = [];
    if (!ROLE_FAMILIES.includes(p.roleFamily)) e.push(`Unknown role family "${p.roleFamily}"`);
    if (num(p.count, 1) < 1) e.push('Count must be at least 1');
    return e;
  },
  apply(state, p, ctx) {
    const n = Math.max(1, Math.round(num(p.count, 1)));
    const start = ctx.month + lag(p, ctx);
    let base = num(p.base);
    let variableTarget = num(p.variableTarget);
    if (p.compAssumption) {
      const c = ctx.A(p.compAssumption);
      if (Number.isFinite(c)) {
        base = c;
        variableTarget = 0;
      } else ctx.warn(`Comp assumption "${p.compAssumption}" has no value`);
    }
    for (let i = 0; i < n; i++) {
      const id = `${ctx.change.id}#${i + 1}`;
      state.people.set(id, {
        id,
        name: p.name ? (n > 1 ? `${p.name} ${i + 1}` : p.name) : `New ${p.title || p.roleFamily}${n > 1 ? ` ${i + 1}` : ''}`,
        title: p.title || p.roleFamily,
        roleFamily: p.roleFamily,
        practices: list(p.practices),
        territory: p.territory || undefined,
        team: p.team || undefined,
        managerId: p.managerId || undefined,
        base,
        variableTarget,
        burdenPct: optNum(p.burdenPct) ?? null,
        fte: num(p.fte, 1) || 1,
        status: 'planned',
        startMonth: start,
        endMonth: null,
        reqOpenMonth: ctx.month,
        origin: ctx.change.id,
      });
    }
  },
};

export interface DepartParams {
  personId: string;
}
const depart: ChangeType<DepartParams> = {
  type: 'depart',
  label: 'Depart',
  short: 'Depart',
  fields: [{ key: 'personId', label: 'Person', kind: 'person' }],
  defaults: () => ({ personId: '' }),
  describe: (p, ws) => `${personName(ws, p.personId)} departs`,
  apply(state, p, ctx) {
    const person = getPerson(state, p.personId, ctx.warn);
    if (person) person.endMonth = person.endMonth == null ? ctx.month : Math.min(person.endMonth, ctx.month);
  },
};

export interface MoveParams {
  personId: string;
  roleFamily?: RoleFamily | '';
  title?: string;
  team?: string;
  territory?: string;
  managerId?: string;
  practices?: string[] | string;
  base?: number | '';
  variableTarget?: number | '';
}
const move: ChangeType<MoveParams> = {
  type: 'move',
  label: 'Move person (role, team, manager, territory)',
  short: 'Move',
  fields: [
    { key: 'personId', label: 'Person', kind: 'person' },
    { key: 'roleFamily', label: 'New role family', kind: 'roleFamily', optional: true },
    { key: 'title', label: 'New title', kind: 'text', optional: true },
    { key: 'team', label: 'New team', kind: 'text', optional: true },
    { key: 'territory', label: 'New territory', kind: 'territory', optional: true },
    { key: 'managerId', label: 'New manager', kind: 'person', optional: true },
    { key: 'practices', label: 'New practices', kind: 'practices', optional: true },
    { key: 'base', label: 'New base (blank keeps)', kind: 'money', optional: true },
    { key: 'variableTarget', label: 'New variable (blank keeps)', kind: 'money', optional: true },
  ],
  defaults: () => ({ personId: '' }),
  describe: (p, ws) => {
    const what = p.title || p.roleFamily || p.team || (p.practices && list(p.practices).length ? `practices ${list(p.practices).join(', ')}` : '') || p.territory || 'new seat';
    return `${personName(ws, p.personId)} to ${what}`;
  },
  apply(state, p, ctx) {
    const person = getPerson(state, p.personId, ctx.warn);
    if (!person) return;
    if (!person.seatBefore) {
      person.seatBefore = {
        roleFamily: person.roleFamily,
        title: person.title,
        territory: person.territory,
        team: person.team,
        practices: [...person.practices],
        base: person.base,
        variableTarget: person.variableTarget,
        burdenPct: person.burdenPct,
        managerId: person.managerId,
      };
    }
    if (p.roleFamily) person.roleFamily = p.roleFamily;
    if (p.title) person.title = p.title;
    if (p.team) person.team = p.team;
    if (p.territory) person.territory = p.territory;
    if (p.managerId) person.managerId = p.managerId;
    const pr = list(p.practices);
    if (p.practices !== undefined && p.practices !== '' && pr.length) person.practices = pr;
    const b = optNum(p.base);
    if (b != null) person.base = b;
    const v = optNum(p.variableTarget);
    if (v != null) person.variableTarget = v;
  },
};

export interface BackfillParams {
  personId: string;
  name?: string;
  lagMonths?: number | '';
}
const backfill: ChangeType<BackfillParams> = {
  type: 'backfill',
  label: 'Backfill a seat',
  short: 'Backfill',
  fields: [
    { key: 'personId', label: 'Seat of', kind: 'person' },
    { key: 'name', label: 'Backfill name (optional)', kind: 'text', optional: true },
    { key: 'lagMonths', label: 'Months to start (blank uses hiring lag)', kind: 'number', optional: true },
  ],
  defaults: () => ({ personId: '' }),
  describe: (p, ws) => `Backfill ${personName(ws, p.personId)}'s seat${p.name ? ` with ${p.name}` : ''}`,
  apply(state, p, ctx) {
    const src = getPerson(state, p.personId, ctx.warn);
    if (!src) return;
    const seat = src.seatBefore ?? src;
    const id = `${ctx.change.id}#1`;
    const np: SimPerson = {
      id,
      name: p.name || `Backfill for ${src.name}`,
      title: seat.title,
      roleFamily: seat.roleFamily,
      territory: seat.territory,
      team: seat.team,
      practices: [...(seat.practices ?? [])],
      managerId: seat.managerId,
      base: seat.base,
      variableTarget: seat.variableTarget,
      burdenPct: seat.burdenPct ?? null,
      fte: src.fte || 1,
      status: 'backfill',
      startMonth: ctx.month + lag(p, ctx),
      endMonth: null,
      reqOpenMonth: ctx.month,
      origin: ctx.change.id,
    };
    state.people.set(id, np);
  },
};

export interface CompParams {
  personId?: string;
  roleFamily?: RoleFamily | '';
  base?: number | '';
  variableTarget?: number | '';
  burdenPct?: number | '';
  pctChange?: number | '';
}
const comp: ChangeType<CompParams> = {
  type: 'comp',
  label: 'Change comp or burden',
  short: 'Comp',
  fields: [
    { key: 'personId', label: 'Person (or leave blank and pick a role family)', kind: 'person', optional: true },
    { key: 'roleFamily', label: 'Role family', kind: 'roleFamily', optional: true },
    { key: 'base', label: 'New base', kind: 'money', optional: true },
    { key: 'variableTarget', label: 'New variable', kind: 'money', optional: true },
    { key: 'burdenPct', label: 'New burden', kind: 'percent', optional: true },
    { key: 'pctChange', label: 'Change base and variable by %', kind: 'percent', optional: true },
  ],
  defaults: () => ({}),
  describe: (p, ws) => `Comp change for ${p.personId ? personName(ws, p.personId) : p.roleFamily || 'nobody'}`,
  apply(state, p, ctx) {
    const targets: SimPerson[] = p.personId
      ? [getPerson(state, p.personId, ctx.warn)].filter((x): x is SimPerson => !!x)
      : [...state.people.values()].filter((x) => p.roleFamily && x.roleFamily === p.roleFamily);
    for (const t of targets) {
      const b = optNum(p.base);
      const v = optNum(p.variableTarget);
      const bp = optNum(p.burdenPct);
      const pc = optNum(p.pctChange);
      if (b != null) t.base = b;
      if (v != null) t.variableTarget = v;
      if (bp != null) t.burdenPct = bp;
      if (pc != null) {
        t.base *= 1 + pc;
        t.variableTarget *= 1 + pc;
      }
    }
  },
};

export interface ServiceStartParams {
  serviceId: string;
  termMonths?: number | '';
}
const serviceStart: ChangeType<ServiceStartParams> = {
  type: 'serviceStart',
  label: 'Start an external service',
  short: 'Buy',
  fields: [
    { key: 'serviceId', label: 'Service', kind: 'service' },
    { key: 'termMonths', label: 'Term in months (blank uses the service term)', kind: 'number', optional: true },
  ],
  defaults: (ws) => ({ serviceId: ws.entities.externalServices[0]?.id ?? '' }),
  describe: (p, ws) => {
    const s = ws.entities.externalServices.find((x) => x.id === p.serviceId);
    return `Start ${s ? s.name : p.serviceId}`;
  },
  apply(state, p, ctx) {
    const svc = ctx.ws.entities.externalServices.find((s) => s.id === p.serviceId);
    if (!svc) return ctx.warn(`Service "${p.serviceId}" not found`);
    const term = optNum(p.termMonths) ?? svc.termMonths ?? null;
    state.services.push({ key: ctx.change.id, service: svc, start: ctx.month, end: term != null ? ctx.month + term : null, origin: ctx.change.id });
  },
};

export interface ServiceEndParams {
  serviceId: string;
}
const serviceEnd: ChangeType<ServiceEndParams> = {
  type: 'serviceEnd',
  label: 'End an external service',
  short: 'End svc',
  fields: [{ key: 'serviceId', label: 'Service', kind: 'service' }],
  defaults: (ws) => ({ serviceId: ws.entities.externalServices[0]?.id ?? '' }),
  describe: (p, ws) => `End ${ws.entities.externalServices.find((x) => x.id === p.serviceId)?.name ?? p.serviceId}`,
  apply(state, p, ctx) {
    let hit = false;
    for (const s of state.services) {
      if (s.service.id === p.serviceId && (s.end == null || s.end > ctx.month)) {
        s.end = ctx.month;
        hit = true;
      }
    }
    if (!hit) ctx.warn(`Service "${p.serviceId}" was not running`);
  },
};

export interface TierShiftParams {
  fromTier: number;
  toTier: number;
  pct: number;
  rampMonths: number;
  destination: string;
}
const tierShift: ChangeType<TierShiftParams> = {
  type: 'tierShift',
  label: 'Shift work between tiers',
  short: 'Tier shift',
  fields: [
    { key: 'fromTier', label: 'From tier', kind: 'tier' },
    { key: 'toTier', label: 'To tier', kind: 'tier' },
    { key: 'pct', label: 'Share of requests that move', kind: 'percent' },
    { key: 'rampMonths', label: 'Ramp (months)', kind: 'number' },
    { key: 'destination', label: 'Where freed capacity goes', kind: 'text' },
  ],
  defaults: () => ({ fromTier: 2, toTier: 1, pct: 0.2, rampMonths: 6, destination: 'Large pursuits' }),
  describe: (p) => `${Math.round(num(p.pct) * 100)}% Tier ${p.fromTier} to Tier ${p.toTier}`,
  apply(state, p, ctx) {
    state.tierShifts.push({
      key: ctx.change.id,
      fromTier: Math.min(3, Math.max(1, Math.round(num(p.fromTier, 2)))) as 1 | 2 | 3,
      toTier: Math.min(3, Math.max(1, Math.round(num(p.toTier, 1)))) as 1 | 2 | 3,
      pct: num(p.pct),
      from: ctx.month,
      rampMonths: Math.max(0, num(p.rampMonths)),
      destination: p.destination || 'Unassigned',
      origin: ctx.change.id,
    });
  },
};

export interface DriverParams {
  driver: string;
  mode: 'set' | 'add' | 'multiply';
  value: number;
  rampMonths: number;
}
const driver: ChangeType<DriverParams> = {
  type: 'driver',
  label: 'Change a driver',
  short: 'Driver',
  fields: [
    { key: 'driver', label: 'Driver', kind: 'select', options: [...DRIVER_KEYS] },
    { key: 'mode', label: 'Mode', kind: 'select', options: ['set', 'add', 'multiply'] },
    { key: 'value', label: 'Value', kind: 'number' },
    { key: 'rampMonths', label: 'Ramp (months)', kind: 'number' },
  ],
  defaults: () => ({ driver: 'win_rate', mode: 'add', value: 0.02, rampMonths: 6 }),
  describe: (p) => `${p.driver.replace('_', ' ')} ${p.mode === 'set' ? 'to' : p.mode === 'add' ? '+' : 'x'} ${p.value}`,
  apply(state, p, ctx) {
    state.overrides.push({ id: p.driver, value: num(p.value), from: ctx.month, rampMonths: Math.max(0, num(p.rampMonths)), mode: p.mode || 'set', origin: ctx.change.id });
  },
};

export interface OverrideParams {
  assumptionId: string;
  value?: number | '';
  useAlternate?: number | '';
  untilMonth?: number | '';
}
const overrideAssumption: ChangeType<OverrideParams> = {
  type: 'override',
  label: 'Override an assumption',
  short: 'Override',
  fields: [
    { key: 'assumptionId', label: 'Assumption', kind: 'assumption' },
    { key: 'value', label: 'Value', kind: 'number', optional: true },
    { key: 'useAlternate', label: 'Or use alternate number (1 = first)', kind: 'number', optional: true },
    { key: 'untilMonth', label: 'Until month (blank = end)', kind: 'number', optional: true },
  ],
  defaults: (ws) => ({ assumptionId: ws.assumptions[0]?.id ?? '' }),
  describe: (p, ws) => {
    const a = ws.assumptions.find((x) => x.id === p.assumptionId);
    const alt = optNum(p.useAlternate);
    return `${p.assumptionId} ${a ? a.label : ''} = ${alt != null ? `alternate ${alt}` : p.value}`;
  },
  apply(state, p, ctx) {
    const a = ctx.ws.assumptions.find((x) => x.id === p.assumptionId || ctx.ws.settings.bindings[p.assumptionId] === x.id);
    if (!a) return ctx.warn(`Assumption "${p.assumptionId}" not found`);
    let v = optNum(p.value);
    const alt = optNum(p.useAlternate);
    if (alt != null) v = a.alternates?.[alt - 1]?.value;
    if (v == null) return ctx.warn(`Override of ${a.id} has no value`);
    state.overrides.push({ id: a.id, value: v, from: ctx.month, rampMonths: 0, mode: 'set', origin: ctx.change.id, until: optNum(p.untilMonth) ?? null });
  },
};

export interface PodAssignParams {
  roleFamily: RoleFamily;
  suffix: string;
}
const podAssign: ChangeType<PodAssignParams> = {
  type: 'podAssign',
  label: 'Organize a role family into practice pods',
  short: 'Pods',
  fields: [
    { key: 'roleFamily', label: 'Role family', kind: 'roleFamily' },
    { key: 'suffix', label: 'Team name suffix', kind: 'text' },
  ],
  defaults: () => ({ roleFamily: 'Specialist', suffix: ' pod' }),
  describe: (p) => `${p.roleFamily}s into practice pods`,
  apply(state, p, ctx) {
    const names = new Map(ctx.ws.entities.practices.map((x) => [x.id, x.name]));
    for (const person of state.people.values()) {
      if (person.roleFamily !== p.roleFamily) continue;
      if (person.endMonth != null && person.endMonth <= ctx.month) continue;
      const primary = person.practices[0];
      if (primary) person.team = `${names.get(primary) ?? primary}${p.suffix ?? ' pod'}`;
    }
  },
};

export interface ProgramParams {
  program: 'office' | 'pursuits';
}
const program: ChangeType<ProgramParams> = {
  type: 'program',
  label: 'Launch a program',
  short: 'Program',
  fields: [{ key: 'program', label: 'Program', kind: 'select', options: ['office', 'pursuits'], help: 'office: specialists more effective after a delay, plus campaign lift each year. pursuits: more large deals won and grown. Numbers come from the register.' }],
  defaults: () => ({ program: 'office' }),
  describe: (p) => (p.program === 'pursuits' ? 'Launch large pursuits' : 'Launch strategy office'),
  apply(state, p, ctx) {
    const kind = p.program === 'pursuits' ? 'pursuits' : 'office';
    state.programs.push({ kind, from: ctx.month, origin: ctx.change.id });
  },
};

export const BUILTIN_CHANGE_TYPES: ChangeType<any>[] = [hire, depart, move, backfill, comp, serviceStart, serviceEnd, tierShift, driver, overrideAssumption, podAssign, program];

export function createRegistry(extra: ChangeType<any>[] = []): Map<string, ChangeType<any>> {
  const m = new Map<string, ChangeType<any>>();
  for (const t of [...BUILTIN_CHANGE_TYPES, ...extra]) m.set(t.type, t);
  return m;
}

export const DEFAULT_REGISTRY = createRegistry();

export type { Person };
