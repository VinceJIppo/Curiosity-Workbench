// Comparison table and charts, shared by the compare module and the print view.
import type { Workspace } from '../core/schema/types';
import type { ScenarioResult } from '../core/engine/types';
import { explainSummary } from '../core/engine/explain';
import { money, pct, ratio1, num } from '../core/format';
import { LineChart } from '../charts/Charts';
import { scenarioColor, scenarioDash } from '../charts/palette';
import { Num } from './math';

export function scenarioStyle(ws: Workspace, id: string) {
  const isBase = id === ws.baselineScenarioId;
  const i = ws.scenarios.filter((s) => s.id !== ws.baselineScenarioId).findIndex((s) => s.id === id);
  return { color: scenarioColor(Math.max(0, i), isBase), dash: scenarioDash(Math.max(0, i), isBase) };
}

export const COMPARE_ROWS: { label: string; key: string; fmt: (r: ScenarioResult) => string }[] = [
  { label: '24-month incremental cost', key: 'inc2y', fmt: (r) => money(r.summary.inc2y) },
  { label: '36-month incremental cost', key: 'inc3y', fmt: (r) => money(r.summary.inc3y) },
  { label: '2-year total cost', key: 'cost2y', fmt: (r) => money(r.summary.cost2y) },
  { label: '3-year total cost', key: 'cost3y', fmt: (r) => money(r.summary.cost3y) },
  { label: '24-month incremental GP', key: 'incGP2y', fmt: (r) => money(r.summary.incGP2y) },
  { label: 'Company GP, year 1', key: 'companyGP1y', fmt: (r) => money(r.summary.companyGP1y) },
  { label: 'Specialty GP, year 1', key: 'specialtyGP1y', fmt: (r) => `${money(r.summary.specialtyGP1y)} (${pct(r.summary.specialtyShare1y, 1)})` },
  { label: '24-month specialist GP from the office', key: 'officeGP2y', fmt: (r) => money(r.summary.officeGP2y) },
  { label: '24-month GP from large pursuits', key: 'pursuitsGP2y', fmt: (r) => money(r.summary.pursuitsGP2y) },
  { label: 'Large pursuits payback', key: 'pursuitsPaybackMonth', fmt: (r) => (r.summary.pursuitsGP2y === 0 && r.summary.pursuitsCost2y === 0 ? 'n/a' : r.summary.pursuitsPaybackMonth == null ? 'None' : `M${r.summary.pursuitsPaybackMonth}`) },
  { label: 'Payback month', key: 'paybackMonth', fmt: (r) => (r.summary.paybackMonth == null ? 'None' : `M${r.summary.paybackMonth}`) },
  { label: 'ROI over view', key: 'roiView', fmt: (r) => pct(r.summary.roiView) },
  { label: 'Break-even specialist-touched GP', key: 'breakEvenTouchedGP', fmt: (r) => money(r.summary.breakEvenTouchedGP) },
  { label: 'Sellers per specialist at end of view', key: 'coverageAtView', fmt: (r) => ratio1(r.summary.coverageAtView) },
  { label: 'Sellers per architect at end of view', key: 'architectCoverageAtView', fmt: (r) => ratio1(r.summary.architectCoverageAtView) },
];

export function defaultCompareIds(ws: Workspace, ids: string[]): string[] {
  const valid = ids.filter((id) => ws.scenarios.some((s) => s.id === id));
  if (valid.length >= 2) return valid.slice(0, 4);
  return ws.scenarios.filter((s) => s.id !== ws.baselineScenarioId).slice(0, 3).map((s) => s.id);
}

export function CompareBody({ ws, results }: { ws: Workspace; results: ScenarioResult[] }) {
  const vm = ws.settings.viewMonths;
  const x = Array.from({ length: vm + 1 }, (_, i) => i);
  const series = (f: (r: ScenarioResult, m: number) => number) => results.map((r) => ({ name: r.scenarioName, values: x.map((m) => f(r, m)), ...scenarioStyle(ws, r.scenarioId) }));
  const res0 = results[0]?.resolution;
  const ref = res0?.get('coverage_reference');
  const strain = res0?.get('coverage_strain');
  return (
    <div class="stack">
      <table class="data" data-testid="compare-table">
        <thead>
          <tr>
            <th>Metric ({ws.settings.caseKey} case)</th>
            {results.map((r) => (
              <th class="num" key={r.scenarioId}>
                <span class="swatch" style={`background:${scenarioStyle(ws, r.scenarioId).color}`} />
                {r.scenarioName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              {results.map((r) => (
                <td class="num" key={r.scenarioId}>
                  <Num trace={explainSummary(ws, r, row.key)} text={row.fmt(r)} />
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td>Specialists at M{vm}</td>
            {results.map((r) => (
              <td class="num" key={r.scenarioId}>
                {num(r.rows[vm]?.specialists, 1)}
              </td>
            ))}
          </tr>
          <tr>
            <td>Headcount at M{vm}</td>
            {results.map((r) => (
              <td class="num" key={r.scenarioId}>
                {num(r.rows[vm]?.headcount, 1)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div class="stack">
        <LineChart title="Cumulative incremental cost" subtitle={`vs baseline, ${ws.settings.caseKey} case`} x={x} series={series((r, m) => r.rows[m]?.cumIncCost ?? NaN)} yFormat={money} />
        <LineChart
          title="Sellers per specialist"
          subtitle="Lower is more coverage"
          x={x}
          series={series((r, m) => r.rows[m]?.sellersPerSpecialist ?? NaN)}
          refLines={[...(Number.isFinite(ref) ? [{ y: ref!, label: `1:${ref} reference` }] : []), ...(Number.isFinite(strain) ? [{ y: strain!, label: `1:${strain} strain line` }] : [])]}
          yFormat={(v) => v.toFixed(1)}
        />
        <LineChart title="Monthly total cost" subtitle="People plus external services" x={x} series={series((r, m) => r.rows[m]?.totalCost ?? NaN)} yFormat={money} yMinZero={false} />
        <LineChart title="Cumulative net (GP less cost)" subtitle="Driver-based GP uplift less incremental cost" x={x} series={series((r, m) => r.rows[m]?.cumNet ?? NaN)} yFormat={money} yMinZero={false} />
      </div>
    </div>
  );
}

