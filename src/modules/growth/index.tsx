// Strategy and growth: OEM scorecards, large pursuits, gaps and risks, and the
// investment case that ties them to scenarios.
import { useMemo } from 'preact/hooks';
import type { ModuleManifest } from '../../app/module';
import { update, useWorkspace } from '../../app/store';
import { navigate } from '../../app/router';
import type { EntitySchema } from '../../core/schema/registry';
import { resolveAssumptions } from '../../core/assumptions/resolve';
import {
  PURSUIT_STAGES,
  RISK_AREAS,
  RISK_STATUSES,
  defaultGrowthSettings,
  heatMap,
  isOpen,
  periods,
  pursuitStats,
  ragCounts,
  riskBand,
  riskFromGap,
  riskScore,
  scorecard,
  suggestGaps,
  type GrowthSettings,
  type OemScore,
  type Pursuit,
  type Rag,
  type Risk,
} from '../../core/growth/growth';
import { money, pct, num } from '../../core/format';
import { EntityTable } from '../../ui/EntityTable';
import { Empty, Field, NumberInput, Select, toast } from '../../ui/components';
import { exportCsv } from '../../charts/export';
import { newId, run } from '../shared';
import type { Workspace } from '../../core/schema/types';

const SCORE_SCHEMA: EntitySchema = {
  type: 'oemScore',
  label: 'OEM scorecard rows',
  collection: 'oemScores',
  idField: 'id',
  idPrefix: 'sc',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id'] },
    { key: 'oem', label: 'OEM', type: 'string', required: true, aliases: ['oem', 'vendor', 'partner'] },
    { key: 'period', label: 'Period', type: 'string', required: true, aliases: ['period', 'quarter', 'month', 'fiscal period'] },
    { key: 'metric', label: 'Metric', type: 'string', required: true, aliases: ['metric', 'kpi', 'measure'] },
    { key: 'actual', label: 'Actual', type: 'number', aliases: ['actual', 'value', 'result'] },
    { key: 'target', label: 'Target', type: 'number', aliases: ['target', 'goal', 'plan'] },
    { key: 'direction', label: 'Better when', type: 'enum', enum: ['higher', 'lower'], aliases: ['direction', 'better'] },
    { key: 'unit', label: 'Unit', type: 'string', aliases: ['unit'] },
    { key: 'source', label: 'Source', type: 'string', aliases: ['source'] },
  ],
};

const PURSUIT_SCHEMA: EntitySchema = {
  type: 'pursuit',
  label: 'Large pursuits',
  collection: 'pursuits',
  idField: 'id',
  idPrefix: 'lp',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id', 'opportunity id'] },
    { key: 'name', label: 'Pursuit', type: 'string', required: true, aliases: ['name', 'pursuit', 'opportunity', 'opportunity name'] },
    { key: 'account', label: 'Account', type: 'string', ref: 'account', aliases: ['account', 'customer'] },
    { key: 'oems', label: 'OEMs', type: 'list', aliases: ['oems', 'oem', 'vendors'] },
    { key: 'practices', label: 'Practices involved', type: 'list', aliases: ['practices', 'practice'] },
    { key: 'stage', label: 'Stage', type: 'enum', enum: PURSUIT_STAGES, required: true, aliases: ['stage', 'status'] },
    { key: 'value', label: 'Value', type: 'money', aliases: ['value', 'amount', 'revenue'] },
    { key: 'gp', label: 'GP', type: 'money', aliases: ['gp', 'gross profit'] },
    { key: 'closeDate', label: 'Close date', type: 'date', aliases: ['close date', 'close'] },
    { key: 'owner', label: 'Owner', type: 'string', aliases: ['owner', 'lead'] },
    { key: 'gaps', label: 'Gaps (where we were weak)', type: 'list', aliases: ['gaps', 'gap', 'weaknesses'] },
    { key: 'lossReason', label: 'Loss reason', type: 'string', aliases: ['loss reason', 'reason lost'] },
    { key: 'notes', label: 'Notes', type: 'string', aliases: ['notes'] },
  ],
};

const RISK_SCHEMA: EntitySchema = {
  type: 'risk',
  label: 'Risk register',
  collection: 'risks',
  idField: 'id',
  idPrefix: 'rk',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id'] },
    { key: 'title', label: 'Risk or gap', type: 'string', required: true, aliases: ['title', 'risk', 'gap'] },
    { key: 'area', label: 'Area', type: 'enum', enum: RISK_AREAS, required: true, aliases: ['area', 'category'] },
    { key: 'oem', label: 'OEM', type: 'string', aliases: ['oem'] },
    { key: 'likelihood', label: 'Likelihood (1 to 5)', type: 'integer', required: true, aliases: ['likelihood', 'probability'] },
    { key: 'impact', label: 'Impact (1 to 5)', type: 'integer', required: true, aliases: ['impact', 'severity'] },
    { key: 'owner', label: 'Owner', type: 'string', aliases: ['owner'] },
    { key: 'mitigation', label: 'Mitigation', type: 'string', aliases: ['mitigation', 'action'] },
    { key: 'status', label: 'Status', type: 'enum', enum: RISK_STATUSES, aliases: ['status'] },
    { key: 'investment', label: 'Proposed investment', type: 'money', aliases: ['investment', 'ask', 'cost'] },
    { key: 'scenarioId', label: 'Scenario ID', type: 'string', aliases: ['scenario'] },
    { key: 'source', label: 'Evidence', type: 'string', aliases: ['source', 'evidence'] },
  ],
};

function settingsOf(ws: Workspace): GrowthSettings {
  const d = (ws.modules.growth as { settings?: Partial<GrowthSettings> } | undefined)?.settings;
  return { ...defaultGrowthSettings(), ...(d ?? {}) };
}

const coll = <T,>(ws: Workspace, key: string) => ((ws.entities as Record<string, unknown[]>)[key] ?? []) as T[];

const RAG_CLASS: Record<Rag, string> = { green: 'pass', amber: 'Assumed', red: 'fail', none: 'Open' };
const ARROW = { 1: '↑', 0: '', [-1]: '↓' } as Record<number, string>;
const BAND_CLASS = { high: 'fail', medium: 'Assumed', low: 'pass' } as const;

// ---------------- OEM scorecard ----------------

function Scorecard() {
  const ws = useWorkspace();
  const st = settingsOf(ws);
  const scores = coll<OemScore>(ws, 'oemScores');
  const lines = useMemo(() => scorecard(scores, st.amberTolerance), [scores, st.amberTolerance]);
  const oems = [...new Set(lines.map((l) => l.oem))];
  const metrics = [...new Set(lines.map((l) => l.metric))].sort((a, b) => st.metrics.indexOf(a) - st.metrics.indexOf(b));
  const fmt = (s: OemScore) => (s.actual == null ? 'n/a' : s.unit === '$' ? money(s.actual) : s.unit === '%' ? pct(s.actual) : num(s.actual, Number.isInteger(s.actual) ? 0 : 1));
  const pullRevenue = () => {
    const names = new Map(ws.entities.practices.filter((p) => p.type === 'OEM line').map((p) => [p.id, p.name]));
    const rows: OemScore[] = [];
    const agg = new Map<string, { oem: string; period: string; gp: number; revenue: number }>();
    for (const f of ws.entities.revenueFacts) {
      const oem = names.get(f.line) ?? ws.entities.vendors.find((v) => v.name === f.line)?.name;
      if (!oem) continue;
      const k = `${oem}|${f.period}`;
      if (!agg.has(k)) agg.set(k, { oem, period: f.period, gp: 0, revenue: 0 });
      agg.get(k)!.gp += f.gp;
      agg.get(k)!.revenue += f.revenue;
    }
    for (const a of agg.values()) {
      rows.push({ id: `sc-${a.oem}-${a.period}-GP`.replace(/\W+/g, '-'), oem: a.oem, period: a.period, metric: 'GP', actual: a.gp, direction: 'higher', unit: '$', source: 'Revenue data' });
      rows.push({ id: `sc-${a.oem}-${a.period}-Revenue`.replace(/\W+/g, '-'), oem: a.oem, period: a.period, metric: 'Revenue', actual: a.revenue, direction: 'higher', unit: '$', source: 'Revenue data' });
    }
    if (!rows.length) return toast('No revenue rows map to an OEM line. Revenue lines must use an OEM line practice ID or vendor name.');
    update((w) => {
      const cur = coll<OemScore>(w, 'oemScores');
      const m = new Map(cur.map((r) => [r.id, r]));
      for (const r of rows) m.set(r.id, { ...m.get(r.id), ...r, target: m.get(r.id)?.target });
      (w.entities as Record<string, unknown[]>).oemScores = [...m.values()];
    }, 'Pulled OEM GP and revenue from revenue data');
    toast(`Updated ${rows.length} scorecard rows. Add targets to see status.`);
  };
  return (
    <div class="stack">
      <p class="muted small">Latest period per OEM and metric, against target. Arrows compare with the prior period (up is better). Amber means within {pct(st.amberTolerance)} of target. Red and amber metrics feed the gap analysis.</p>
      {lines.length === 0 ? (
        <Empty>No scorecard data. Import OEM scorecard rows (Data &gt; Import), pull GP and revenue from revenue data, or add rows below.</Empty>
      ) : (
        <div class="table-wrap">
          <table class="data" data-testid="scorecard">
            <thead>
              <tr>
                <th>OEM</th>
                <th>Status</th>
                {metrics.map((m) => (
                  <th key={m}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {oems.map((o) => {
                const mine = lines.filter((l) => l.oem === o);
                const c = ragCounts(mine);
                return (
                  <tr key={o}>
                    <td>
                      <b>{o}</b>
                    </td>
                    <td class="small">
                      {c.red > 0 && <span class="badge fail">{c.red} red</span>} {c.amber > 0 && <span class="badge Assumed">{c.amber} amber</span>} {c.green > 0 && <span class="badge pass">{c.green} green</span>}
                    </td>
                    {metrics.map((m) => {
                      const l = mine.find((x) => x.metric === m);
                      return (
                        <td key={m} title={l ? `${l.latest.period}${l.latest.source ? `, ${l.latest.source}` : ''}` : ''}>
                          {l ? (
                            <>
                              <span class={`badge ${RAG_CLASS[l.rag]}`}>{fmt(l.latest)}</span> <span aria-label={l.trend > 0 ? 'better' : l.trend < 0 ? 'worse' : ''}>{ARROW[l.trend]}</span>
                              {l.latest.target != null && <div class="small muted">target {fmt({ ...l.latest, actual: l.latest.target })}</div>}
                            </>
                          ) : (
                            ''
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div class="row">
        <button class="btn" onClick={pullRevenue}>
          Pull GP and revenue from revenue data
        </button>
        <button class="btn" onClick={() => navigate('/data/import/oemScore')}>
          Import scorecard rows
        </button>
        <span class="small muted">Periods: {periods(scores).join(', ') || 'none'}</span>
      </div>
      <EntityTable title="Scorecard rows" schema={SCORE_SCHEMA} newRow={() => ({ id: newId('sc'), oem: oems[0] ?? 'Palo Alto Networks', period: '', metric: st.metrics[0], direction: 'higher' })} />
    </div>
  );
}

// ---------------- Large pursuits ----------------

function Pursuits() {
  const ws = useWorkspace();
  const list = coll<Pursuit>(ws, 'pursuits').map((p) => ({ ...p, oems: p.oems ?? [], practices: p.practices ?? [], gaps: p.gaps ?? [] }));
  const s = pursuitStats(list);
  const res = resolveAssumptions(ws.assumptions, { caseKey: 'base', bindings: ws.settings.bindings });
  const practiceName = (id: string) => ws.entities.practices.find((p) => p.id === id)?.name ?? id;
  const assumed = {
    deals: res.find('pursuits_deals_per_year'),
    winBase: res.find('large_deal_win_rate'),
    lift: res.find('pursuits_win_lift'),
    gp: res.find('large_deal_gp'),
  };
  const focusedAssumed = assumed.winBase && assumed.lift ? Math.min(1, assumed.winBase.value * (1 + assumed.lift.value)) : NaN;
  const measure = (key: string, value: number, label: string) => {
    const id = res.idFor(key);
    if (!id || !Number.isFinite(value)) return;
    if (!confirm(`Set ${id} (${label}) to ${Math.round(value * 1000) / 1000} as Measured from the tracker?`)) return;
    update((w) => {
      const a = w.assumptions.find((x) => x.id === id);
      if (!a) return;
      a.alternates = [...(a.alternates ?? []), { value: a.value ?? 0, source: `Before tracker update ${new Date().toISOString().slice(0, 10)}` }];
      a.value = value;
      a.status = 'Measured';
      a.source = `Large pursuits tracker, ${list.length} pursuits, ${new Date().toISOString().slice(0, 10)}`;
    }, `${id} measured from the pursuits tracker`);
  };
  const cmp = (label: string, actual: number, fmt: (v: number) => string, assumedV: number | undefined, key?: string, note?: string) => (
    <tr>
      <td>{label}</td>
      <td class="num">{Number.isFinite(actual) ? fmt(actual) : 'n/a'}</td>
      <td class="num">{assumedV != null && Number.isFinite(assumedV) ? fmt(assumedV) : 'n/a'}</td>
      <td class="small">
        {key && Number.isFinite(actual) && (
          <button class="btn small" onClick={() => measure(key, actual, label)}>
            Use actual in the register
          </button>
        )}
        {note && <span class="muted"> {note}</span>}
      </td>
    </tr>
  );
  return (
    <div class="stack">
      <div class="kpis">
        <div class="kpi">
          <div class="label">Active pursuits</div>
          <div class="value">{s.active}</div>
          <div class="sub">{money(s.activeGP)} GP in play</div>
        </div>
        <div class="kpi">
          <div class="label">Won and lost</div>
          <div class="value">
            {s.won} / {s.lost}
          </div>
          <div class="sub">
            {money(s.wonGP)} won, {money(s.lostGP)} lost
          </div>
        </div>
        <div class="kpi">
          <div class="label">Win rate on closed pursuits</div>
          <div class="value">{pct(s.winRate)}</div>
        </div>
        <div class="kpi">
          <div class="label">Practices per pursuit</div>
          <div class="value">{num(s.avgPractices, 1)}</div>
        </div>
      </div>
      <h3>Actuals vs planning assumptions</h3>
      <p class="small muted">The scenarios use the register. When the tracker has enough history, put the actuals in the register so the business case runs on real numbers. The old value is kept as an alternate.</p>
      <table class="data" style="max-width:900px">
        <thead>
          <tr>
            <th>Measure</th>
            <th class="num">Tracker</th>
            <th class="num">Register</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cmp('Pursuits per year', s.perYear, (v) => num(v, 1), assumed.deals?.value, 'pursuits_deals_per_year', 'from the span of close dates')}
          {cmp('Win rate with the focused team', s.winRate, (v) => pct(v), focusedAssumed, undefined, 'register: base win rate x (1 + lift); compare before changing either')}
          {cmp('GP per won pursuit', s.avgWonGP, money, assumed.gp?.value, 'large_deal_gp')}
        </tbody>
      </table>
      <div class="grid2">
        <div>
          <h3>Practices involved</h3>
          <table class="data">
            <tbody>
              {Object.entries(s.byPractice)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => (
                  <tr key={k}>
                    <td>{practiceName(k)}</td>
                    <td class="num">{n} pursuits</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>By OEM</h3>
          <table class="data">
            <tbody>
              {Object.entries(s.byOem)
                .sort((a, b) => b[1].gp - a[1].gp)
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td class="num">{v.count} pursuits</td>
                    <td class="num">{money(v.gp)} GP</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <h3>Pursuits</h3>
      {list.length === 0 ? (
        <Empty>No pursuits yet. Add one below or import a list.</Empty>
      ) : (
        <div class="table-wrap">
          <table class="data" data-testid="pursuits-table">
            <thead>
              <tr>
                <th>Pursuit</th>
                <th>Account</th>
                <th>OEMs</th>
                <th class="num">Practices</th>
                <th>Stage</th>
                <th class="num">GP</th>
                <th>Close</th>
                <th>Gaps</th>
              </tr>
            </thead>
            <tbody>
              {[...list]
                .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || (b.gp ?? 0) - (a.gp ?? 0))
                .map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td class="small">{p.account}</td>
                    <td class="small">{p.oems.join(', ')}</td>
                    <td class="num" title={p.practices.map(practiceName).join(', ')}>
                      {p.practices.length}
                      <div class="small muted">{p.practices.map(practiceName).join(', ')}</div>
                    </td>
                    <td>
                      <span class={`badge ${p.stage === 'Closed won' ? 'pass' : p.stage === 'Closed lost' || p.stage === 'No decision' ? 'fail' : 'Open'}`}>{p.stage}</span>
                    </td>
                    <td class="num">{money(p.gp)}</td>
                    <td class="small">{p.closeDate}</td>
                    <td class="small">{p.gaps.join('; ')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <EntityTable title="Edit pursuits" schema={PURSUIT_SCHEMA} newRow={() => ({ id: newId('lp'), name: 'New pursuit', stage: 'Qualify', oems: [], practices: [], gaps: [] })} />
    </div>
  );
}

// ---------------- Gaps and risks ----------------

function Risks() {
  const ws = useWorkspace();
  const st = settingsOf(ws);
  const risks = coll<Risk>(ws, 'risks');
  const lines = scorecard(coll<OemScore>(ws, 'oemScores'), st.amberTolerance);
  const pursuits = coll<Pursuit>(ws, 'pursuits').map((p) => ({ ...p, oems: p.oems ?? [], practices: p.practices ?? [], gaps: p.gaps ?? [] }));
  const taken = new Set(risks.map((r) => r.gapKey).filter(Boolean));
  const suggestions = suggestGaps(lines, pursuits, ws.entities.practices, st).filter((g) => !taken.has(g.key));
  const heat = heatMap(risks);
  const add = (gs: typeof suggestions) =>
    update((w) => {
      (w.entities as Record<string, unknown[]>).risks = [...coll<Risk>(w, 'risks'), ...gs.map((g) => riskFromGap(g, newId('rk')))];
    }, `Added ${gs.length} gap${gs.length > 1 ? 's' : ''} to the risk register`);
  const sorted = [...risks].sort((a, b) => riskScore(b) - riskScore(a));
  return (
    <div class="stack">
      <h3>Suggested gaps</h3>
      <p class="small muted">From scorecard metrics off target, gaps named on pursuits (weighted by lost GP), practices that never join a pursuit, and OEM concentration of pursuit GP. Add the real ones to the register; ignore the rest.</p>
      {suggestions.length === 0 ? (
        <p class="small muted">No new suggestions.</p>
      ) : (
        <>
          <table class="data">
            <tbody>
              {suggestions.map((g) => (
                <tr key={g.key}>
                  <td>
                    <b>{g.title}</b>
                    <div class="small muted">{g.evidence}</div>
                  </td>
                  <td class="small">{g.area}</td>
                  <td class="num small">
                    {g.likelihood} x {g.impact} = {g.likelihood * g.impact}
                  </td>
                  <td>
                    <button class="btn small" onClick={() => add([g])}>
                      Add to register
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <button class="btn small" onClick={() => add(suggestions)} data-testid="add-all-gaps">
              Add all {suggestions.length}
            </button>
          </div>
        </>
      )}
      <div class="grid2" style="grid-template-columns:auto 1fr;align-items:start">
        <div>
          <h3>Heat map</h3>
          <table class="data" style="width:auto" aria-label="Risk heat map: likelihood by impact">
            <tbody>
              {[5, 4, 3, 2, 1].map((l) => (
                <tr key={l}>
                  <th class="small">L{l}</th>
                  {[1, 2, 3, 4, 5].map((i) => {
                    const band = riskBand(l * i, st);
                    const n = heat[l - 1][i - 1];
                    return (
                      <td key={i} class="num" style={`width:44px;height:34px;text-align:center;background:${band === 'high' ? '#fde2e1' : band === 'medium' ? '#fff3dc' : '#eef6ee'}`}>
                        {n || ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th />
                {[1, 2, 3, 4, 5].map((i) => (
                  <th key={i} class="small" style="text-align:center">
                    I{i}
                  </th>
                ))}
              </tr>
            </tbody>
          </table>
          <p class="small muted">Likelihood (L) by impact (I). Closed risks are left out.</p>
        </div>
        <div>
          <h3>Risk register</h3>
          {sorted.length === 0 ? (
            <Empty>No risks yet. Add suggested gaps or add rows below.</Empty>
          ) : (
            <table class="data" data-testid="risk-register">
              <thead>
                <tr>
                  <th>Risk or gap</th>
                  <th>Area</th>
                  <th class="num">Score</th>
                  <th>Status</th>
                  <th class="num">Investment</th>
                  <th>Scenario</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const sc = riskScore(r);
                  return (
                    <tr key={r.id}>
                      <td>
                        {r.title}
                        {r.oem && <span class="small muted"> ({r.oem})</span>}
                        {r.mitigation && <div class="small muted">Mitigation: {r.mitigation}</div>}
                      </td>
                      <td class="small">{r.area}</td>
                      <td class="num">
                        <span class={`badge ${BAND_CLASS[riskBand(sc, st)]}`}>{sc}</span>
                      </td>
                      <td class="small">{r.status}</td>
                      <td class="num">{r.investment ? money(r.investment) : ''}</td>
                      <td class="small">
                        <Select value={r.scenarioId ?? ''} options={ws.scenarios.map((s) => s.id)} labels={Object.fromEntries(ws.scenarios.map((s) => [s.id, s.name]))} onChange={(v) => update((w) => { const x = coll<Risk>(w, 'risks').find((y) => y.id === r.id); if (x) x.scenarioId = v || undefined; }, 'Linked risk to scenario')} allowEmpty="None" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <EntityTable title="Edit risks" schema={RISK_SCHEMA} newRow={() => ({ id: newId('rk'), title: 'New risk', area: 'Capability gap', likelihood: 3, impact: 3, status: 'Open' })} />
      <div class="card">
        <h3>Settings</h3>
        <div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          {(
            [
              ['amberTolerance', 'Amber when within (share of target)'],
              ['mediumRisk', 'Medium risk from score'],
              ['highRisk', 'High risk from score'],
              ['concentrationShare', 'Concentration from share of pursuit GP'],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <NumberInput value={st[k]} onChange={(v) => update((w) => { const m = (w.modules.growth as { settings?: Partial<GrowthSettings> }) ?? {}; w.modules.growth = { ...m, settings: { ...(m.settings ?? {}), [k]: v ?? defaultGrowthSettings()[k] } }; }, 'Growth settings', { coalesce: `gs-${k}` })} />
            </Field>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------- Investment case ----------------

function Investment() {
  const ws = useWorkspace();
  const st = settingsOf(ws);
  const risks = coll<Risk>(ws, 'risks').filter((r) => r.status !== 'Closed');
  const lines = scorecard(coll<OemScore>(ws, 'oemScores'), st.amberTolerance);
  const pursuits = coll<Pursuit>(ws, 'pursuits').map((p) => ({ ...p, oems: p.oems ?? [], practices: p.practices ?? [], gaps: p.gaps ?? [] }));
  const ps = pursuitStats(pursuits);
  const asks = [...risks].filter((r) => r.investment || r.scenarioId).sort((a, b) => riskScore(b) - riskScore(a));
  const rows = asks.map((r) => {
    const res = r.scenarioId ? run(ws, r.scenarioId) : null;
    const sc = res && !(res instanceof Error) ? res : null;
    return { r, sc, name: ws.scenarios.find((s) => s.id === r.scenarioId)?.name ?? '' };
  });
  const totalAsk = asks.reduce((s, r) => s + (r.investment ?? 0), 0);
  const red = lines.filter((l) => l.rag === 'red');
  const high = risks.filter((r) => riskBand(riskScore(r), st) === 'high');
  const csv = () =>
    exportCsv(
      'investment case',
      ['Risk or gap', 'Area', 'OEM', 'Score', 'Band', 'Proposed investment', 'Scenario', '24-month incremental cost', '24-month incremental GP', 'Payback month', 'Mitigation'],
      rows.map(({ r, sc, name }) => [r.title, r.area, r.oem ?? '', riskScore(r), riskBand(riskScore(r), st), r.investment ?? '', name, sc?.summary.inc2y ?? '', sc?.summary.incGP2y ?? '', sc?.summary.paybackMonth ?? '', r.mitigation ?? '']),
    );
  return (
    <div class="stack">
      <div class="page-head">
        <div class="grow">
          <h2>Strategic growth and investment case</h2>
          <p class="muted small">Where we are behind, what it puts at risk, and what closing it costs and returns. Scenario numbers use the {ws.settings.caseKey} case.</p>
        </div>
        <button class="btn no-print" onClick={csv}>
          Export CSV
        </button>
        <button class="btn no-print" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <div class="kpis">
        <div class="kpi">
          <div class="label">OEM metrics in the red</div>
          <div class="value">{red.length}</div>
          <div class="sub">{[...new Set(red.map((l) => l.oem))].join(', ')}</div>
        </div>
        <div class="kpi">
          <div class="label">High risks open</div>
          <div class="value">{high.length}</div>
        </div>
        <div class="kpi">
          <div class="label">Pursuit GP in play</div>
          <div class="value">{money(ps.activeGP)}</div>
          <div class="sub">
            {ps.active} active, {money(ps.lostGP)} lost so far
          </div>
        </div>
        <div class="kpi">
          <div class="label">Total proposed investment</div>
          <div class="value">
            <span class="key-number">{money(totalAsk)}</span>
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty>Add a proposed investment or link a scenario to risks in Gaps and risks to build the case.</Empty>
      ) : (
        <table class="data" data-testid="investment-table">
          <thead>
            <tr>
              <th>Gap or risk</th>
              <th class="num">Score</th>
              <th class="num">Proposed investment</th>
              <th>Scenario</th>
              <th class="num">24-month incremental cost</th>
              <th class="num">24-month incremental GP</th>
              <th class="num">Payback</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, sc, name }) => (
              <tr key={r.id}>
                <td>
                  {r.title}
                  <div class="small muted">
                    {r.area}
                    {r.oem ? `, ${r.oem}` : ''}
                    {r.mitigation ? `. ${r.mitigation}` : ''}
                  </div>
                </td>
                <td class="num">
                  <span class={`badge ${BAND_CLASS[riskBand(riskScore(r), st)]}`}>{riskScore(r)}</span>
                </td>
                <td class="num">{r.investment ? money(r.investment) : ''}</td>
                <td class="small">{sc ? <a href={`#/scenarios/edit/${r.scenarioId}`}>{name}</a> : ''}</td>
                <td class="num">{sc ? money(sc.summary.inc2y) : ''}</td>
                <td class="num">{sc ? money(sc.summary.incGP2y) : ''}</td>
                <td class="num">{sc ? (sc.summary.paybackMonth == null ? 'None' : `M${sc.summary.paybackMonth}`) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Top open risks</h3>
      <ol class="small">
        {[...risks]
          .sort((a, b) => riskScore(b) - riskScore(a))
          .slice(0, 5)
          .map((r) => (
            <li key={r.id}>
              {r.title} ({riskScore(r)}, {r.area}){r.investment || r.scenarioId ? '' : '. No investment or scenario linked yet.'}
            </li>
          ))}
      </ol>
    </div>
  );
}

export const growthModule: ModuleManifest = {
  id: 'growth',
  title: 'Strategy and growth',
  icon: 'M3 20h18M6 16l4-5 3 3 5-7M18 7h-3M18 7v3',
  navOrder: 47,
  entities: [SCORE_SCHEMA, PURSUIT_SCHEMA, RISK_SCHEMA],
  views: [
    { id: 'scorecard', title: 'OEM scorecard', component: Scorecard },
    { id: 'pursuits', title: 'Large pursuits', component: Pursuits },
    { id: 'risks', title: 'Gaps and risks', component: Risks },
    { id: 'investment', title: 'Investment case', component: Investment },
  ],
};

