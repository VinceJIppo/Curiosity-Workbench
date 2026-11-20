// Clean one-page CEO summary of a scenario or a comparison. Use the browser's Save as PDF.
import type { ModuleManifest, ViewProps } from '../../app/module';
import { useWorkspace } from '../../app/store';
import { navigate } from '../../app/router';
import { logoSvg } from 'virtual:brand';
import type { ScenarioResult } from '../../core/engine/types';
import { CoverageView, CostView, SummaryKpis } from '../../ui/outputs';
import { CompareBody, defaultCompareIds } from '../../ui/compare';
import { run, caseLabel } from '../shared';
import { sanitizeText } from '../../core/format';
import { Badge } from '../../ui/components';

function Header({ title, sub }: { title: string; sub: string }) {
  const ws = useWorkspace();
  return (
    <div style="display:flex;align-items:flex-start;gap:16px;border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:14px">
      <div style="flex:1">
        <div class="small muted">{ws.settings.displayName}</div>
        <h1 style="margin:2px 0">{title}</h1>
        <div class="small muted">{sub}</div>
      </div>
      {logoSvg && <div class="logo" style="width:120px" dangerouslySetInnerHTML={{ __html: logoSvg }} />}
    </div>
  );
}

function KeyAssumptions({ r }: { r: ScenarioResult }) {
  const ws = useWorkspace();
  const ids = r.assumptionIds.filter((id) => !r.resolution.byId.get(id)?.formula).slice(0, 14);
  return (
    <table class="data small">
      <thead>
        <tr>
          <th>ID</th>
          <th>Assumption</th>
          <th class="num">Value used</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {ids.map((id) => {
          const a = r.resolution.byId.get(id)!;
          return (
            <tr key={id}>
              <td>{id}</td>
              <td>{sanitizeText(a.label)}</td>
              <td class="num">{Number.isFinite(a.value) ? a.value.toLocaleString('en-US') : 'n/a'}</td>
              <td>
                <Badge status={a.status} />
              </td>
            </tr>
          );
        })}
      </tbody>
      {ws.assumptions.length > ids.length && (
        <caption class="small muted" style="caption-side:bottom;text-align:left">
          Full register in the workbench.
        </caption>
      )}
    </table>
  );
}

function PrintView({ kind, arg }: { kind: string; arg?: string }) {
  const ws = useWorkspace();
  const date = new Date().toISOString().slice(0, 10);
  const toolbar = (
    <div class="row no-print" style="margin-bottom:14px">
      <button class="btn primary" onClick={() => window.print()}>
        Print or save as PDF
      </button>
      <button class="btn" onClick={() => history.back()}>
        Back
      </button>
    </div>
  );
  if (kind === 'compare') {
    const ids = defaultCompareIds(ws, (arg ?? '').split(','));
    const results = ids.map((id) => run(ws, id)).filter((r): r is ScenarioResult => !(r instanceof Error));
    const conflicts = [...new Set(results.flatMap((r) => r.conflicts))];
    return (
      <div>
        {toolbar}
        <Header title="Scenario comparison" sub={`${caseLabel(ws.settings.caseKey)} case. Months from approval (${ws.settings.approvalMonth}). Prepared ${date}.`} />
        {conflicts.length > 0 && <div class="callout warn small">Depends on Conflict assumptions: {conflicts.join(', ')}.</div>}
        <CompareBody ws={ws} results={results} />
      </div>
    );
  }
  const r = run(ws, arg ?? ws.baselineScenarioId);
  const sc = ws.scenarios.find((s) => s.id === arg);
  if (r instanceof Error || !sc) {
    navigate('/');
    return null;
  }
  return (
    <div>
      {toolbar}
      <Header title={sc.name} sub={`${sanitizeText(sc.description)} ${caseLabel(ws.settings.caseKey)} case. Prepared ${date}.`} />
      {r.conflicts.length > 0 && <div class="callout warn small">Depends on Conflict assumptions: {r.conflicts.join(', ')}. Resolve before relying on these numbers.</div>}
      <SummaryKpis ws={ws} r={r} />
      <div class="grid2">
        <CoverageView ws={ws} r={r} />
        <div class="stack">
          <CostView ws={ws} r={r} />
          <KeyAssumptions r={r} />
        </div>
      </div>
    </div>
  );
}

export const printModule: ModuleManifest = {
  id: 'print',
  title: 'Print',
  icon: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  navOrder: 99,
  hiddenFromNav: true,
  views: [
    { id: 'scenario', title: 'Print scenario', component: ({ params }: ViewProps) => <PrintView kind="scenario" arg={params[0]} />, hidden: true },
    { id: 'compare', title: 'Print comparison', component: ({ params }: ViewProps) => <PrintView kind="compare" arg={params[0]} />, hidden: true },
  ],
};
