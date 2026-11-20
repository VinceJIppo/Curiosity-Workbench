import { useState } from 'preact/hooks';
import type { ModuleManifest } from '../../app/module';
import { update, useWorkspace } from '../../app/store';
import { getEntitySchema } from '../../core/schema/registry';
import { ROLE_FAMILIES } from '../../core/schema/types';
import { buildVsBuy } from '../../core/engine/buildbuy';
import { BINDINGS } from '../../core/engine/bindings';
import { money, moneyFull, moneyRange } from '../../core/format';
import { EntityTable } from '../../ui/EntityTable';
import { Field, NumberInput, Select } from '../../ui/components';
import { Num } from '../../ui/math';
import { LineChart } from '../../charts/Charts';
import { SERIES, DASHES } from '../../charts/palette';
import { resolveAssumptions } from '../../core/assumptions/resolve';
import { newId } from '../shared';

function People() {
  const ws = useWorkspace();
  const [role, setRole] = useState('');
  const res = resolveAssumptions(ws.assumptions, { caseKey: ws.settings.caseKey, bindings: ws.settings.bindings });
  const burden = res.get('burden_pct');
  const active = ws.entities.people.filter((p) => p.status !== 'open req');
  const loaded = active.reduce((s, p) => s + (p.base + p.variableTarget) * (p.fte ?? 1) * (1 + (p.burdenPct ?? burden)), 0);
  const counts = ROLE_FAMILIES.map((r) => [r, ws.entities.people.filter((p) => p.roleFamily === r).reduce((s, p) => s + (p.fte ?? 1), 0)] as const).filter(([, n]) => n > 0);
  return (
    <div class="stack">
      <div class="row">
        {counts.map(([r, n]) => (
          <button key={r} class={`btn small ${role === r ? 'primary' : ''}`} onClick={() => setRole(role === r ? '' : r)}>
            {r}: {n}
          </button>
        ))}
      </div>
      <p class="small muted">
        Annual loaded cost of the roster today: <b>{money(loaded)}</b> (base + variable, times FTE, times 1 + burden; default burden {Number.isFinite(burden) ? `${(burden * 100).toFixed(1)}%` : 'not bound'}). Comp is hidden until you tick Show comp.
      </p>
      <EntityTable
        title="People"
        schema={getEntitySchema('person')!}
        columns={['name', 'title', 'roleFamily', 'territory', 'team', 'practices', 'managerId', 'base', 'variableTarget', 'burdenPct', 'fte', 'status', 'startMonth', 'endMonth']}
        filter={role ? (r) => r.roleFamily === role : undefined}
        maskSensitive
        newRow={() => ({ id: newId('p'), name: 'New person', title: '', roleFamily: role || 'Other', practices: [], base: 0, variableTarget: 0, fte: 1, status: 'current' })}
      />
    </div>
  );
}

function Services() {
  return (
    <div class="stack">
      <p class="muted small">
        Price per pricing unit: total for fixed, per month for a retainer, per year for a subscription, per unit or hour, or a fraction of revenue. When "Price from assumption" is set, the register supplies low, base and high. Start a service in a scenario with a "Start an external service" change.
      </p>
      <EntityTable
        title="External services"
        schema={getEntitySchema('externalService')!}
        newRow={() => ({ id: newId('svc'), vendor: 'Vendor', name: 'New service', category: 'diagnostic', pricingModel: 'fixed', low: 0, base: 0, high: 0, termMonths: null, startMonth: null })}
      />
    </div>
  );
}

function Org() {
  return (
    <div class="grid2">
      <div>
        <h3>Territories</h3>
        <EntityTable title="Territories" schema={getEntitySchema('territory')!} newRow={() => ({ id: newId('t'), name: 'New territory', regionalDirectors: [] })} />
      </div>
      <div>
        <h3>Practices and lines</h3>
        <EntityTable title="Practices" schema={getEntitySchema('practice')!} newRow={() => ({ id: newId('pr'), name: 'New line', type: 'OEM line' })} />
      </div>
    </div>
  );
}

interface BvbState {
  compKey: string;
  wageShareKey: string;
  count: number;
  months: number;
  serviceIds: string[];
}

function BuildVsBuy() {
  const ws = useWorkspace();
  const saved = ws.modules.people as { bvb?: BvbState } | undefined;
  const st: BvbState = saved?.bvb ?? { compKey: 'director_comp', wageShareKey: 'wage_share', count: 2, months: 24, serviceIds: ws.entities.externalServices.filter((s) => ['diagnostic', 'fractional leader', 'benchmark subscription'].includes(s.category)).map((s) => s.id) };
  const set = (patch: Partial<BvbState>) => update((w) => (w.modules.people = { ...((w.modules.people as object) ?? {}), bvb: { ...st, ...patch } }), 'Edited build vs buy', { coalesce: 'bvb' });
  const r = buildVsBuy(ws, st);
  const keys = [...BINDINGS.map((b) => b.key), ...ws.assumptions.map((a) => a.id)];
  const labels = Object.fromEntries([...BINDINGS.map((b) => [b.key, `${b.label} (binding)`]), ...ws.assumptions.map((a) => [a.id, `${a.id} ${a.label}`])]);
  const x = Array.from({ length: st.months + 1 }, (_, i) => i);
  const cumBuild = (b: typeof r.low) => x.map((m) => (st.count * b.perHireLoaded * m) / 12);
  // Cumulative buy by month from each service's cost.
  const cumBuy = (bound: 'low' | 'high') => x.map((m) => buildVsBuy(ws, { ...st, months: m })[bound].buy);
  return (
    <div class="stack">
      <p class="muted">Compare hiring a role with buying the outcome. Loaded cost per hire = cash comp / wage share. Ranges use every assumption at its low and at its high bound.</p>
      <div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <Field label="Role comp (assumption)">
          <Select value={st.compKey} options={keys} labels={labels} onChange={(v) => set({ compKey: v || 'director_comp' })} />
        </Field>
        <Field label="Wage share (assumption)">
          <Select value={st.wageShareKey} options={keys} labels={labels} onChange={(v) => set({ wageShareKey: v || 'wage_share' })} />
        </Field>
        <Field label="Hires">
          <NumberInput value={st.count} onChange={(v) => set({ count: Math.max(1, Math.round(v ?? 1)) })} />
        </Field>
        <Field label="Months">
          <NumberInput value={st.months} onChange={(v) => set({ months: Math.max(1, Math.min(60, Math.round(v ?? 24))) })} />
        </Field>
      </div>
      <div>
        <span class="small muted">Buy package: </span>
        {ws.entities.externalServices.map((s) => (
          <label key={s.id} class="small" style="margin-right:12px">
            <input type="checkbox" checked={st.serviceIds.includes(s.id)} onChange={(e) => set({ serviceIds: (e.target as HTMLInputElement).checked ? [...st.serviceIds, s.id] : st.serviceIds.filter((x) => x !== s.id) })} /> {s.name}
          </label>
        ))}
      </div>
      <div class="grid2">
        <div class="card">
          <h3>Build</h3>
          <div class="kpi">
            <div class="label">Loaded cost per hire, per year</div>
            <div class="value">
              {moneyFull(r.low.perHireLoaded)} to {moneyFull(r.high.perHireLoaded)}
            </div>
          </div>
          <div class="kpi" style="margin-top:10px">
            <div class="label">
              {st.count} hires over {st.months} months
            </div>
            <div class="value">
              <Num trace={r.traces.build} text={moneyRange(r.low.build, r.high.build)} cls="key-number" />
            </div>
            <div class="sub">
              {moneyFull(r.low.build)} to {moneyFull(r.high.build)}. Base {money(r.base.build)}.
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Buy</h3>
          <div class="kpi">
            <div class="label">Year one</div>
            <div class="value">{moneyRange(r.low.buyYear1, r.high.buyYear1)}</div>
          </div>
          <div class="kpi" style="margin-top:10px">
            <div class="label">Over {st.months} months</div>
            <div class="value">
              <Num trace={r.traces.buy} text={moneyRange(r.low.buy, r.high.buy)} />
            </div>
            <div class="sub">
              {r.base.buyByService.map((s, i) => (
                <div key={s.id}>
                  {s.name}: {moneyRange(r.low.buyByService[i].cost, r.high.buyByService[i].cost)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <LineChart
        title="Build vs buy, cumulative cost"
        subtitle={`${st.count} hires vs the buy package, low and high bounds`}
        x={x}
        series={[
          { name: 'Build (high)', values: cumBuild(r.high), color: SERIES[0], dash: DASHES[0] },
          { name: 'Build (low)', values: cumBuild(r.low), color: SERIES[0], dash: DASHES[2] },
          { name: 'Buy (high)', values: cumBuy('high'), color: SERIES[1], dash: DASHES[1] },
          { name: 'Buy (low)', values: cumBuy('low'), color: SERIES[1], dash: DASHES[4] },
        ]}
        yFormat={money}
      />
    </div>
  );
}

export const peopleModule: ModuleManifest = {
  id: 'people',
  title: 'People and services',
  icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a7 7 0 0 1 14 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-4-4.9',
  navOrder: 40,
  views: [
    { id: 'roster', title: 'People', component: People },
    { id: 'services', title: 'External services', component: Services },
    { id: 'org', title: 'Territories and practices', component: Org },
    { id: 'buildbuy', title: 'Build vs buy', component: BuildVsBuy },
  ],
};
