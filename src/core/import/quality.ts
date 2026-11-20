// Data quality: row counts, missing fields, broken references and conflicts.
import type { Workspace } from '../schema/types';
import { entitySchemas } from '../schema/registry';
import { resolveAssumptions } from '../assumptions/resolve';

export interface QualityItem {
  severity: 'error' | 'warning' | 'info';
  area: string;
  message: string;
  count?: number;
}

export interface QualityReport {
  counts: { label: string; collection: string; rows: number }[];
  items: QualityItem[];
}

export function dataQuality(ws: Workspace): QualityReport {
  const items: QualityItem[] = [];
  const counts: QualityReport['counts'] = [];
  const ents = ws.entities as Record<string, Record<string, unknown>[]>;
  for (const s of entitySchemas()) {
    const rows: Record<string, unknown>[] = s.collection === 'assumptions' ? (ws.assumptions as unknown as Record<string, unknown>[]) : (ents[s.collection] ?? []);
    counts.push({ label: s.label, collection: s.collection, rows: rows.length });
    for (const f of s.fields) {
      if (!f.required) continue;
      const missing = rows.filter((r) => r[f.key] == null || r[f.key] === '').length;
      if (missing) items.push({ severity: 'error', area: s.label, message: `${missing} rows missing ${f.label}`, count: missing });
    }
    const ids = rows.map((r) => String(r[s.idField] ?? ''));
    const dup = ids.length - new Set(ids).size;
    if (dup) items.push({ severity: 'error', area: s.label, message: `${dup} duplicate IDs`, count: dup });
  }
  const people = ws.entities.people;
  const pid = new Set(people.map((p) => p.id));
  const badMgr = people.filter((p) => p.managerId && !pid.has(p.managerId)).length;
  if (badMgr) items.push({ severity: 'warning', area: 'People', message: `${badMgr} people point to a manager who is not on the roster`, count: badMgr });
  const tids = new Set(ws.entities.territories.flatMap((t) => [t.id, t.name]));
  const badTerr = people.filter((p) => p.territory && !tids.has(p.territory)).length;
  if (badTerr) items.push({ severity: 'warning', area: 'People', message: `${badTerr} people have a territory that is not in Territories`, count: badTerr });
  const noComp = people.filter((p) => p.status !== 'open req' && !(p.base > 0) && !(p.variableTarget > 0)).length;
  if (noComp) items.push({ severity: 'warning', area: 'People', message: `${noComp} people have no comp (cost will be zero)`, count: noComp });
  const other = people.filter((p) => p.roleFamily === 'Other').length;
  if (other) items.push({ severity: 'info', area: 'People', message: `${other} people are in role family Other`, count: other });

  // Register checks
  const res = resolveAssumptions(ws.assumptions, { caseKey: 'base', bindings: ws.settings.bindings });
  for (const a of ws.assumptions.filter((x) => x.status === 'Conflict')) {
    const alts = a.alternates?.map((x) => `${x.value} (${x.source})`).join(', ');
    items.push({ severity: 'warning', area: 'Assumptions', message: `${a.id} ${a.label} is a Conflict${alts ? `: ${a.value} vs ${alts}` : ''}` });
  }
  for (const c of res.cycles) items.push({ severity: 'error', area: 'Assumptions', message: `Circular formula: ${c.join(' > ')}` });
  for (const r of res.byId.values()) if (r.error && r.error !== 'No value') items.push({ severity: 'error', area: 'Assumptions', message: `${r.id}: ${r.error}` });
  const open = ws.assumptions.filter((a) => a.status === 'Open').length;
  if (open) items.push({ severity: 'info', area: 'Assumptions', message: `${open} assumptions are still Open`, count: open });
  for (const [k, id] of Object.entries(ws.settings.bindings)) if (!ws.assumptions.some((a) => a.id === id)) items.push({ severity: 'error', area: 'Bindings', message: `Binding ${k} points to ${id}, which is not in the register` });

  // Roster vs register seller count
  const sellersKey = ws.settings.headcountAnchors.sellers;
  if (sellersKey) {
    const reg = res.get(sellersKey);
    const roster = people.filter((p) => ws.settings.coverageGroups.sellers.includes(p.roleFamily) && p.status !== 'open req').reduce((s, p) => s + (p.fte ?? 1), 0);
    if (Number.isFinite(reg) && roster && Math.abs(reg - roster) > 0.01) items.push({ severity: 'warning', area: 'Conflicts', message: `Register says ${reg} sellers; roster has ${roster}. Coverage uses the register number.` });
  }
  return { counts, items };
}
