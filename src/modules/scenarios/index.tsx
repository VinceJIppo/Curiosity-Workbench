import { useState } from 'preact/hooks';
import type { ModuleManifest, ViewProps } from '../../app/module';
import { update, useWorkspace } from '../../app/store';
import { navigate } from '../../app/router';
import { setUi } from '../../app/ui';
import { changeRegistry } from '../../app/engine';
import { effectiveChanges } from '../../core/engine/run';
import type { Scenario } from '../../core/schema/types';
import type { ScenarioResult } from '../../core/engine/types';
import { Field, TextInput, Tabs, Empty } from '../../ui/components';
import { CapacityView, CostView, CoverageView, GpView, HeadcountView, SensitivityView, SummaryKpis, AnnualTable } from '../../ui/outputs';
import { ErrorBox, newId, run, scenarioStyle, useActiveScenario } from '../shared';
import { Timeline } from './Timeline';
import { ChangeForm, GatesEditor, InheritEditor } from './Forms';

type OutTab = 'summary' | 'headcount' | 'cost' | 'coverage' | 'gp' | 'capacity' | 'sensitivity' | 'log';

function ScenarioList({ current }: { current: string }) {
  const ws = useWorkspace();
  return (
    <div class="scenario-list">
      {ws.scenarios.map((s) => (
        <a
          key={s.id}
          href={`#/scenarios/edit/${s.id}`}
          class={s.id === current ? 'active' : ''}
          onClick={(e) => {
            e.preventDefault();
            setUi({ activeScenarioId: s.id });
            navigate(`/scenarios/edit/${s.id}`);
          }}
        >
          <span class="swatch" style={`background:${scenarioStyle(ws, s.id).color}`} />
          {s.name}
        </a>
      ))}
      <div class="row" style="margin-top:10px">
        <button
          class="btn small"
          onClick={() => {
            const id = newId('sc');
            update((w) => w.scenarios.push({ id, name: 'New scenario', description: '', changes: [], gates: [] }), 'Added scenario');
            setUi({ activeScenarioId: id });
            navigate(`/scenarios/edit/${id}`);
          }}
        >
          New
        </button>
        <button
          class="btn small"
          onClick={() => {
            const src = ws.scenarios.find((s) => s.id === current);
            if (!src) return;
            const id = newId('sc');
            update((w) => w.scenarios.push({ ...structuredClone(src), id, name: `${src.name} (copy)`, locked: false }), 'Duplicated scenario');
            setUi({ activeScenarioId: id });
            navigate(`/scenarios/edit/${id}`);
          }}
        >
          Duplicate
        </button>
      </div>
    </div>
  );
}

function Outputs({ r, tab, setTab }: { r: ScenarioResult; tab: OutTab; setTab: (t: OutTab) => void }) {
  const ws = useWorkspace();
  return (
    <div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', title: 'Summary' },
          { id: 'headcount', title: 'Headcount' },
          { id: 'cost', title: 'Cost' },
          { id: 'coverage', title: 'Coverage' },
          { id: 'gp', title: 'GP and payback' },
          { id: 'capacity', title: 'Capacity' },
          { id: 'sensitivity', title: 'Sensitivity' },
          { id: 'log', title: 'Changes and gates' },
        ]}
      />
      {tab === 'summary' && (
        <div class="stack">
          <SummaryKpis ws={ws} r={r} />
          <AnnualTable ws={ws} r={r} />
        </div>
      )}
      {tab === 'headcount' && <HeadcountView ws={ws} r={r} />}
      {tab === 'cost' && <CostView ws={ws} r={r} />}
      {tab === 'coverage' && <CoverageView ws={ws} r={r} />}
      {tab === 'gp' && <GpView ws={ws} r={r} />}
      {tab === 'capacity' && <CapacityView ws={ws} r={r} />}
      {tab === 'sensitivity' && <SensitivityView ws={ws} r={r} />}
      {tab === 'log' && (
        <div class="grid2">
          <div>
            <h3>Changes</h3>
            <table class="data">
              <thead>
                <tr>
                  <th>Planned</th>
                  <th>Applied</th>
                  <th>Change</th>
                  <th>From</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {r.changes.map((c) => (
                  <tr key={`${c.origin}:${c.changeId}`}>
                    <td>M{c.plannedMonth}</td>
                    <td>{c.actualMonth != null ? `M${c.actualMonth}` : ''}</td>
                    <td>{c.label}</td>
                    <td class="small">{ws.scenarios.find((s) => s.id === c.origin)?.name}</td>
                    <td>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Gate outcomes</h3>
            {r.gates.length === 0 ? (
              <p class="muted">No gates evaluated.</p>
            ) : (
              <table class="data">
                <tbody>
                  {r.gates.map((g, i) => (
                    <tr key={i}>
                      <td>M{g.month}</td>
                      <td>{g.gateName}</td>
                      <td>
                        <span class={`badge ${g.pass ? 'pass' : 'fail'}`}>{g.pass ? 'pass' : 'miss'}</span>
                      </td>
                      <td class="small">
                        {g.reason}
                        {g.final === 'dropped' ? '. Changes dropped.' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.warnings.length > 0 && (
              <>
                <h3 style="margin-top:12px">Warnings</h3>
                <ul class="small">
                  {r.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Editor({ params }: ViewProps) {
  const ws = useWorkspace();
  const fallback = useActiveScenario(ws);
  const sc: Scenario = ws.scenarios.find((s) => s.id === params[0]) ?? fallback;
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<OutTab>('summary');
  const [side, setSide] = useState<'changes' | 'gates' | 'inherit'>('changes');
  const [wide, setWide] = useState(false);
  const r = run(ws, sc.id);
  const result = r instanceof Error ? null : r;
  const eff = effectiveChanges(ws, sc.id);
  const selected = sel ? eff.find((e) => e.change.id === sel)?.change : undefined;
  const reg = changeRegistry();
  const months = wide ? ws.settings.horizonMonths : ws.settings.viewMonths;
  const edit = (fn: (s: Scenario) => void, label: string, coalesce?: string) =>
    update((w) => {
      const s = w.scenarios.find((x) => x.id === sc.id);
      if (s) fn(s);
    }, label, coalesce ? { coalesce } : undefined);

  return (
    <div class="scenario-layout">
      <ScenarioList current={sc.id} />
      <div class="stack" style="min-width:0">
        <div class="row" style="align-items:flex-end">
          <div style="flex:1;min-width:280px">
            <Field label="Scenario name">
              <TextInput value={sc.name} onChange={(v) => edit((s) => (s.name = v), 'Renamed scenario', `name-${sc.id}`)} disabled={sc.locked} aria-label="Scenario name" />
            </Field>
          </div>
          <button class="btn" onClick={() => navigate(`/print/scenario/${sc.id}`)}>
            Print summary
          </button>
          {sc.id !== ws.baselineScenarioId && (
            <button
              class="btn danger"
              onClick={() => {
                if (!confirm(`Delete scenario "${sc.name}"? You can undo.`)) return;
                update((w) => {
                  w.scenarios = w.scenarios.filter((x) => x.id !== sc.id);
                  w.scenarios.forEach((x) => (x.inherits = x.inherits?.filter((g) => g.scenarioId !== sc.id)));
                }, 'Deleted scenario');
                navigate('/scenarios');
              }}
            >
              Delete
            </button>
          )}
        </div>
        <Field label="Description">
          <TextInput value={sc.description} onChange={(v) => edit((s) => (s.description = v), 'Edited description', `desc-${sc.id}`)} disabled={sc.locked} />
        </Field>
        {sc.locked && <div class="callout">The baseline is current data plus assumptions. It has no changes; build scenarios on top of it.</div>}
        {r instanceof Error && <ErrorBox error={r} />}
        {result && result.conflicts.length > 0 && (
          <div class="callout warn small">
            Outputs depend on Conflict assumptions: {result.conflicts.join(', ')}. Numbers that use them show a ! flag.
          </div>
        )}

        <div class="row">
          <Tabs
            value={side}
            onChange={setSide}
            tabs={[
              { id: 'changes', title: `Timeline (${eff.length})` },
              { id: 'gates', title: `Gates (${sc.gates.length})` },
              { id: 'inherit', title: `Inheritance (${sc.inherits?.length ?? 0})` },
            ]}
          />
          <span style="flex:1" />
          {side === 'changes' && (
            <>
              <label class="small row">
                <input type="checkbox" checked={wide} onChange={(e) => setWide((e.target as HTMLInputElement).checked)} /> Show {ws.settings.horizonMonths} months
              </label>
              {!sc.locked && (
                <select
                  class="text"
                  style="width:auto"
                  aria-label="Add a change"
                  value=""
                  onChange={(e) => {
                    const type = (e.target as HTMLSelectElement).value;
                    if (!type) return;
                    const t = reg.get(type)!;
                    const id = newId('chg');
                    edit((s) => s.changes.push({ id, type, month: 0, params: t.defaults(ws) as Record<string, unknown> }), `Added ${t.label}`);
                    setSel(id);
                    (e.target as HTMLSelectElement).value = '';
                  }}
                >
                  <option value="">Add a change...</option>
                  {[...reg.values()].map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
        {side === 'changes' && (
          <>
            <Timeline ws={ws} sc={sc} result={result} months={months} selectedId={sel} onSelect={setSel} />
            <p class="small muted" style="margin:0">
              Drag a chip, or focus it and use the arrow keys, to change its month. Dashed chips are inherited. A diamond marks a gated change; an orange line shows a change held by a missed gate.
            </p>
            {selected && <ChangeForm ws={ws} sc={sc} change={selected} result={result} onClose={() => setSel(null)} />}
          </>
        )}
        {side === 'gates' && <GatesEditor ws={ws} sc={sc} result={result} />}
        {side === 'inherit' && <InheritEditor ws={ws} sc={sc} />}

        {result ? <Outputs r={result} tab={tab} setTab={setTab} /> : <Empty>No results.</Empty>}
      </div>
    </div>
  );
}

export const scenariosModule: ModuleManifest = {
  id: 'scenarios',
  title: 'Scenarios',
  icon: 'M4 6h16M4 12h10M4 18h6M17 14l3 3-3 3',
  navOrder: 10,
  views: [{ id: 'edit', title: 'Editor', component: Editor }],
};
