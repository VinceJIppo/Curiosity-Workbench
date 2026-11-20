import { useMemo, useState } from 'preact/hooks';
import type { ModuleManifest, ViewProps } from '../../app/module';
import { update, useWorkspace } from '../../app/store';
import { navigate } from '../../app/router';
import { resolveAssumptions, formulaInputs, defaultConservativeBound } from '../../core/assumptions/resolve';
import { ASSUMPTION_STATUSES, type Assumption, type AssumptionStatus } from '../../core/schema/types';
import { BINDINGS } from '../../core/engine/bindings';
import { byUnit, sanitizeText } from '../../core/format';
import { Badge, ConflictFlag, Field, NumberInput, Select, TextInput, Empty } from '../../ui/components';
import { exportCsv } from '../../charts/export';
import { caseLabel } from '../shared';

function editA(id: string, fn: (a: Assumption) => void, label: string, coalesce?: string) {
  update((w) => {
    const a = w.assumptions.find((x) => x.id === id);
    if (a) fn(a);
  }, label, coalesce ? { coalesce } : undefined);
}

function nextId(list: Assumption[]): string {
  const nums = list.map((a) => /^R(\d+)$/.exec(a.id)?.[1]).filter(Boolean).map(Number);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `R${String(n).padStart(2, '0')}`;
}

function Drawer({ id, onClose }: { id: string; onClose: () => void }) {
  const ws = useWorkspace();
  const a = ws.assumptions.find((x) => x.id === id);
  const res = useMemo(() => resolveAssumptions(ws.assumptions, { caseKey: ws.settings.caseKey, bindings: ws.settings.bindings }), [ws.assumptions, ws.settings]);
  if (!a) return null;
  const r = res.byId.get(id);
  const dependents = ws.assumptions.filter((x) => x.formula && formulaInputs(x.formula).some((n) => n === id || ws.settings.bindings[n] === id));
  const boundTo = Object.entries(ws.settings.bindings).filter(([, v]) => v === id).map(([k]) => k);
  const set = (fn: (a: Assumption) => void, label: string, field: string) => editA(id, fn, label, `${id}-${field}`);
  return (
    <aside class="drawer" aria-label={`Edit ${id}`}>
      <div class="row" style="margin-bottom:10px">
        <h2 style="flex:1;margin:0">{a.id}</h2>
        <Badge status={a.status} />
        <button class="btn small" onClick={onClose}>
          Close
        </button>
      </div>
      <div class="stack">
        <Field label="Label">
          <TextInput value={a.label} onChange={(v) => set((x) => (x.label = v), 'Edited label', 'label')} />
        </Field>
        <div class="grid3">
          <Field label="Low">
            <NumberInput value={a.low} onChange={(v) => set((x) => (x.low = v), `Edited ${id} low`, 'low')} />
          </Field>
          <Field label="Base">
            <NumberInput value={a.value} onChange={(v) => set((x) => (x.value = v), `Edited ${id} value`, 'value')} />
          </Field>
          <Field label="High">
            <NumberInput value={a.high} onChange={(v) => set((x) => (x.high = v), `Edited ${id} high`, 'high')} />
          </Field>
        </div>
        <div class="grid2">
          <Field label="Unit">
            <TextInput value={a.unit} onChange={(v) => set((x) => (x.unit = v), 'Edited unit', 'unit')} />
          </Field>
          <Field label="Status">
            <Select value={a.status} options={ASSUMPTION_STATUSES} onChange={(v) => set((x) => (x.status = (v || 'Open') as AssumptionStatus), `Status of ${id}`, 'status')} />
          </Field>
        </div>
        <Field label="Conservative case uses" hint="The bound that is worse for the proposal. Costs default to high.">
          <Select value={defaultConservativeBound(a)} options={['low', 'high'] as const} labels={{ low: 'Low bound', high: 'High bound' }} onChange={(v) => set((x) => (x.conservativeBound = (v || 'high') as 'low' | 'high'), 'Conservative bound', 'cons')} />
        </Field>
        <Field label="Formula (derived assumption)" hint="Use other IDs, for example R01 / R02 or ceil(R01 / R07). Functions: min, max, ceil, floor, round, abs, if.">
          <TextInput value={a.formula ?? ''} onChange={(v) => set((x) => (x.formula = v || undefined), 'Edited formula', 'formula')} />
        </Field>
        {r?.error && <div class="callout error">{r.error}</div>}
        <div class="callout">
          {caseLabel(ws.settings.caseKey)} case value: <b>{r && Number.isFinite(r.value) ? byUnit(r.value, a.unit) : 'n/a'}</b> {r ? `(uses ${r.used})` : ''}
          <ConflictFlag ids={r?.conflicts ?? []} />
          {r && r.inputs.length > 0 && <div class="small">Inputs: {r.inputs.join(', ')}</div>}
          {dependents.length > 0 && <div class="small">Feeds: {dependents.map((d) => d.id).join(', ')}</div>}
          {boundTo.length > 0 && <div class="small">Engine binding: {boundTo.join(', ')}</div>}
        </div>
        <Field label="Source">
          <TextInput value={a.source} onChange={(v) => set((x) => (x.source = v), 'Edited source', 'source')} />
        </Field>
        <div class="grid2">
          <Field label="As of">
            <TextInput value={a.asOf} onChange={(v) => set((x) => (x.asOf = v), 'Edited as of', 'asOf')} />
          </Field>
          <Field label="Used in">
            <TextInput value={a.usedIn} onChange={(v) => set((x) => (x.usedIn = v), 'Edited used in', 'usedIn')} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea class="text" rows={3} value={a.notes} onInput={(e) => set((x) => (x.notes = (e.target as HTMLTextAreaElement).value), 'Edited notes', 'notes')} />
        </Field>
        <div>
          <h3>Alternate values</h3>
          {(a.alternates ?? []).map((alt, i) => (
            <div class="row" key={i} style="margin-bottom:6px">
              <NumberInput value={alt.value} onChange={(v) => set((x) => (x.alternates![i].value = v ?? 0), 'Edited alternate', `alt${i}v`)} />
              <TextInput value={alt.source} onChange={(v) => set((x) => (x.alternates![i].source = v), 'Edited alternate', `alt${i}s`)} placeholder="Source" />
              <button class="btn small" title="Make this the base value" onClick={() => editA(id, (x) => {
                const old = x.value;
                x.value = alt.value;
                x.alternates![i] = { value: old ?? 0, source: x.source || 'previous base' };
              }, `Swapped ${id} with alternate`)}>
                Use
              </button>
              <button class="btn small ghost" onClick={() => editA(id, (x) => x.alternates!.splice(i, 1), 'Removed alternate')}>
                Remove
              </button>
            </div>
          ))}
          <button class="btn small" onClick={() => editA(id, (x) => (x.alternates = [...(x.alternates ?? []), { value: x.value ?? 0, source: '' }]), 'Added alternate')}>
            Add alternate
          </button>
          <p class="small muted">Scenarios can use an alternate with an "Override an assumption" change.</p>
        </div>
        <button
          class="btn danger"
          onClick={() => {
            if (!confirm(`Delete ${id}? You can undo.`)) return;
            update((w) => (w.assumptions = w.assumptions.filter((x) => x.id !== id)), `Deleted ${id}`);
            onClose();
          }}
        >
          Delete assumption
        </button>
      </div>
    </aside>
  );
}

function Register({ params }: ViewProps) {
  const ws = useWorkspace();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AssumptionStatus | ''>('');
  const selected = params[0] ?? null;
  const res = useMemo(() => resolveAssumptions(ws.assumptions, { caseKey: ws.settings.caseKey, bindings: ws.settings.bindings }), [ws.assumptions, ws.settings]);
  const lo = useMemo(() => resolveAssumptions(ws.assumptions, { caseKey: 'low', bindings: ws.settings.bindings }), [ws.assumptions, ws.settings]);
  const hi = useMemo(() => resolveAssumptions(ws.assumptions, { caseKey: 'high', bindings: ws.settings.bindings }), [ws.assumptions, ws.settings]);
  const rows = ws.assumptions.filter((a) => (!status || a.status === status) && (!q || `${a.id} ${a.label} ${a.source} ${a.usedIn} ${a.notes}`.toLowerCase().includes(q.toLowerCase())));
  const select = (id: string | null) => navigate(id ? `/assumptions/register/${id}` : '/assumptions/register');
  const fmt = (v: number, unit: string) => (Number.isFinite(v) ? byUnit(v, unit) : '');
  return (
    <div>
      <div class="row" style="margin-bottom:12px">
        <input class="text" style="max-width:280px" placeholder="Search ID, label, source, notes" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search assumptions" />
        <Select value={status} options={ASSUMPTION_STATUSES} onChange={setStatus} allowEmpty="All statuses" cls="text" />
        <span style="flex:1" />
        <span class="small muted">{rows.length} of {ws.assumptions.length}. Values in the {caseLabel(ws.settings.caseKey)} column follow the top-bar toggle.</span>
        <button
          class="btn"
          onClick={() =>
            exportCsv(
              'assumptions register',
              ['ID', 'Label', 'Value', 'Low', 'High', 'Unit', 'Status', 'Source', 'As of', 'Used in', 'Notes', 'Formula'],
              ws.assumptions.map((a) => [a.id, a.label, a.formula ? res.get(a.id) : a.value, a.low, a.high, a.unit, a.status, a.source, a.asOf, a.usedIn, a.notes, a.formula ?? '']),
            )
          }
        >
          Export CSV
        </button>
        <button class="btn" onClick={() => navigate('/data/import/assumption')}>
          Import register
        </button>
        <button
          class="btn primary"
          onClick={() => {
            const id = nextId(ws.assumptions);
            update((w) => w.assumptions.push({ id, label: 'New assumption', value: null, unit: '', status: 'Open', source: '', asOf: new Date().toISOString().slice(0, 7), usedIn: '', notes: '' }), `Added ${id}`);
            select(id);
          }}
        >
          Add assumption
        </button>
      </div>
      {res.cycles.length > 0 && <div class="callout error">Circular formulas: {res.cycles.map((c) => c.join(' > ')).join('; ')}</div>}
      {rows.length === 0 ? (
        <Empty>No assumptions match.</Empty>
      ) : (
        <div class="table-wrap" style="max-height:72vh">
          <table class="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>Label</th>
                <th class="num">{caseLabel(ws.settings.caseKey)}</th>
                <th class="num">Low</th>
                <th class="num">High</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Source</th>
                <th>As of</th>
                <th>Used in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const r = res.byId.get(a.id);
                return (
                  <tr key={a.id} class={`clickable ${selected === a.id ? 'selected' : ''}`} onClick={() => select(a.id)} data-testid={`row-${a.id}`}>
                    <td class="mono">{a.id}</td>
                    <td>
                      {sanitizeText(a.label)}
                      {a.formula && <div class="mono muted">= {a.formula}</div>}
                      {r?.error && <div class="small" style="color:var(--danger)">{r.error}</div>}
                    </td>
                    <td class="num">
                      {r ? fmt(r.value, a.unit) : ''}
                      <ConflictFlag ids={r?.conflicts ?? []} />
                    </td>
                    <td class="num muted">{a.formula ? fmt(lo.get(a.id), a.unit) : a.low != null ? fmt(a.low, a.unit) : ''}</td>
                    <td class="num muted">{a.formula ? fmt(hi.get(a.id), a.unit) : a.high != null ? fmt(a.high, a.unit) : ''}</td>
                    <td class="small">{a.unit}</td>
                    <td>
                      <Badge status={a.status} />
                    </td>
                    <td class="small">{sanitizeText(a.source)}</td>
                    <td class="small">{a.asOf}</td>
                    <td class="small">{a.usedIn}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selected && <Drawer id={selected} onClose={() => select(null)} />}
    </div>
  );
}

function Bindings() {
  const ws = useWorkspace();
  const res = resolveAssumptions(ws.assumptions, { caseKey: ws.settings.caseKey, bindings: ws.settings.bindings });
  const opts = ws.assumptions.map((a) => a.id);
  const labels = Object.fromEntries(ws.assumptions.map((a) => [a.id, `${a.id} ${a.label}`]));
  return (
    <div>
      <p class="muted" style="max-width:820px">
        The engine reads assumptions by role, not by ID. Point each role at a row in your register. When you import your own register, check these first. A missing binding shows as a warning on every scenario that needs it.
      </p>
      <table class="data">
        <thead>
          <tr>
            <th>Engine role</th>
            <th>What it does</th>
            <th>Assumption</th>
            <th class="num">Value ({ws.settings.caseKey})</th>
          </tr>
        </thead>
        <tbody>
          {BINDINGS.map((b) => {
            const id = ws.settings.bindings[b.key] ?? '';
            const r = res.find(b.key);
            return (
              <tr key={b.key}>
                <td>
                  <b>{b.label}</b>
                  <div class="mono muted">{b.key}</div>
                </td>
                <td class="small">{b.help}</td>
                <td style="min-width:320px">
                  <Select value={id} options={opts} labels={labels} allowEmpty="Not bound" onChange={(v) => update((w) => (v ? (w.settings.bindings[b.key] = v) : delete w.settings.bindings[b.key]), `Bound ${b.key} to ${v || 'nothing'}`)} />
                </td>
                <td class="num">
                  {r && Number.isFinite(r.value) ? byUnit(r.value, r.unit) : <span style="color:var(--danger)">missing</span>}
                  {r && <ConflictFlag ids={r.conflicts} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const assumptionsModule: ModuleManifest = {
  id: 'assumptions',
  title: 'Assumptions',
  icon: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  navOrder: 30,
  views: [
    { id: 'register', title: 'Register', component: Register },
    { id: 'bindings', title: 'Engine bindings', component: Bindings },
  ],
};
