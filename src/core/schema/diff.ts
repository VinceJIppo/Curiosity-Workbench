// Diff between two workspace snapshots, by keyed collection.
import type { WorkspaceContent } from './types';

export interface DiffEntry {
  area: string;
  key: string;
  kind: 'added' | 'removed' | 'changed';
  label: string;
  fields?: { field: string; before: unknown; after: unknown }[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diffKeyed<T extends Record<string, any>>(area: string, a: T[], b: T[], key: (x: T) => string, label: (x: T) => string, ignore: string[] = []): DiffEntry[] {
  const out: DiffEntry[] = [];
  const am = new Map(a.map((x) => [key(x), x]));
  const bm = new Map(b.map((x) => [key(x), x]));
  for (const [k, x] of am) {
    const y = bm.get(k);
    if (!y) {
      out.push({ area, key: k, kind: 'removed', label: label(x) });
      continue;
    }
    if (same(x, y)) continue;
    const fields = [...new Set([...Object.keys(x), ...Object.keys(y)])]
      .filter((f) => !ignore.includes(f) && !same(x[f], y[f]))
      .map((f) => ({ field: f, before: x[f], after: y[f] }));
    if (fields.length) out.push({ area, key: k, kind: 'changed', label: label(y), fields });
  }
  for (const [k, y] of bm) if (!am.has(k)) out.push({ area, key: k, kind: 'added', label: label(y) });
  return out;
}

export function diffContent(a: WorkspaceContent, b: WorkspaceContent): DiffEntry[] {
  const out: DiffEntry[] = [];
  out.push(...diffKeyed('Assumptions', a.assumptions, b.assumptions, (x) => x.id, (x) => `${x.id} ${x.label}`));
  const collections = new Set([...Object.keys(a.entities), ...Object.keys(b.entities)]);
  for (const c of collections) {
    const ax = (a.entities as Record<string, any[]>)[c] ?? [];
    const bx = (b.entities as Record<string, any[]>)[c] ?? [];
    out.push(...diffKeyed(`Data: ${c}`, ax, bx, (x) => String(x.id), (x) => String(x.name ?? x.label ?? x.id)));
  }
  out.push(...diffKeyed('Scenarios', a.scenarios, b.scenarios, (x) => x.id, (x) => x.name, ['changes', 'gates']));
  for (const sb of b.scenarios) {
    const sa = a.scenarios.find((s) => s.id === sb.id);
    if (!sa) continue;
    out.push(...diffKeyed(`Scenario ${sb.name}: changes`, sa.changes, sb.changes, (x) => x.id, (x) => `${x.type} at M${x.month}`));
    out.push(...diffKeyed(`Scenario ${sb.name}: gates`, sa.gates, sb.gates, (x) => x.id, (x) => x.name));
  }
  const sf = Object.keys({ ...a.settings, ...b.settings }).filter((k) => !same((a.settings as any)[k], (b.settings as any)[k]));
  if (sf.length) out.push({ area: 'Settings', key: 'settings', kind: 'changed', label: 'Settings', fields: sf.map((f) => ({ field: f, before: (a.settings as any)[f], after: (b.settings as any)[f] })) });
  return out;
}
