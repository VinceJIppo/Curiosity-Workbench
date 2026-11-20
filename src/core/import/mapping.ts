// Column mapping, coercion, validation and applying an import to a workspace.
import type { Assumption, AssumptionStatus, Dataset, MappingTemplate, Workspace } from '../schema/types';
import { ASSUMPTION_STATUSES } from '../schema/types';
import { getEntitySchema, entitySchemas, type EntitySchema, type FieldDef } from '../schema/registry';

export const normHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9%#$]+/g, ' ')
    .trim();

/** FNV-1a hash of the normalized, sorted headers. Same export, same signature. */
export function headerSignature(headers: string[]): string {
  const s = headers.map(normHeader).sort().join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `sig-${h.toString(16).padStart(8, '0')}-${headers.length}`;
}

export function findTemplate(templates: MappingTemplate[], headers: string[], entityType?: string): MappingTemplate | undefined {
  const sig = headerSignature(headers);
  return templates.find((t) => t.headerSignature === sig && (!entityType || t.entityType === entityType));
}

function aliasScore(f: FieldDef, h: string): number {
  const n = normHeader(h);
  const key = normHeader(f.key.replace(/([A-Z])/g, ' $1'));
  if (n === normHeader(f.label) || n === key) return 3;
  if (f.aliases?.some((a) => normHeader(a) === n)) return 2;
  if (f.aliases?.some((a) => normHeader(a).length > 3 && n.includes(normHeader(a)))) return 1;
  return 0;
}

/** canonical field -> source header. Uses a saved template first, then aliases. */
export function autoMap(schema: EntitySchema, headers: string[], templates: MappingTemplate[] = []): { columnMap: Record<string, string>; template?: MappingTemplate } {
  const t = findTemplate(templates, headers, schema.type);
  if (t) return { columnMap: Object.fromEntries(Object.entries(t.columnMap).filter(([, h]) => headers.includes(h))), template: t };
  const columnMap: Record<string, string> = {};
  const used = new Set<string>();
  const pairs: { f: string; h: string; s: number }[] = [];
  for (const f of schema.fields) for (const h of headers) {
    const s = aliasScore(f, h);
    if (s) pairs.push({ f: f.key, h, s });
  }
  pairs.sort((a, b) => b.s - a.s);
  for (const p of pairs) {
    if (columnMap[p.f] || used.has(p.h)) continue;
    columnMap[p.f] = p.h;
    used.add(p.h);
  }
  return { columnMap };
}

export function suggestEntityType(headers: string[], templates: MappingTemplate[] = []): string | undefined {
  const t = findTemplate(templates, headers);
  if (t) return t.entityType;
  let best: { type: string; score: number } | undefined;
  for (const s of entitySchemas()) {
    const { columnMap } = autoMap(s, headers);
    const req = s.fields.filter((f) => f.required);
    const reqHit = req.filter((f) => columnMap[f.key]).length;
    const score = Object.keys(columnMap).length + reqHit * 2 - (req.length - reqHit) * 3;
    if (!best || score > best.score) best = { type: s.type, score };
  }
  return best && best.score > 0 ? best.type : undefined;
}

export interface Issue {
  row: number; // 1-based data row, 0 for file-level
  field: string;
  kind: 'required' | 'type' | 'duplicate' | 'enum' | 'mapping';
  message: string;
}

const STATUS_SYNONYMS: Record<string, AssumptionStatus> = {
  open: 'Open',
  tbd: 'Open',
  todo: 'Open',
  assumed: 'Assumed',
  assumption: 'Assumed',
  estimate: 'Assumed',
  estimated: 'Assumed',
  stated: 'Stated',
  given: 'Stated',
  measured: 'Measured',
  actual: 'Measured',
  verified: 'Measured',
  conflict: 'Conflict',
  conflicting: 'Conflict',
  disputed: 'Conflict',
};

export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()$,\s]/g, '').replace(/^~|^about/i, '');
  let mult = 1;
  if (/k$/i.test(s)) {
    mult = 1e3;
    s = s.slice(0, -1);
  } else if (/m$/i.test(s)) {
    mult = 1e6;
    s = s.slice(0, -1);
  }
  const pctSign = s.endsWith('%');
  if (pctSign) s = s.slice(0, -1);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const out = pctSign ? (n * mult) / 100 : n * mult;
  return neg ? -out : out;
}

function coerce(f: FieldDef, raw: unknown): { value: unknown; error?: string } {
  const empty = raw == null || String(raw).trim() === '';
  if (empty) return { value: undefined };
  switch (f.type) {
    case 'string':
    case 'date':
      return { value: String(raw).trim() };
    case 'number':
    case 'money': {
      const n = parseNumber(raw);
      return n == null ? { value: undefined, error: `"${raw}" is not a number` } : { value: n };
    }
    case 'integer':
    case 'month': {
      const n = parseNumber(raw);
      return n == null || !Number.isInteger(Math.round(n)) ? { value: undefined, error: `"${raw}" is not a whole number` } : { value: Math.round(n) };
    }
    case 'percent': {
      const s = String(raw);
      const n = parseNumber(raw);
      if (n == null) return { value: undefined, error: `"${raw}" is not a percent` };
      return { value: !s.includes('%') && Math.abs(n) > 1 ? n / 100 : n };
    }
    case 'boolean': {
      const s = String(raw).trim().toLowerCase();
      if (['y', 'yes', 'true', '1', 'x'].includes(s)) return { value: true };
      if (['n', 'no', 'false', '0'].includes(s)) return { value: false };
      return { value: undefined, error: `"${raw}" is not yes or no` };
    }
    case 'list':
      return { value: String(raw).split(/[;,|]/).map((x) => x.trim()).filter(Boolean) };
    case 'enum': {
      const s = String(raw).trim();
      const opts = f.enum ?? [];
      const hit = opts.find((o) => o.toLowerCase() === s.toLowerCase()) ?? (f.key === 'status' && opts === ASSUMPTION_STATUSES ? STATUS_SYNONYMS[s.toLowerCase()] : undefined);
      return hit ? { value: hit } : { value: s, error: `Unknown value "${s}". Expected one of: ${opts.join(', ')}` };
    }
  }
}

export interface MappedResult {
  records: Record<string, unknown>[];
  issues: Issue[];
}

export function mapRows(schema: EntitySchema, rows: Record<string, unknown>[], columnMap: Record<string, string>): MappedResult {
  const issues: Issue[] = [];
  const records: Record<string, unknown>[] = [];
  for (const f of schema.fields) if (f.required && !columnMap[f.key]) issues.push({ row: 0, field: f.key, kind: 'mapping', message: `Required field "${f.label}" is not mapped` });
  const seen = new Map<string, number>();
  rows.forEach((raw, i) => {
    const rec: Record<string, unknown> = { _row: i + 1 };
    for (const f of schema.fields) {
      const h = columnMap[f.key];
      if (!h) continue;
      const { value, error } = coerce(f, raw[h]);
      if (error) issues.push({ row: i + 1, field: f.key, kind: f.type === 'enum' ? 'enum' : 'type', message: error });
      if (value !== undefined) rec[f.key] = value;
    }
    for (const f of schema.fields) if (f.required && columnMap[f.key] && (rec[f.key] === undefined || rec[f.key] === '')) issues.push({ row: i + 1, field: f.key, kind: 'required', message: `${f.label} is empty` });
    const id = rec[schema.idField];
    if (id != null && id !== '') {
      const k = String(id);
      if (seen.has(k)) issues.push({ row: i + 1, field: schema.idField, kind: 'duplicate', message: `Duplicate ${schema.idField} "${k}" (also row ${seen.get(k)})` });
      else seen.set(k, i + 1);
    }
    records.push(rec);
  });
  return { records, issues };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export interface ApplyImportInput {
  entityType: string;
  datasetName: string;
  fileName: string;
  sheet?: string;
  headers: string[];
  rawRows: Record<string, unknown>[];
  columnMap: Record<string, string>;
  mode: 'replace' | 'append' | 'upsert';
  saveTemplateName?: string;
  /** Skip rows with errors instead of importing them with defaults. */
  skipErrorRows?: boolean;
  now?: string;
}

export function applyImport(ws: Workspace, input: ApplyImportInput): { ws: Workspace; imported: number; skipped: number; issues: Issue[] } {
  const schema = getEntitySchema(input.entityType);
  if (!schema) throw new Error(`Unknown entity type ${input.entityType}`);
  const now = input.now ?? new Date().toISOString();
  const { records, issues } = mapRows(schema, input.rawRows, input.columnMap);
  const badRows = new Set(issues.filter((x) => x.row > 0 && (x.kind === 'required' || x.kind === 'duplicate')).map((x) => x.row));
  const datasetId = `ds-${headerSignature(input.headers).slice(4, 12)}-${now.replace(/\D/g, '').slice(0, 14)}`;
  const keep = records.filter((r) => !(input.skipErrorRows && badRows.has(r._row as number)));
  const usedIds = new Set<string>();
  const finalRecords = keep.map((r, i) => {
    let id = r[schema.idField] != null && r[schema.idField] !== '' ? String(r[schema.idField]) : '';
    if (!id) id = r.name ? `${schema.idPrefix}-${slug(String(r.name))}` : `${schema.idPrefix}-${i + 1}`;
    while (usedIds.has(id)) id = `${id}-${i + 1}`;
    usedIds.add(id);
    const out: Record<string, unknown> = { ...r, [schema.idField]: id, _datasetId: datasetId };
    return out;
  });

  const next: Workspace = structuredClone(ws);
  if (schema.collection === 'assumptions') {
    const incoming: Assumption[] = finalRecords.map((r) => {
      const prev = ws.assumptions.find((a) => a.id === r.id);
      return {
        id: String(r.id),
        label: String(r.label ?? prev?.label ?? r.id),
        value: (r.value as number) ?? null,
        low: (r.low as number) ?? null,
        high: (r.high as number) ?? null,
        unit: String(r.unit ?? prev?.unit ?? ''),
        status: (ASSUMPTION_STATUSES.includes(r.status as AssumptionStatus) ? r.status : 'Open') as AssumptionStatus,
        source: String(r.source ?? ''),
        asOf: String(r.asOf ?? ''),
        usedIn: String(r.usedIn ?? ''),
        notes: String(r.notes ?? ''),
        formula: r.formula ? String(r.formula) : undefined,
        conservativeBound: prev?.conservativeBound,
        alternates: prev?.alternates,
      };
    });
    if (input.mode === 'replace') next.assumptions = incoming;
    else {
      const m = new Map(next.assumptions.map((a) => [a.id, a]));
      for (const a of incoming) m.set(a.id, input.mode === 'append' && m.has(a.id) ? m.get(a.id)! : a);
      next.assumptions = [...m.values()];
    }
  } else {
    const coll = schema.collection;
    const prev = ((next.entities as Record<string, Record<string, unknown>[]>)[coll] ?? []) as Record<string, unknown>[];
    const defaults: Record<string, unknown> = coll === 'people' ? { practices: [], base: 0, variableTarget: 0, fte: 1, status: 'current', title: '' } : coll === 'territories' ? { regionalDirectors: [] } : {};
    const recs = finalRecords.map((r) => ({ ...defaults, ...r }));
    if (coll === 'people') for (const r of recs) if (!r.roleFamily || !(schema.fields.find((f) => f.key === 'roleFamily')!.enum ?? []).includes(r.roleFamily as string)) r.roleFamily = 'Other';
    let merged: Record<string, unknown>[];
    if (input.mode === 'replace') merged = recs;
    else {
      const m = new Map(prev.map((x) => [String(x[schema.idField]), x]));
      for (const r of recs) {
        const k = String(r[schema.idField]);
        if (input.mode === 'append' && m.has(k)) continue;
        m.set(k, input.mode === 'upsert' && m.has(k) ? { ...m.get(k), ...r } : r);
      }
      merged = [...m.values()];
    }
    (next.entities as Record<string, unknown[]>)[coll] = merged;
  }

  const dataset: Dataset = {
    id: datasetId,
    name: input.datasetName,
    fileName: input.fileName,
    sheet: input.sheet,
    importedAt: now,
    entityType: input.entityType,
    headers: input.headers,
    rawRows: input.rawRows,
    rowCount: input.rawRows.length,
  };
  if (input.saveTemplateName) {
    const sig = headerSignature(input.headers);
    const t: MappingTemplate = { id: `tpl-${sig.slice(4, 12)}-${input.entityType}`, name: input.saveTemplateName, entityType: input.entityType, headerSignature: sig, headers: input.headers, columnMap: input.columnMap, createdAt: now };
    next.mappingTemplates = [...next.mappingTemplates.filter((x) => x.id !== t.id), t];
    dataset.mappingTemplateId = t.id;
  }
  next.datasets = [...next.datasets, dataset];
  next.changeLog = [...next.changeLog, { at: now, action: `Imported ${finalRecords.length} ${schema.label} rows`, detail: `${input.fileName}${input.sheet ? ` / ${input.sheet}` : ''} (${input.mode})` }];
  return { ws: next, imported: finalRecords.length, skipped: records.length - keep.length, issues };
}
