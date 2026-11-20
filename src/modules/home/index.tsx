import type { ModuleManifest } from '../../app/module';
import { useWorkspace } from '../../app/store';
import { navigate } from '../../app/router';
import { setUi } from '../../app/ui';
import { statusCounts } from '../../core/assumptions/resolve';
import { ASSUMPTION_STATUSES } from '../../core/schema/types';
import { explainSummary } from '../../core/engine/explain';
import { money } from '../../core/format';
import { Badge } from '../../ui/components';
import { Num } from '../../ui/math';
import { ErrorBox, run, scenarioStyle, useActiveScenario, caseLabel } from '../shared';
import { sanitizeText } from '../../core/format';

function Home() {
  const ws = useWorkspace();
  const active = useActiveScenario(ws);
  const counts = statusCounts(ws.assumptions);
  const conflicts = ws.assumptions.filter((a) => a.status === 'Conflict');
  const vm = ws.settings.viewMonths;
  return (
    <div>
      <div class="page-head">
        <div class="grow">
          <h1>{ws.settings.displayName}</h1>
          <p class="muted">
            {ws.name}. {caseLabel(ws.settings.caseKey)} case. Months are counted from approval ({ws.settings.approvalMonth}). Click any number to see its math.
          </p>
        </div>
        <button class="btn" onClick={() => navigate('/compare')}>
          Compare scenarios
        </button>
        <button class="btn primary" onClick={() => navigate(`/scenarios/edit/${active.id}`)}>
          Edit {active.name}
        </button>
      </div>

      <h2>Scenarios</h2>
      <div class="cards" style="margin-bottom:24px">
        {ws.scenarios.map((s) => {
          const r = run(ws, s.id);
          const st = scenarioStyle(ws, s.id);
          const isActive = s.id === active.id;
          return (
            <div class={`card ${isActive ? 'dark-edge' : ''}`} key={s.id} data-testid={`card-${s.id}`}>
              <div class="row">
                <span class="swatch" style={`background:${st.color}`} />
                <h3 style="flex:1;margin:0">
                  <a
                    href={`#/scenarios/edit/${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setUi({ activeScenarioId: s.id });
                      navigate(`/scenarios/edit/${s.id}`);
                    }}
                  >
                    {s.name}
                  </a>
                </h3>
              </div>
              <p class="small muted" style="min-height:38px">{sanitizeText(s.description).slice(0, 160)}</p>
              {r instanceof Error ? (
                <ErrorBox error={r} />
              ) : (
                <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:6px 0 0">
                  <div class="kpi">
                    <div class="label">{vm}-month incremental cost</div>
                    <div class="value">
                      <Num trace={explainSummary(ws, r, vm === 24 ? 'inc2y' : 'inc3y')} text={money(vm === 24 ? r.summary.inc2y : r.summary.inc3y)} cls={isActive ? 'key-number' : ''} />
                    </div>
                  </div>
                  <div class="kpi">
                    <div class="label">Sellers per specialist, M{vm}</div>
                    <div class="value">
                      <Num trace={explainSummary(ws, r, 'coverageAtView')} />
                    </div>
                  </div>
                  <div class="kpi">
                    <div class="label">Payback month</div>
                    <div class="value">
                      <Num trace={explainSummary(ws, r, 'paybackMonth')} text={r.summary.paybackMonth == null ? 'None' : s.id === ws.baselineScenarioId ? 'n/a' : `M${r.summary.paybackMonth}`} />
                    </div>
                  </div>
                </div>
              )}
              {!(r instanceof Error) && r.gates.length > 0 && (
                <p class="small" style="margin-top:8px">
                  Gates:{' '}
                  {r.gates.map((g, i) => (
                    <span key={i} class={`badge ${g.pass ? 'pass' : 'fail'}`} style="margin-right:4px">
                      {g.gateName} M{g.month} {g.pass ? 'pass' : 'miss'}
                    </span>
                  ))}
                </p>
              )}
              {!(r instanceof Error) && r.warnings.length > 0 && <p class="small" style="color:var(--danger)">{r.warnings.length} warnings</p>}
            </div>
          );
        })}
      </div>

      <div class="grid2">
        <div class="card">
          <h2>Assumption health</h2>
          <div class="row" style="margin:8px 0 12px">
            {ASSUMPTION_STATUSES.map((s) => (
              <span key={s} class="row" style="gap:4px">
                <Badge status={s} /> <b>{counts[s]}</b>
              </span>
            ))}
          </div>
          {conflicts.length ? (
            <div class="callout warn">
              <b>{conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''}.</b> Every output that depends on these shows a ! flag.
              <ul style="margin:6px 0 0;padding-left:18px">
                {conflicts.map((a) => (
                  <li key={a.id}>
                    <a href={`#/assumptions/register/${a.id}`}>{a.id}</a> {a.label}: {a.value}
                    {a.alternates?.length ? ` vs ${a.alternates.map((x) => `${x.value} (${x.source})`).join(', ')}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p class="muted">No Conflicts.</p>
          )}
        </div>
        <div class="card">
          <h2>Data</h2>
          <table class="data">
            <tbody>
              <tr><td>People</td><td class="num">{ws.entities.people.length}</td></tr>
              <tr><td>Assumptions</td><td class="num">{ws.assumptions.length}</td></tr>
              <tr><td>External services</td><td class="num">{ws.entities.externalServices.length}</td></tr>
              <tr><td>Revenue rows</td><td class="num">{ws.entities.revenueFacts.length}</td></tr>
              <tr><td>Imported datasets</td><td class="num">{ws.datasets.length}</td></tr>
              <tr><td>Snapshots</td><td class="num">{ws.snapshots.length}</td></tr>
            </tbody>
          </table>
          <div class="row" style="margin-top:10px">
            <button class="btn small" onClick={() => navigate('/data/import')}>Import a file</button>
            <button class="btn small" onClick={() => navigate('/data/quality')}>Data quality</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const homeModule: ModuleManifest = {
  id: 'home',
  title: 'Home',
  icon: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  navOrder: 0,
  landingPriority: 10,
  views: [{ id: 'overview', title: 'Overview', component: Home }],
};
