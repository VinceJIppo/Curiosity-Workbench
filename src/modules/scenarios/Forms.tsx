// Generic change form (driven by each change type's field specs), gates editor and inheritance editor.
import type { Change, Gate, GateComparator, Scenario, Workspace } from '../../core/schema/types';
import { ROLE_FAMILIES } from '../../core/schema/types';
import type { FieldSpec, ScenarioResult } from '../../core/engine/types';
import { changeRegistry } from '../../app/engine';
import { update } from '../../app/store';
import { Field, NumberInput, Select, TextInput } from '../../ui/components';
import { BINDINGS } from '../../core/engine/bindings';
import { MONTH_METRICS } from '../../core/engine/explain';
import { newId } from '../shared';

function editScenario(id: string, fn: (s: Scenario) => void, label: string, coalesce?: string) {
  update((w) => {
    const s = w.scenarios.find((x) => x.id === id);
    if (s) fn(s);
  }, label, coalesce ? { coalesce } : undefined);
}

function ParamInput({ ws, f, value, onChange }: { ws: Workspace; f: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  switch (f.kind) {
    case 'number':
    case 'money':
    case 'percent':
      return <NumberInput value={value === '' || value == null ? null : Number(value)} onChange={(v) => onChange(v ?? '')} placeholder={f.kind === 'percent' ? '0.2 = 20%' : ''} />;
    case 'text':
      return <TextInput value={String(value ?? '')} onChange={onChange} />;
    case 'select':
      return <Select value={String(value ?? '')} options={f.options ?? []} onChange={onChange} />;
    case 'tier':
      return <Select value={String(value ?? '')} options={['1', '2', '3']} onChange={(v) => onChange(Number(v))} />;
    case 'boolean':
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />;
    case 'roleFamily':
      return <Select value={String(value ?? '')} options={ROLE_FAMILIES} onChange={onChange} allowEmpty={f.optional ? '(no change)' : undefined} />;
    case 'person':
      return (
        <select class="text" value={String(value ?? '')} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
          <option value="">{f.optional ? '(none)' : 'Choose a person'}</option>
          {ws.entities.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.roleFamily})
            </option>
          ))}
        </select>
      );
    case 'territory':
      return <Select value={String(value ?? '')} options={ws.entities.territories.map((t) => t.id)} labels={Object.fromEntries(ws.entities.territories.map((t) => [t.id, t.name]))} onChange={onChange} allowEmpty="(none)" />;
    case 'service':
      return <Select value={String(value ?? '')} options={ws.entities.externalServices.map((t) => t.id)} labels={Object.fromEntries(ws.entities.externalServices.map((t) => [t.id, `${t.name} (${t.vendor})`]))} onChange={onChange} allowEmpty="Choose a service" />;
    case 'assumption': {
      const opts = [...BINDINGS.map((b) => b.key), ...ws.assumptions.map((a) => a.id)];
      const labels = Object.fromEntries([...BINDINGS.map((b) => [b.key, `${b.label} (binding)`]), ...ws.assumptions.map((a) => [a.id, `${a.id} ${a.label}`])]);
      return <Select value={String(value ?? '')} options={opts} labels={labels} onChange={onChange} allowEmpty={f.optional ? '(none)' : 'Choose'} />;
    }
    case 'practices': {
      const cur = Array.isArray(value) ? (value as string[]) : typeof value === 'string' && value ? value.split(/[;,]/).map((s) => s.trim()) : [];
      return (
        <div class="row" style="gap:4px 10px">
          {ws.entities.practices.map((p) => (
            <label key={p.id} class="small row" style="gap:3px">
              <input type="checkbox" checked={cur.includes(p.id)} onChange={(e) => onChange((e.target as HTMLInputElement).checked ? [...cur, p.id] : cur.filter((x) => x !== p.id))} />
              {p.name}
            </label>
          ))}
        </div>
      );
    }
  }
}

export function ChangeForm({ ws, sc, change, result, onClose }: { ws: Workspace; sc: Scenario; change: Change; result: ScenarioResult | null; onClose: () => void }) {
  const t = changeRegistry().get(change.type);
  const own = sc.changes.some((c) => c.id === change.id);
  const outcome = result?.changes.find((c) => c.changeId === change.id);
  const set = (fn: (c: Change) => void, label: string, coalesce?: string) =>
    editScenario(
      sc.id,
      (s) => {
        const c = s.changes.find((x) => x.id === change.id);
        if (c) fn(c);
      },
      label,
      coalesce,
    );
  if (!t) return <div class="callout error">Unknown change type {change.type}. The module that provides it may be missing.</div>;
  const errors = t.validate?.(change.params as never, ws) ?? [];
  return (
    <div class="card" data-testid="change-form">
      <div class="row" style="margin-bottom:8px">
        <h3 style="flex:1;margin:0">{t.label}</h3>
        {own && !sc.locked && (
          <>
            <button
              class="btn small"
              onClick={() =>
                editScenario(sc.id, (s) => {
                  const c = s.changes.find((x) => x.id === change.id)!;
                  s.changes.push({ ...structuredClone(c), id: newId('chg') });
                }, 'Duplicated change')
              }
            >
              Duplicate
            </button>
            <button
              class="btn small danger"
              onClick={() => {
                editScenario(sc.id, (s) => (s.changes = s.changes.filter((x) => x.id !== change.id)), 'Deleted change');
                onClose();
              }}
            >
              Delete
            </button>
          </>
        )}
        <button class="btn small" onClick={onClose}>
          Done
        </button>
      </div>
      {!own && <div class="callout">Inherited from another scenario. Edit it there, or change the inheritance window above.</div>}
      {outcome && (
        <p class="small">
          Status: <b>{outcome.status}</b>
          {outcome.actualMonth != null && outcome.actualMonth !== outcome.plannedMonth ? `, applied at M${outcome.actualMonth} (planned M${outcome.plannedMonth})` : ''}
          {outcome.message ? `. ${outcome.message}` : ''}
        </p>
      )}
      {errors.length > 0 && <div class="callout error">{errors.join('. ')}</div>}
      <fieldset disabled={!own || sc.locked} style="border:0;padding:0;margin:0">
        <div class="form-grid">
          <Field label="Month (0 = approval)">
            <NumberInput value={change.month} onChange={(v) => set((c) => (c.month = Math.max(0, Math.round(v ?? 0))), 'Changed month', `m-${change.id}`)} />
          </Field>
          <Field label="Gate">
            <Select value={change.gateId ?? ''} options={sc.gates.map((g) => g.id)} labels={Object.fromEntries(sc.gates.map((g) => [g.id, `${g.name} (M${g.month})`]))} allowEmpty="No gate" onChange={(v) => set((c) => (c.gateId = v || undefined), 'Changed gate')} />
          </Field>
          {t.fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.help}>
              <ParamInput ws={ws} f={f} value={change.params[f.key]} onChange={(v) => set((c) => (c.params[f.key] = v), `Edited ${f.label}`, `p-${change.id}-${f.key}`)} />
            </Field>
          ))}
          <Field label="Tags (comma separated, used by inheritance filters)">
            <TextInput value={(change.tags ?? []).join(', ')} onChange={(v) => set((c) => (c.tags = v.split(',').map((x) => x.trim()).filter(Boolean)), 'Edited tags', `t-${change.id}`)} />
          </Field>
          <Field label="Note">
            <TextInput value={change.note ?? ''} onChange={(v) => set((c) => (c.note = v), 'Edited note', `n-${change.id}`)} />
          </Field>
          <label class="row small">
            <input type="checkbox" checked={change.enabled !== false} onChange={(e) => set((c) => (c.enabled = (e.target as HTMLInputElement).checked), 'Toggled change')} /> Enabled
          </label>
        </div>
      </fieldset>
    </div>
  );
}

export function GatesEditor({ ws, sc, result }: { ws: Workspace; sc: Scenario; result: ScenarioResult | null }) {
  const set = (gid: string, fn: (g: Gate) => void, label: string, coalesce?: string) =>
    editScenario(
      sc.id,
      (s) => {
        const g = s.gates.find((x) => x.id === gid);
        if (g) fn(g);
      },
      label,
      coalesce,
    );
  const metricOpts = Object.keys(MONTH_METRICS);
  return (
    <div class="stack">
      {sc.gates.length === 0 && <p class="muted small">No gates. A gate holds its changes until it passes; a miss reruns the gate later.</p>}
      {sc.gates.map((g) => {
        const evals = result?.gates.filter((x) => x.gateKey === `${sc.id}:${g.id}`) ?? [];
        return (
          <div class="card" key={g.id}>
            <div class="form-grid">
              <Field label="Name">
                <TextInput value={g.name} onChange={(v) => set(g.id, (x) => (x.name = v), 'Renamed gate', `gn-${g.id}`)} />
              </Field>
              <Field label="Month">
                <NumberInput value={g.month} onChange={(v) => set(g.id, (x) => (x.month = Math.max(0, Math.round(v ?? 0))), 'Changed gate month', `gm-${g.id}`)} />
              </Field>
              <Field label="Kind">
                <Select value={g.kind} options={['manual', 'kpi'] as const} labels={{ manual: 'Manual pass or miss', kpi: 'KPI condition' }} onChange={(v) => set(g.id, (x) => (x.kind = (v || 'manual') as Gate['kind']), 'Changed gate kind')} />
              </Field>
              <Field label={`Rerun after a miss (months, default ${ws.settings.gateRetryMonths})`}>
                <NumberInput value={g.retryMonths ?? null} onChange={(v) => set(g.id, (x) => (x.retryMonths = v ?? undefined), 'Changed retry', `gr-${g.id}`)} />
              </Field>
              {g.kind === 'kpi' && (
                <>
                  <Field label="Metric (engine metric or expression)" hint={`For example: ${metricOpts.slice(0, 4).join(', ')}`}>
                    <TextInput value={g.metric ?? 'sellersPerSpecialist'} onChange={(v) => set(g.id, (x) => (x.metric = v), 'Changed gate metric', `gk-${g.id}`)} list={`metrics-${g.id}`} />
                    <datalist id={`metrics-${g.id}`}>
                      {metricOpts.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </Field>
                  <div class="row">
                    <Field label="Test">
                      <Select value={g.comparator ?? '>='} options={['>=', '<=', '>', '<', '=='] as GateComparator[]} onChange={(v) => set(g.id, (x) => (x.comparator = (v || '>=') as GateComparator), 'Changed comparator')} />
                    </Field>
                    <Field label="Threshold">
                      <NumberInput value={g.threshold ?? 0} onChange={(v) => set(g.id, (x) => (x.threshold = v ?? 0), 'Changed threshold', `gt-${g.id}`)} />
                    </Field>
                  </div>
                </>
              )}
              <Field label="Maximum reruns before changes drop">
                <NumberInput value={g.maxRetries ?? 3} onChange={(v) => set(g.id, (x) => (x.maxRetries = v ?? 3), 'Changed max reruns', `gx-${g.id}`)} />
              </Field>
            </div>
            <h3 style="margin-top:12px">Outcomes</h3>
            {evals.length === 0 && <p class="small muted">Not evaluated inside the horizon, or no changes use this gate.</p>}
            <div class="row">
              {evals.map((e) => (
                <span key={e.month} class="row" style="gap:4px">
                  <span class={`badge ${e.pass ? 'pass' : 'fail'}`} title={e.reason}>
                    M{e.month} {e.pass ? 'pass' : 'miss'}
                    {e.final === 'dropped' ? ', dropped' : ''}
                  </span>
                  {g.kind === 'manual' && !sc.locked && (
                    <button class="btn small ghost" onClick={() => set(g.id, (x) => (x.manualOutcomes = { ...(x.manualOutcomes ?? {}), [String(e.month)]: !e.pass }), `Gate ${g.name} M${e.month} ${e.pass ? 'miss' : 'pass'}`)}>
                      Mark {e.pass ? 'miss' : 'pass'}
                    </button>
                  )}
                </span>
              ))}
              {g.kind === 'manual' && Object.keys(g.manualOutcomes ?? {}).length > 0 && (
                <button class="btn small ghost" onClick={() => set(g.id, (x) => (x.manualOutcomes = {}), 'Reset gate outcomes')}>
                  Reset outcomes
                </button>
              )}
            </div>
            <div class="row" style="margin-top:8px">
              <span class="small muted" style="flex:1">
                Used by {sc.changes.filter((c) => c.gateId === g.id).length} changes.
              </span>
              <button
                class="btn small danger"
                onClick={() =>
                  editScenario(sc.id, (s) => {
                    s.gates = s.gates.filter((x) => x.id !== g.id);
                    s.changes.forEach((c) => c.gateId === g.id && (c.gateId = undefined));
                  }, 'Deleted gate')
                }
              >
                Delete gate
              </button>
            </div>
          </div>
        );
      })}
      {!sc.locked && (
        <div>
          <button class="btn small" onClick={() => editScenario(sc.id, (s) => s.gates.push({ id: newId('gate'), name: `Month ${12} gate`, month: 12, kind: 'manual', manualOutcomes: {} }), 'Added gate')}>
            Add gate
          </button>
        </div>
      )}
    </div>
  );
}

export function InheritEditor({ ws, sc }: { ws: Workspace; sc: Scenario }) {
  const others = ws.scenarios.filter((s) => s.id !== sc.id);
  const segs = sc.inherits ?? [];
  const setSeg = (i: number, patch: Record<string, unknown>, label: string, coalesce?: string) =>
    editScenario(sc.id, (s) => Object.assign(s.inherits![i], patch), label, coalesce);
  return (
    <div class="stack">
      {segs.length === 0 && <p class="small muted">This scenario starts from the baseline. Add a segment to start from another scenario and switch at a month.</p>}
      {segs.map((g, i) => (
        <div class="row" key={i} style="align-items:flex-end">
          <Field label="Use changes from">
            <Select value={g.scenarioId} options={others.map((s) => s.id)} labels={Object.fromEntries(others.map((s) => [s.id, s.name]))} onChange={(v) => setSeg(i, { scenarioId: v }, 'Changed inheritance')} />
          </Field>
          <Field label="From month">
            <NumberInput value={g.fromMonth} onChange={(v) => setSeg(i, { fromMonth: Math.max(0, v ?? 0) }, 'Changed inheritance', `if-${i}`)} />
          </Field>
          <Field label="To month (blank = end)">
            <NumberInput value={g.toMonth ?? null} onChange={(v) => setSeg(i, { toMonth: v }, 'Changed inheritance', `it-${i}`)} />
          </Field>
          <Field label="Only tags (comma, blank = all)">
            <TextInput value={(g.tags ?? []).join(', ')} onChange={(v) => setSeg(i, { tags: v.split(',').map((x) => x.trim()).filter(Boolean) }, 'Changed inheritance', `ig-${i}`)} />
          </Field>
          <label class="small row" title="Parent changes scheduled before this segment begins apply when it starts">
            <input type="checkbox" checked={g.carryEarlier ?? true} onChange={(e) => setSeg(i, { carryEarlier: (e.target as HTMLInputElement).checked }, 'Changed inheritance')} /> Carry earlier changes
          </label>
          <button class="btn small danger" onClick={() => editScenario(sc.id, (s) => s.inherits!.splice(i, 1), 'Removed inheritance segment')}>
            Remove
          </button>
        </div>
      ))}
      {!sc.locked && others.length > 0 && (
        <div>
          <button class="btn small" onClick={() => editScenario(sc.id, (s) => (s.inherits = [...(s.inherits ?? []), { scenarioId: others[0].id, fromMonth: 0, toMonth: null }]), 'Added inheritance segment')}>
            Add segment
          </button>
        </div>
      )}
    </div>
  );
}
