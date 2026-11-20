// Editable table for any entity collection, driven by the schema registry.
import { useState } from 'preact/hooks';
import { update, useWorkspace } from '../app/store';
import type { EntitySchema, FieldDef } from '../core/schema/registry';
import { exportCsv } from '../charts/export';
import { Empty } from './components';

type Row = Record<string, unknown>;

function cellText(f: FieldDef, v: unknown, mask: boolean): string {
  if (v == null || v === '') return '';
  if (mask && f.sensitive) return '•••';
  if (Array.isArray(v)) return v.join(', ');
  if (f.type === 'percent' && typeof v === 'number') return `${(v * 100).toFixed(1)}%`;
  if (f.type === 'money' && typeof v === 'number') return v.toLocaleString('en-US');
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

function parseCell(f: FieldDef, s: string): unknown {
  const t = s.trim();
  if (t === '') return undefined;
  switch (f.type) {
    case 'number':
    case 'money':
    case 'integer':
    case 'month': {
      const n = Number(t.replace(/[$,]/g, ''));
      return Number.isFinite(n) ? (f.type === 'integer' || f.type === 'month' ? Math.round(n) : n) : undefined;
    }
    case 'percent': {
      const n = Number(t.replace('%', ''));
      return Number.isFinite(n) ? (t.includes('%') || Math.abs(n) > 1 ? n / 100 : n) : undefined;
    }
    case 'boolean':
      return /^(y|yes|true|1)$/i.test(t);
    case 'list':
      return t.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    default:
      return t;
  }
}

function Cell({ f, value, mask, onCommit }: { f: FieldDef; value: unknown; mask: boolean; onCommit: (v: unknown) => void }) {
  const [editing, setEditing] = useState(false);
  if (f.type === 'enum') {
    return (
      <select class="cell" value={String(value ?? '')} onChange={(e) => onCommit((e.target as HTMLSelectElement).value || undefined)} aria-label={f.label}>
        <option value="" />
        {(f.enum ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (!editing)
    return (
      <span tabIndex={0} onClick={() => setEditing(true)} onFocus={() => setEditing(true)} style="display:block;min-height:18px;cursor:text" class={f.type === 'money' || f.type === 'number' || f.type === 'percent' ? 'right' : ''}>
        {cellText(f, value, mask)}
      </span>
    );
  return (
    <input
      class="cell"
      autoFocus
      aria-label={f.label}
      defaultValue={Array.isArray(value) ? value.join(', ') : f.type === 'percent' && typeof value === 'number' ? String(value) : String(value ?? '')}
      onBlur={(e) => {
        setEditing(false);
        const nv = parseCell(f, (e.target as HTMLInputElement).value);
        if (JSON.stringify(nv) !== JSON.stringify(value)) onCommit(nv);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

export function EntityTable({ schema, columns, filter, newRow, maskSensitive = false, title }: { schema: EntitySchema; columns?: string[]; filter?: (r: Row) => boolean; newRow?: () => Row; maskSensitive?: boolean; title: string }) {
  const ws = useWorkspace();
  const [q, setQ] = useState('');
  const [mask, setMask] = useState(maskSensitive);
  const all = ((ws.entities as Record<string, unknown[]>)[schema.collection] ?? []) as Row[];
  const fields = (columns ? columns.map((c) => schema.fields.find((f) => f.key === c)!).filter(Boolean) : schema.fields).filter((f) => f.key !== schema.idField || !columns);
  const rows = all.filter((r) => (!filter || filter(r)) && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())));
  const setField = (id: unknown, key: string, v: unknown) =>
    update((w) => {
      const coll = (w.entities as Record<string, Row[]>)[schema.collection];
      const r = coll.find((x) => x[schema.idField] === id);
      if (!r) return;
      if (v === undefined) delete r[key];
      else r[key] = v;
    }, `Edited ${schema.label}: ${key}`);
  const hasSensitive = fields.some((f) => f.sensitive);
  return (
    <div>
      <div class="row" style="margin-bottom:10px">
        <input class="text" style="max-width:260px" placeholder={`Search ${title.toLowerCase()}`} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label={`Search ${title}`} />
        <span class="small muted" style="flex:1">
          {rows.length} of {all.length}. Click a cell to edit.
        </span>
        {hasSensitive && (
          <label class="small row">
            <input type="checkbox" checked={!mask} onChange={(e) => setMask(!(e.target as HTMLInputElement).checked)} /> Show comp
          </label>
        )}
        <button class="btn small" onClick={() => exportCsv(title, schema.fields.map((f) => f.label), rows.map((r) => schema.fields.map((f) => (Array.isArray(r[f.key]) ? (r[f.key] as string[]).join('; ') : r[f.key]))))}>
          Export CSV
        </button>
        {newRow && (
          <button
            class="btn small primary"
            onClick={() => {
              const r = newRow();
              update((w) => ((w.entities as Record<string, Row[]>)[schema.collection] = [...((w.entities as Record<string, Row[]>)[schema.collection] ?? []), r]), `Added ${schema.label} row`);
            }}
          >
            Add row
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty>No rows. Import a file or add a row.</Empty>
      ) : (
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>{schema.idField}</th>
                {fields.map((f) => (
                  <th key={f.key} class={f.type === 'money' || f.type === 'number' || f.type === 'percent' ? 'num' : ''}>
                    {f.label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((r) => (
                <tr key={String(r[schema.idField])}>
                  <td class="mono small">{String(r[schema.idField])}</td>
                  {fields.map((f) => (
                    <td key={f.key} class={f.type === 'money' || f.type === 'number' || f.type === 'percent' ? 'num' : ''}>
                      <Cell f={f} value={r[f.key]} mask={mask} onCommit={(v) => setField(r[schema.idField], f.key, v)} />
                    </td>
                  ))}
                  <td>
                    <button class="btn small ghost" title="Delete row" aria-label="Delete row" onClick={() => update((w) => ((w.entities as Record<string, Row[]>)[schema.collection] = (w.entities as Record<string, Row[]>)[schema.collection].filter((x) => x[schema.idField] !== r[schema.idField])), `Deleted ${schema.label} row`)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && <p class="small muted">Showing the first 500 rows. Search to narrow.</p>}
        </div>
      )}
    </div>
  );
}
