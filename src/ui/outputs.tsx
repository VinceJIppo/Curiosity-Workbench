// Scenario output views, shared by the scenario editor, compare and print views.
import { useState } from 'preact/hooks';
import type { Workspace } from '../core/schema/types';
import type { ScenarioResult } from '../core/engine/types';
import { explainMonth, explainSummary } from '../core/engine/explain';
import { money, num, pct, ratio1 } from '../core/format';
import { LineChart, StackedBar, Tornado } from '../charts/Charts';
import { SERIES, DASHES } from '../charts/palette';
import { getRun, changeRegistry } from '../app/engine';
import { tornado, TORNADO_METRICS, type TornadoResult } from '../core/engine/sensitivity';
import { Num } from './math';
import { Select } from './components';

const cumulative = (xs: number[]) => {
  let t = 0;
  return xs.map((x) => (t += x));
};

const span = (ws: Workspace, r: ScenarioResult, months?: number) => r.rows.filter((x) => x.month <= (months ?? ws.settings.viewMonths));

export function SummaryKpis({ ws, r, highlight = true }: { ws: Workspace; r: ScenarioResult; highlight?: boolean }) {
  const s = r.summary;
  const vm = s.viewMonths;
  const isBase = r.scenarioId === ws.baselineScenarioId;
  const items: { label: string; key: string; text?: string; key2?: boolean; sub?: string }[] = [
    { label: '24-month incremental cost', key: 'inc2y', text: money(s.inc2y), key2: true },
    { label: '36-month incremental cost', key: 'inc3y', text: money(s.inc3y) },
    { label: '24-month incremental GP', key: 'incGP2y', text: money(s.incGP2y) },
    { label: 'Payback month', key: 'paybackMonth', text: isBase ? 'n/a' : s.paybackMonth == null ? 'None' : `M${s.paybackMonth}` },
    { label: `ROI, months 0 to ${vm - 1}`, key: 'roiView', text: pct(s.roiView) },
    { label: 'Company GP, year 1', key: 'companyGP1y', text: money(s.companyGP1y) },
    { label: 'Specialty GP, year 1', key: 'specialtyGP1y', text: `${money(s.specialtyGP1y)} (${pct(s.specialtyShare1y, 1)})` },
    { label: '24-month specialist GP from the office', key: 'officeGP2y', text: money(s.officeGP2y) },
    { label: '24-month GP from large pursuits', key: 'pursuitsGP2y', text: money(s.pursuitsGP2y) },
    { label: 'Large pursuits payback', key: 'pursuitsPaybackMonth', text: s.pursuitsGP2y === 0 && s.pursuitsCost2y === 0 ? 'n/a' : s.pursuitsPaybackMonth == null ? 'None' : `M${s.pursuitsPaybackMonth}` },
    { label: 'Break-even GP per large deal', key: 'pursuitsBreakEvenDealGP', text: money(s.pursuitsBreakEvenDealGP) },
    { label: `Break-even GP over ${vm} months`, key: 'breakEvenGP', text: money(s.breakEvenGP) },
    { label: 'Break-even specialist-touched GP', key: 'breakEvenTouchedGP', text: money(s.breakEvenTouchedGP) },
    { label: `Sellers per specialist, M${vm}`, key: 'coverageAtView', text: ratio1(s.coverageAtView) },
    { label: `Sellers per architect, M${vm}`, key: 'architectCoverageAtView', text: ratio1(s.architectCoverageAtView) },
    { label: '2-year total cost', key: 'cost2y', text: money(s.cost2y) },
    { label: '3-year total cost', key: 'cost3y', text: money(s.cost3y) },
  ];
  return (
    <div class="kpis">
      {items.map((it) => (
        <div class="kpi" key={it.key}>
          <div class="label">{it.label}</div>
          <div class="value">
            <Num trace={explainSummary(ws, r, it.key)} text={it.text} cls={highlight && it.key2 ? 'key-number' : ''} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnnualTable({ ws, r }: { ws: Workspace; r: ScenarioResult }) {
  const s = r.summary;
  return (
    <table class="data">
      <thead>
        <tr>
          <th>Year</th>
          <th class="num">Total cost</th>
          <th class="num">Incremental cost</th>
          <th class="num">Incremental GP</th>
          <th class="num">Net</th>
          <th class="num">Specialists at year end</th>
          <th class="num">Sellers per specialist at year end</th>
        </tr>
      </thead>
      <tbody>
        {s.costByYear.map((c, y) => {
          const end = r.rows[Math.min((y + 1) * 12, r.rows.length - 1)];
          return (
            <tr key={y}>
              <td>Year {y + 1} (M{y * 12} to M{y * 12 + 11})</td>
              <td class="num">{money(c)}</td>
              <td class="num">{money(s.incCostByYear[y])}</td>
              <td class="num">{money(s.gpByYear[y])}</td>
              <td class="num">{money(s.gpByYear[y] - s.incCostByYear[y])}</td>
              <td class="num">
                <Num trace={explainMonth(ws, r, 'specialists', end.month)} text={num(end.specialists, 1)} />
              </td>
              <td class="num">
                <Num trace={explainMonth(ws, r, 'sellersPerSpecialist', end.month)} text={ratio1(end.sellersPerSpecialist)} />
              </td>
            </tr>
          );
        })}
        <tr>
          <td>
            <b>2-year total</b>
          </td>
          <td class="num">
            <Num trace={explainSummary(ws, r, 'cost2y')} text={money(s.cost2y)} />
          </td>
          <td class="num">
            <Num trace={explainSummary(ws, r, 'inc2y')} text={money(s.inc2y)} />
          </td>
          <td class="num">
            <Num trace={explainSummary(ws, r, 'incGP2y')} text={money(s.incGP2y)} />
          </td>
          <td class="num">{money(s.incGP2y - s.inc2y)}</td>
          <td />
          <td />
        </tr>
        <tr>
          <td>
            <b>3-year total</b>
          </td>
          <td class="num">
            <Num trace={explainSummary(ws, r, 'cost3y')} text={money(s.cost3y)} />
          </td>
          <td class="num">
            <Num trace={explainSummary(ws, r, 'inc3y')} text={money(s.inc3y)} />
          </td>
          <td class="num">{money(s.incGP3y)}</td>
          <td class="num">{money(s.incGP3y - s.inc3y)}</td>
          <td />
          <td />
        </tr>
      </tbody>
    </table>
  );
}

export function HeadcountView({ ws, r }: { ws: Workspace; r: ScenarioResult }) {
  const rows = span(ws, r);
  const roles = [...new Set(rows.flatMap((x) => Object.keys(x.headcountByRole)))];
  const m = Math.min(ws.settings.viewMonths, r.rows.length - 1);
  const at = r.rows[m];
  const reqRows = rows.filter((x) => x.openReqs > 0);
  return (
    <div class="stack">
      <StackedBar title={`Headcount by role family: ${r.scenarioName}`} subtitle="FTE by month" x={rows.map((x) => x.month)} stacks={roles.map((k) => ({ name: k, values: rows.map((x) => x.headcountByRole[k] ?? 0) }))} yFormat={(v) => num(v)} />
      <div class="grid3">
        <div>
          <h3>By practice at M{m}</h3>
          <table class="data">
            <tbody>
              {Object.entries(at.headcountByPractice)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>{ws.entities.practices.find((p) => p.id === k)?.name ?? k}</td>
                    <td class="num">{num(v, 1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>By team at M{m}</h3>
          <table class="data">
            <tbody>
              {Object.entries(at.headcountByTeam)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>{ws.entities.territories.find((t) => t.id === k)?.name ?? k}</td>
                    <td class="num">{num(v, 1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>Open reqs</h3>
          {reqRows.length === 0 ? (
            <p class="muted small">No open reqs in the view window.</p>
          ) : (
            <table class="data">
              <tbody>
                {reqRows.map((x) => (
                  <tr key={x.month}>
                    <td>M{x.month}</td>
                    <td>{Object.entries(x.openReqsByRole).map(([k, v]) => `${v} ${k}`).join(', ')}</td>
                    <td class="num">
                      <Num trace={explainMonth(ws, r, 'openReqs', x.month)} text={num(x.openReqs)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function CostView({ ws, r }: { ws: Workspace; r: ScenarioResult }) {
  const rows = span(ws, r);
  const lo = getRun(ws, r.scenarioId, 'low');
  const hi = getRun(ws, r.scenarioId, 'high');
  const band = !(lo instanceof Error) && !(hi instanceof Error);
  const cum = (rs: ScenarioResult['rows']) => rs.filter((x) => x.month <= ws.settings.viewMonths).map((x) => x.cumIncCost);
  const m = Math.min(ws.settings.viewMonths, r.rows.length - 1);
  return (
    <div class="stack">
      <LineChart
        title={`Cumulative incremental cost vs baseline: ${r.scenarioName}`}
        subtitle={`${r.caseKey} case, band shows all assumptions at low and at high`}
        x={rows.map((x) => x.month)}
        series={[{ name: 'Cumulative incremental cost', values: rows.map((x) => x.cumIncCost), color: SERIES[0] }]}
        bands={band ? [{ name: 'Low to high', lo: cum((lo as ScenarioResult).rows).map((v, i) => Math.min(v, cum((hi as ScenarioResult).rows)[i])), hi: cum((lo as ScenarioResult).rows).map((v, i) => Math.max(v, cum((hi as ScenarioResult).rows)[i])) }] : []}
        yFormat={money}
      />
      <LineChart
        title={`Monthly cost: ${r.scenarioName}`}
        subtitle="Loaded people cost, external services and total"
        x={rows.map((x) => x.month)}
        series={[
          { name: 'People', values: rows.map((x) => x.peopleCost), color: SERIES[0], dash: DASHES[0] },
          { name: 'External services', values: rows.map((x) => x.servicesCost), color: SERIES[1], dash: DASHES[1] },
          { name: 'Incremental vs baseline', values: rows.map((x) => x.incCost), color: SERIES[2], dash: DASHES[2] },
        ]}
        yFormat={money}
      />
      <p class="small">
        Month {m}: people <Num trace={explainMonth(ws, r, 'peopleCost', m)} text={money(r.rows[m].peopleCost)} />, services <Num trace={explainMonth(ws, r, 'servicesCost', m)} text={money(r.rows[m].servicesCost)} />, incremental{' '}
        <Num trace={explainMonth(ws, r, 'incCost', m)} text={money(r.rows[m].incCost)} />.
      </p>
      <AnnualTable ws={ws} r={r} />
    </div>
  );
}

export function CoverageView({ ws, r }: { ws: Workspace; r: ScenarioResult }) {
  const rows = span(ws, r);
  const ref = r.resolution.get('coverage_reference');
  const strain = r.resolution.get('coverage_strain');
  const m = Math.min(ws.settings.viewMonths, r.rows.length - 1);
  const at = r.rows[m];
  return (
    <div class="stack">
      <LineChart
        title={`Coverage: ${r.scenarioName}`}
        subtitle="Sellers per specialist and per architect. Lower is more coverage."
        x={rows.map((x) => x.month)}
        series={[
          { name: 'Sellers per specialist', values: rows.map((x) => x.sellersPerSpecialist), color: SERIES[0], dash: DASHES[0] },
          { name: 'Sellers per architect', values: rows.map((x) => x.sellersPerArchitect), color: SERIES[1], dash: DASHES[1] },
        ]}
        refLines={[
          ...(Number.isFinite(ref) ? [{ y: ref, label: `1:${ref} reference` }] : []),
          ...(Number.isFinite(strain) ? [{ y: strain, label: `1:${strain} strain line` }] : []),
        ]}
        yFormat={(v) => v.toFixed(1)}
      />
      <div class="kpis">
        <div class="kpi">
          <div class="label">Sellers per specialist, M{m}</div>
          <div class="value">
            <Num trace={explainMonth(ws, r, 'sellersPerSpecialist', m)} text={ratio1(at.sellersPerSpecialist)} />
          </div>
        </div>
        <div class="kpi">
          <div class="label">Sellers per architect, M{m}</div>
          <div class="value">
            <Num trace={explainMonth(ws, r, 'sellersPerArchitect', m)} text={ratio1(at.sellersPerArchitect)} />
          </div>
        </div>
        <div class="kpi">
          <div class="label">Specialists, M{m}</div>
          <div class="value">
            <Num trace={explainMonth(ws, r, 'specialists', m)} text={num(at.specialists, 1)} />
          </div>
        </div>
        <div class="kpi">
          <div class="label">Needed at 1:{strain}</div>
          <div class="value">
            <Num trace={explainMonth(ws, r, 'specialistsNeededStrain', m)} />
          </div>
        </div>
        <div class="kpi">
          <div class="label">Needed at 1:{ref}</div>
          <div class="value">
            <Num trace={explainMonth(ws, r, 'specialistsNeededReference', m)} />
          </div>
        </div>
      </div>
      <h3>Specialists per practice at M{m}</h3>
      <table class="data" style="max-width:520px">
        <tbody>
          {Object.entries(at.specialistsPerPractice)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => (
              <tr key={k}>
                <td>{ws.entities.practices.find((p) => p.id === k)?.name ?? k}</td>
                <td class="num">{num(v, 2)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function GpView({ ws, r }: { ws: Workspace; r: ScenarioResult }) {
  const rows = span(ws, r);
  const m = Math.min(ws.settings.viewMonths, r.rows.length - 1);
  const pb = r.summary.paybackMonth;
  return (
    <div class="stack">
      <LineChart
        title={`GP impact vs cost: ${r.scenarioName}`}
        subtitle="Cumulative incremental GP (driver based) and cumulative incremental cost"
        x={rows.map((x) => x.month)}
        series={[
          { name: 'Cumulative incremental GP', values: rows.map((x) => x.cumIncGP), color: SERIES[0], dash: DASHES[0] },
          { name: 'Cumulative incremental cost', values: rows.map((x) => x.cumIncCost), color: SERIES[1], dash: DASHES[1] },
        ]}
        markers={pb != null && pb > 0 && pb <= ws.settings.viewMonths ? [{ x: pb, label: `Payback M${pb}` }] : []}
        yFormat={money}
      />
      <LineChart
        title={`Where the GP comes from: ${r.scenarioName}`}
        subtitle="Cumulative GP: office effectiveness on specialists, and large pursuits"
        x={rows.map((x) => x.month)}
        series={[
          { name: 'Specialist GP from the office', values: cumulative(rows.map((x) => x.officeGP)), color: SERIES[0], dash: DASHES[0] },
          { name: 'Large pursuits GP', values: rows.map((x) => x.cumPursuitsGP), color: SERIES[1], dash: DASHES[1] },
          { name: 'Time spent on pursuits', values: rows.map((x) => x.cumPursuitsCost), color: SERIES[4], dash: DASHES[4] },
        ]}
        markers={r.summary.pursuitsPaybackMonth != null && r.summary.pursuitsPaybackMonth <= ws.settings.viewMonths ? [{ x: r.summary.pursuitsPaybackMonth, label: `Pursuits payback M${r.summary.pursuitsPaybackMonth}` }] : []}
        yFormat={money}
      />
      <p class="small">
        Office effectiveness at M{m}: <Num trace={explainMonth(ws, r, 'effectiveness', m)} text={`${r.rows[m].effectiveness.toFixed(2)}x`} />. Large pursuits GP at M{m}: <Num trace={explainMonth(ws, r, 'pursuitsGP', m)} text={money(r.rows[m].pursuitsGP)} /> a month for <Num trace={explainMonth(ws, r, 'pursuitsCost', m)} text={money(r.rows[m].pursuitsCost)} /> of time.
      </p>
      <p class="small">
        GP uplift at M{m}: <Num trace={explainMonth(ws, r, 'gpUplift', m)} text={money(r.rows[m].gpUplift)} /> a month. Incremental vs baseline: <Num trace={explainMonth(ws, r, 'incGP', m)} text={money(r.rows[m].incGP)} />. Cumulative net:{' '}
        <Num trace={explainMonth(ws, r, 'cumNet', m)} text={money(r.rows[m].cumNet)} />.
      </p>
      <SummaryKpis ws={ws} r={r} highlight={false} />
    </div>
  );
}

export function CapacityView({ ws, r }: { ws: Workspace; r: ScenarioResult }) {
  const rows = span(ws, r);
  const dests = [...new Set(rows.flatMap((x) => Object.keys(x.capacityByDestination)))];
  const m = Math.min(ws.settings.viewMonths, r.rows.length - 1);
  if (!dests.length) return <p class="muted">No tier shifts in this scenario. Add a "Shift work between tiers" change to model self-service.</p>;
  return (
    <div class="stack">
      <StackedBar title={`Hours freed by tier shifts: ${r.scenarioName}`} subtitle="Where the freed capacity goes, hours per month" x={rows.map((x) => x.month)} stacks={dests.map((d) => ({ name: d, values: rows.map((x) => x.capacityByDestination[d] ?? 0) }))} yFormat={(v) => num(v)} />
      <p class="small">
        M{m}: <Num trace={explainMonth(ws, r, 'hoursFreed', m)} text={`${num(r.rows[m].hoursFreed)} hours`} /> freed, about <Num trace={explainMonth(ws, r, 'fteFreed', m)} text={`${num(r.rows[m].fteFreed, 1)} FTE`} />.
      </p>
    </div>
  );
}

export function SensitivityView({ ws, r }: { ws: Workspace; r: ScenarioResult }) {
  const [metric, setMetric] = useState('netView');
  const [res, setRes] = useState<{ key: string; t: TornadoResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `${r.scenarioId}|${metric}|${ws.updatedAt}|${ws.settings.caseKey}`;
  const meta = TORNADO_METRICS[metric];
  const compute = () => {
    setBusy(true);
    setTimeout(() => {
      setRes({ key, t: tornado(ws, r.scenarioId, metric, ws.settings.caseKey, 10, changeRegistry()) });
      setBusy(false);
    }, 10);
  };
  const fmt = meta.unit === '$' ? money : (v: number) => ratio1(v);
  return (
    <div class="stack">
      <div class="row">
        <span class="small muted">Metric</span>
        <Select value={metric} options={Object.keys(TORNADO_METRICS)} labels={Object.fromEntries(Object.entries(TORNADO_METRICS).map(([k, v]) => [k, v.label]))} onChange={(v) => setMetric(v || 'netView')} />
        <button class="btn primary" onClick={compute} disabled={busy}>
          {busy ? 'Running...' : res?.key === key ? 'Rerun' : 'Run sensitivity'}
        </button>
        <span class="small muted">Moves each assumption to its low and high bound, one at a time, holding the rest at the {ws.settings.caseKey} case.</span>
      </div>
      {res && res.key === key && (
        <Tornado
          title={`Sensitivity: ${meta.label}`}
          subtitle={`${r.scenarioName}, top ${res.t.bars.length} assumptions`}
          base={res.t.base}
          bars={res.t.bars.map((b) => ({ label: `${b.id} ${b.label}`, atLow: b.atLow, atHigh: b.atHigh, lowInput: String(b.lowInput), highInput: String(b.highInput) }))}
          format={fmt}
        />
      )}
    </div>
  );
}
