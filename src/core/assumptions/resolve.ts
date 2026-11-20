import type { Assumption, AssumptionStatus, CaseKey } from '../schema/types';
import { compile, evaluate, identifiers, ExprError } from '../expr/expr';

export type BoundPick = 'low' | 'base' | 'high';
export type CasePick = CaseKey | BoundPick;

export interface ResolvedAssumption {
  id: string;
  label: string;
  unit: string;
  value: number;
  status: AssumptionStatus;
  source: string;
  asOf: string;
  /** Which input value was used. */
  used: BoundPick | 'formula' | 'override';
  formula?: string;
  /** Direct input assumption IDs (formula rows only). */
  inputs: string[];
  /** Every Conflict row this value depends on, including itself. */
  conflicts: string[];
  /** Every assumption this value depends on, transitively, including itself. */
  deps: string[];
  error?: string;
}

export interface Resolution {
  byId: Map<string, ResolvedAssumption>;
  order: string[];
  cycles: string[][];
  /** Value by assumption ID or binding key. NaN when missing. */
  get(idOrKey: string): number;
  /** Resolve a binding key or ID to an assumption ID. */
  idFor(idOrKey: string): string | undefined;
  find(idOrKey: string): ResolvedAssumption | undefined;
}

export interface ResolveOptions {
  caseKey?: CasePick;
  overrides?: Record<string, number>;
  /** Per-assumption bound, used by sensitivity. */
  forced?: Record<string, BoundPick>;
  bindings?: Record<string, string>;
}

export function defaultConservativeBound(a: Pick<Assumption, 'unit' | 'conservativeBound'>): 'low' | 'high' {
  if (a.conservativeBound) return a.conservativeBound;
  const u = (a.unit || '').toLowerCase();
  return u.includes('$') || u.includes('usd') || u.includes('cost') ? 'high' : 'low';
}

/** Which bound a case maps to for this assumption. */
export function boundFor(a: Assumption, pick: CasePick): BoundPick {
  if (pick === 'base' || pick === 'low' || pick === 'high') return pick;
  const cons = defaultConservativeBound(a);
  if (pick === 'conservative') return cons;
  return cons === 'high' ? 'low' : 'high';
}

export function valueFor(a: Assumption, bound: BoundPick): number {
  const base = a.value ?? NaN;
  if (bound === 'low') return a.low ?? base;
  if (bound === 'high') return a.high ?? base;
  return base;
}

export function formulaInputs(formula: string): string[] {
  try {
    return [...identifiers(compile(formula))];
  } catch {
    return [];
  }
}

export function resolveAssumptions(list: Assumption[], opts: ResolveOptions = {}): Resolution {
  const caseKey = opts.caseKey ?? 'base';
  const overrides = opts.overrides ?? {};
  const forced = opts.forced ?? {};
  const bindings = opts.bindings ?? {};
  const byIdRaw = new Map(list.map((a) => [a.id, a]));

  const idFor = (k: string): string | undefined => (byIdRaw.has(k) ? k : bindings[k] && byIdRaw.has(bindings[k]) ? bindings[k] : undefined);

  // Graph: id -> input ids (only for formula rows not overridden)
  const inputsOf = new Map<string, string[]>();
  const parseErr = new Map<string, string>();
  for (const a of list) {
    if (a.formula && a.formula.trim() && !(a.id in overrides)) {
      try {
        const names = [...identifiers(compile(a.formula))];
        const ids: string[] = [];
        for (const n of names) {
          const id = idFor(n);
          if (id) ids.push(id);
          else parseErr.set(a.id, `Unknown input "${n}"`);
        }
        inputsOf.set(a.id, ids);
      } catch (e) {
        parseErr.set(a.id, (e as Error).message);
        inputsOf.set(a.id, []);
      }
    } else inputsOf.set(a.id, []);
  }

  // Topological order with cycle detection (iterative DFS, three colors).
  const order: string[] = [];
  const color = new Map<string, 0 | 1 | 2>();
  const cycles: string[][] = [];
  const inCycle = new Set<string>();
  const visit = (start: string) => {
    const stack: { id: string; i: number }[] = [{ id: start, i: 0 }];
    const path: string[] = [start];
    color.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const ins = inputsOf.get(top.id) ?? [];
      if (top.i < ins.length) {
        const next = ins[top.i++];
        const c = color.get(next) ?? 0;
        if (c === 0) {
          color.set(next, 1);
          stack.push({ id: next, i: 0 });
          path.push(next);
        } else if (c === 1) {
          const cyc = path.slice(path.indexOf(next));
          cycles.push(cyc);
          cyc.forEach((x) => inCycle.add(x));
        }
      } else {
        color.set(top.id, 2);
        order.push(top.id);
        stack.pop();
        path.pop();
      }
    }
  };
  for (const a of list) if (!color.get(a.id)) visit(a.id);

  const byId = new Map<string, ResolvedAssumption>();
  for (const id of order) {
    const a = byIdRaw.get(id)!;
    const base: Omit<ResolvedAssumption, 'value' | 'used' | 'inputs' | 'conflicts' | 'deps'> = {
      id,
      label: a.label,
      unit: a.unit,
      status: a.status,
      source: a.source,
      asOf: a.asOf,
      formula: a.formula || undefined,
    };
    const selfConflict = a.status === 'Conflict' ? [id] : [];
    if (id in overrides) {
      byId.set(id, { ...base, value: overrides[id], used: 'override', inputs: [], conflicts: selfConflict, deps: [id] });
      continue;
    }
    if (a.formula && a.formula.trim()) {
      const ins = inputsOf.get(id) ?? [];
      const conflicts = new Set(selfConflict);
      const deps = new Set([id]);
      ins.forEach((i) => {
        byId.get(i)?.conflicts.forEach((c) => conflicts.add(c));
        byId.get(i)?.deps.forEach((d) => deps.add(d));
      });
      let value = NaN;
      let error = parseErr.get(id);
      if (inCycle.has(id)) error = `Circular reference: ${cycles.find((c) => c.includes(id))?.join(' > ')}`;
      if (!error) {
        try {
          value = evaluate(compile(a.formula), (n) => {
            const rid = idFor(n);
            if (!rid) throw new ExprError(`Unknown input "${n}"`);
            return byId.get(rid)?.value ?? NaN;
          });
        } catch (e) {
          error = (e as Error).message;
        }
      }
      byId.set(id, { ...base, value, used: 'formula', inputs: ins, conflicts: [...conflicts], deps: [...deps], error });
      continue;
    }
    const bound = forced[id] ?? boundFor(a, caseKey);
    byId.set(id, {
      ...base,
      value: valueFor(a, bound),
      used: bound,
      inputs: [],
      conflicts: selfConflict,
      deps: [id],
      error: a.value == null ? 'No value' : undefined,
    });
  }

  return {
    byId,
    order,
    cycles,
    idFor,
    find: (k) => {
      const id = idFor(k);
      return id ? byId.get(id) : undefined;
    },
    get: (k) => {
      const id = idFor(k);
      return id ? (byId.get(id)?.value ?? NaN) : NaN;
    },
  };
}

export function statusCounts(list: Assumption[]): Record<AssumptionStatus, number> {
  const out: Record<AssumptionStatus, number> = { Open: 0, Assumed: 0, Stated: 0, Measured: 0, Conflict: 0 };
  for (const a of list) out[a.status] = (out[a.status] ?? 0) + 1;
  return out;
}
