// Innovation research: a panel of virtual domain researchers works CIO briefs
// against a startup catalog (first: the Dell Technologies Capital portfolio).
// The app stays offline: it routes, pre-screens and writes an anonymized research
// packet; Claude plays the panel; the app imports the research pack for review.
import { useState } from 'preact/hooks';
import type { ModuleManifest, ViewProps } from '../../app/module';
import { update, useWorkspace } from '../../app/store';
import { navigate } from '../../app/router';
import { downloadBlob, pickFile } from '../../app/persist';
import type { EntitySchema } from '../../core/schema/registry';
import type { Workspace } from '../../core/schema/types';
import {
  DEFAULT_RESEARCHERS,
  DOMAINS,
  briefMarkdown,
  briefReport,
  buildMasking,
  handoffRunner,
  importResearchPack,
  prescreen,
  routeBrief,
  type Brief,
  type Domain,
  type Finding,
  type Masking,
  type Researcher,
  type Startup,
} from '../../core/research/research';
import { DTC_AS_OF, DTC_NAME, dtcCatalog } from '../../catalogs/dtc-portfolio';
import { sanitizeText } from '../../core/format';
import { EntityTable } from '../../ui/EntityTable';
import { Empty, Field, Modal, NumberInput, Select, TextInput, toast } from '../../ui/components';
import { newId } from '../shared';

const VERSION = 1;

interface InnovationData {
  briefs: (Brief & { lastPacket?: { at: string; masking: Masking } })[];
  findings: Finding[];
  researchers: Researcher[];
}

const DOMAIN_LABEL: Record<Domain, string> = { cybersecurity: 'Cybersecurity', automation: 'Automation', ai: 'AI', virtualization: 'Virtualization', cx: 'Customer experience' };

const STARTUP_SCHEMA: EntitySchema = {
  type: 'startup',
  label: 'Startup catalog',
  collection: 'startups',
  idField: 'id',
  idPrefix: 'st',
  fields: [
    { key: 'id', label: 'ID', type: 'string', aliases: ['id'] },
    { key: 'name', label: 'Company', type: 'string', required: true, aliases: ['name', 'company', 'startup'] },
    { key: 'description', label: 'What it does', type: 'string', aliases: ['description', 'about', 'summary'] },
    { key: 'domains', label: 'Researcher domains', type: 'list', aliases: ['domains', 'domain'] },
    { key: 'categories', label: 'Categories', type: 'list', aliases: ['categories', 'category', 'focus area', 'sector'] },
    { key: 'status', label: 'Status', type: 'string', aliases: ['status', 'stage'] },
    { key: 'website', label: 'Website', type: 'string', aliases: ['website', 'url', 'site'] },
    { key: 'investor', label: 'Investor', type: 'string', aliases: ['investor', 'fund', 'vc'] },
    { key: 'source', label: 'Source', type: 'string', aliases: ['source'] },
    { key: 'asOf', label: 'As of', type: 'string', aliases: ['as of', 'date'] },
    { key: 'verified', label: 'Verified by the office', type: 'boolean', aliases: ['verified'] },
    { key: 'notes', label: 'Notes', type: 'string', aliases: ['notes'] },
  ],
};

function dataOf(ws: Workspace): InnovationData {
  const d = ws.modules.innovation as Partial<InnovationData> | undefined;
  return { briefs: d?.briefs ?? [], findings: d?.findings ?? [], researchers: d?.researchers?.length ? d.researchers : DEFAULT_RESEARCHERS };
}

function setData(fn: (d: InnovationData) => void, label: string, coalesce?: string) {
  update(
    (w) => {
      const d = dataOf(w);
      fn(d);
      w.modules.innovation = d;
      w.moduleVersions.innovation = VERSION;
    },
    label,
    coalesce ? { coalesce } : undefined,
  );
}

const catalogOf = (ws: Workspace) =>
  (((ws.entities as Record<string, unknown[]>).startups ?? []) as Startup[]).map((s) => ({ ...s, domains: (s.domains ?? []) as Domain[], categories: s.categories ?? [] }));

/** Startups the researchers may recommend: exited companies are left out unless the office keeps them. */
const activeCatalog = (ws: Workspace) => catalogOf(ws).filter((s) => s.status !== 'exited');

const today = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function sampleBrief(): Brief {
  return {
    id: newId('brief'),
    customer: 'Sample Customer 05',
    industry: 'Healthcare',
    contact: 'Sample CIO',
    receivedOn: today(),
    anonymize: true,
    sensitiveTerms: ['Project Northstar'],
    constraints: 'Lean IT team of 40. Board wants measurable results within 12 months.',
    initiatives: [
      { id: 'i1', title: 'Stop ransomware before it spreads', detail: 'Two ransomware incidents last year started from stolen identities. The SOC is two people and alert fatigue is high.', priority: 1 },
      { id: 'i2', title: 'Cut virtualization licensing cost', detail: 'Project Northstar: renewal costs doubled. We want options for containers and hybrid cloud without a risky migration.', priority: 2 },
      { id: 'i3', title: 'Put AI to work safely', detail: 'Staff are using generative AI tools with patient data. We need governance and a first useful use case.', priority: 3 },
      { id: 'i4', title: 'Fix the patient contact center', detail: 'Call wait times hurt patient satisfaction scores; we want self-service and better agent support.', priority: 4 },
      { id: 'i5', title: 'Less manual IT work', detail: 'Ticket backlog and manual provisioning slow every project. We want automation the team can maintain.', priority: 5 },
    ],
  };
}

// ---------------- Briefs ----------------

function BriefEditor({ brief, d }: { brief: InnovationData['briefs'][number]; d: InnovationData }) {
  const set = (fn: (b: Brief) => void, label: string, key?: string) => setData((x) => fn(x.briefs.find((b) => b.id === brief.id)!), label, key ? `${brief.id}-${key}` : undefined);
  const routes = routeBrief(brief, d.researchers);
  return (
    <div class="stack" data-testid="brief-editor">
      <div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <Field label="Customer">
          <TextInput value={brief.customer} onChange={(v) => set((b) => (b.customer = v), 'Brief customer', 'cust')} />
        </Field>
        <Field label="Industry">
          <TextInput value={brief.industry ?? ''} onChange={(v) => set((b) => (b.industry = v), 'Brief industry', 'ind')} />
        </Field>
        <Field label="CIO or contact">
          <TextInput value={brief.contact ?? ''} onChange={(v) => set((b) => (b.contact = v), 'Brief contact', 'con')} />
        </Field>
        <Field label="Received">
          <TextInput value={brief.receivedOn} onChange={(v) => set((b) => (b.receivedOn = v), 'Brief date', 'date')} />
        </Field>
      </div>
      <div class="row">
        <label class="small row">
          <input type="checkbox" checked={brief.anonymize} onChange={(e) => set((b) => (b.anonymize = (e.target as HTMLInputElement).checked), 'Brief anonymize')} /> Anonymize research packets (customer, contact and the terms below become placeholders)
        </label>
      </div>
      <Field label="Other sensitive terms to hide (comma separated)" hint="Project names, product names, people. Restored when results come back.">
        <TextInput value={brief.sensitiveTerms.join(', ')} onChange={(v) => set((b) => (b.sensitiveTerms = v.split(',').map((x) => x.trim()).filter(Boolean)), 'Brief terms', 'terms')} />
      </Field>
      <Field label="Constraints (budget, team, timing)">
        <TextInput value={brief.constraints ?? ''} onChange={(v) => set((b) => (b.constraints = v), 'Brief constraints', 'cons')} />
      </Field>
      <h3>Initiatives and challenges</h3>
      {brief.initiatives.length < 3 && <p class="small muted">CIO briefs usually carry 3 to 5 initiatives.</p>}
      {brief.initiatives.map((ini, k) => {
        const mine = routes.filter((r) => r.initiativeId === ini.id);
        return (
          <div class="card" key={ini.id}>
            <div class="row" style="align-items:flex-end">
              <div style="flex:1">
                <Field label={`Initiative ${k + 1}`}>
                  <TextInput value={ini.title} onChange={(v) => set((b) => (b.initiatives[k].title = v), 'Initiative title', `t${ini.id}`)} />
                </Field>
              </div>
              <Field label="Priority">
                <NumberInput value={ini.priority ?? null} onChange={(v) => set((b) => (b.initiatives[k].priority = v ?? undefined), 'Initiative priority', `p${ini.id}`)} />
              </Field>
              <button class="btn small ghost" onClick={() => set((b) => b.initiatives.splice(k, 1), 'Removed initiative')}>
                Remove
              </button>
            </div>
            <Field label="What they want and what stands in the way">
              <textarea class="text" rows={2} value={ini.detail} onInput={(e) => set((b) => (b.initiatives[k].detail = (e.target as HTMLTextAreaElement).value), 'Initiative detail', `d${ini.id}`)} />
            </Field>
            <div class="row small" style="margin-top:6px">
              <span class="muted">Researchers:</span>
              {DOMAINS.map((dm) => {
                const on = mine.some((r) => r.domain === dm);
                const manual = !!ini.domains?.length;
                return (
                  <button
                    key={dm}
                    class={`btn small ${on ? 'primary' : ''}`}
                    aria-pressed={on}
                    title={mine.find((r) => r.domain === dm)?.matched.join(', ') || ''}
                    onClick={() =>
                      set((b) => {
                        const cur = manual ? [...(ini.domains ?? [])] : mine.map((r) => r.domain);
                        b.initiatives[k].domains = on ? cur.filter((x) => x !== dm) : [...cur, dm];
                      }, 'Routed initiative')
                    }
                  >
                    {DOMAIN_LABEL[dm]}
                  </button>
                );
              })}
              <span class="muted">{ini.domains?.length ? 'set by you' : 'routed automatically; hover a researcher to see why'}</span>
              {ini.domains?.length ? (
                <button class="btn small ghost" onClick={() => set((b) => (b.initiatives[k].domains = undefined), 'Auto-route initiative')}>
                  Auto-route
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      <div>
        <button class="btn small" onClick={() => set((b) => b.initiatives.push({ id: `i${Date.now().toString(36)}`, title: 'New initiative', detail: '' }), 'Added initiative')} disabled={brief.initiatives.length >= 8}>
          Add initiative
        </button>
      </div>
      <div class="row">
        <button class="btn primary" onClick={() => navigate(`/innovation/research/${brief.id}`)}>
          Research this brief
        </button>
        <button
          class="btn danger"
          onClick={() => {
            if (!confirm('Delete this brief and its findings? You can undo.')) return;
            setData((x) => {
              x.briefs = x.briefs.filter((b) => b.id !== brief.id);
              x.findings = x.findings.filter((f) => f.briefId !== brief.id);
            }, 'Deleted brief');
            navigate('/innovation/briefs');
          }}
        >
          Delete brief
        </button>
      </div>
    </div>
  );
}

function Briefs({ params }: ViewProps) {
  const ws = useWorkspace();
  const d = dataOf(ws);
  const sel = d.briefs.find((b) => b.id === params[0]) ?? d.briefs[0];
  const add = (b: Brief) => {
    setData((x) => x.briefs.push(b), 'Added brief');
    navigate(`/innovation/briefs/${b.id}`);
  };
  return (
    <div class="scenario-layout">
      <div class="scenario-list">
        {d.briefs.map((b) => (
          <a key={b.id} href={`#/innovation/briefs/${b.id}`} class={sel?.id === b.id ? 'active' : ''}>
            {b.customer || 'Untitled'}
            <div class="small muted">
              {b.receivedOn}, {b.initiatives.length} initiatives
            </div>
          </a>
        ))}
        <div class="row" style="margin-top:10px">
          <button class="btn small" onClick={() => add({ id: newId('brief'), customer: '', receivedOn: today(), anonymize: true, sensitiveTerms: [], initiatives: [1, 2, 3].map((n) => ({ id: `i${n}`, title: '', detail: '' })) })}>
            New brief
          </button>
          <button class="btn small" onClick={() => add(sampleBrief())} data-testid="sample-brief">
            Sample brief
          </button>
        </div>
      </div>
      {sel ? <BriefEditor brief={sel} d={d} /> : <Empty>No briefs yet. Start one from a CIO's top 3 to 5 initiatives, or open the sample brief.</Empty>}
    </div>
  );
}

// ---------------- Research ----------------

function Research({ params }: ViewProps) {
  const ws = useWorkspace();
  const d = dataOf(ws);
  const brief = d.briefs.find((b) => b.id === params[0]) ?? d.briefs[0];
  const catalog = catalogOf(ws);
  const active = activeCatalog(ws);
  const [report, setReport] = useState<string[] | null>(null);
  if (!brief) return <Empty>Add a brief first.</Empty>;
  const routes = routeBrief(brief, d.researchers);
  const findings = d.findings.filter((f) => f.briefId === brief.id);
  const masking = buildMasking(brief);

  const exportPacket = () => {
    if (!active.length) return toast('The startup catalog is empty. Load it in Startup catalog first.');
    const { text, masking: m } = handoffRunner.prepare(brief, { catalog: active, catalogName: DTC_NAME, researchers: d.researchers });
    setData((x) => (x.briefs.find((b) => b.id === brief.id)!.lastPacket = { at: new Date().toISOString(), masking: m }), 'Exported research packet');
    downloadBlob(new Blob([text], { type: 'text/markdown' }), `research-request-${brief.anonymize ? brief.id : slug(brief.customer)}-${today()}.md`);
    toast(brief.anonymize ? 'Packet exported with the customer anonymized' : 'Packet exported as written');
  };
  const importPack = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const raw = JSON.parse((await f.text()).replace(/^\s*```(json)?\s*|\s*```\s*$/g, ''));
      const r = importResearchPack(raw, brief, catalog, brief.lastPacket?.masking ?? masking, () => newId('fd'), f.name);
      setData((x) => {
        // A new pack replaces earlier findings for the same researcher and initiative.
        const keys = new Set(r.findings.map((n) => `${n.initiativeId}|${n.domain}`));
        x.findings = [...x.findings.filter((o) => o.briefId !== brief.id || !keys.has(`${o.initiativeId}|${o.domain}`)), ...r.findings];
      }, `Imported research pack ${f.name}`);
      setReport([`${r.findings.length} findings, ${r.findings.reduce((s, x) => s + x.startups.length, 0)} startup recommendations.`, ...r.problems]);
    } catch (e) {
      toast(`Could not import: ${(e as Error).message}`);
    }
  };
  const setPick = (fid: string, sid: string, status: 'approved' | 'rejected' | 'suggested') =>
    setData((x) => {
      const p = x.findings.find((f) => f.id === fid)?.startups.find((s) => s.startupId === sid);
      if (p) p.status = status;
    }, `Startup ${status}`);
  const name = (id: string) => catalog.find((s) => s.id === id)?.name ?? id;

  return (
    <div class="stack">
      <div class="row">
        <Select value={brief.id} options={d.briefs.map((b) => b.id)} labels={Object.fromEntries(d.briefs.map((b) => [b.id, `${b.customer || 'Untitled'} (${b.receivedOn})`]))} onChange={(v) => navigate(`/innovation/research/${v}`)} />
        <span style="flex:1" />
        <button class="btn" onClick={exportPacket} data-testid="export-packet">
          Export research packet
        </button>
        <button class="btn" onClick={importPack} data-testid="import-research">
          Import research pack
        </button>
        <button class="btn primary" onClick={() => navigate(`/innovation/output/${brief.id}`)}>
          Innovation brief
        </button>
      </div>
      <details class="small">
        <summary>How the research runs</summary>
        <ol>
          <li>Export research packet: instructions for each researcher, the brief{brief.anonymize ? ' with the customer replaced by placeholders' : ''}, and the {DTC_NAME} shortlisted by domain.</li>
          <li>Give it to Claude and ask it to act as the research panel. Save the JSON answer.</li>
          <li>Import research pack. Placeholders are put back, and every recommended startup is checked against the catalog.</li>
          <li>Approve the startups worth introducing. Only approved ones appear on the innovation brief.</li>
        </ol>
        <p>This is the hand-off mode. A live mode that calls Claude from the app can be added later as a separate, opt-in build.</p>
      </details>
      {brief.lastPacket && <p class="small muted">Last packet exported {brief.lastPacket.at.slice(0, 16).replace('T', ' ')}.</p>}
      {brief.initiatives.map((ini) => {
        const mine = routes.filter((r) => r.initiativeId === ini.id);
        return (
          <div class="card" key={ini.id} data-testid={`initiative-${ini.id}`}>
            <h3 style="margin:0">{ini.title}</h3>
            <p class="small muted">{ini.detail}</p>
            <div class="grid2">
              {mine.map((ro) => {
                const r = d.researchers.find((x) => x.domain === ro.domain)!;
                const f = findings.find((x) => x.initiativeId === ini.id && x.domain === ro.domain);
                const short = prescreen(ini, ro.domain, active, d.researchers, 5);
                return (
                  <div key={ro.domain} class="card" style="padding:12px">
                    <b>{r.name}</b>
                    {f ? (
                      <div class="stack" style="gap:6px;margin-top:6px">
                        <p class="small" style="margin:0">{sanitizeText(f.summary)}</p>
                        {f.approach && <p class="small muted" style="margin:0">Approach: {sanitizeText(f.approach)}</p>}
                        {f.startups.map((p) => (
                          <div key={p.startupId} class="small" style="border-top:1px solid var(--line);padding-top:6px">
                            <div class="row">
                              <b style="flex:1">{name(p.startupId)}</b>
                              <span class={`badge ${p.fit === 'high' ? 'pass' : p.fit === 'medium' ? 'Assumed' : 'Open'}`}>{p.fit} fit</span>
                              <span class={`badge ${p.status === 'approved' ? 'pass' : p.status === 'rejected' ? 'fail' : 'Open'}`}>{p.status}</span>
                            </div>
                            <div>{sanitizeText(p.why)}</div>
                            {p.risks && <div class="muted">Risks: {sanitizeText(p.risks)}</div>}
                            {p.questions.length > 0 && <div class="muted">Ask: {p.questions.join(' ')}</div>}
                            {catalog.find((s) => s.id === p.startupId)?.verified === false && <div class="muted">Catalog facts not yet verified by the office.</div>}
                            <div class="row" style="margin-top:4px">
                              <button class="btn small" onClick={() => setPick(f.id, p.startupId, 'approved')} data-testid="approve-startup">
                                Approve
                              </button>
                              <button class="btn small ghost" onClick={() => setPick(f.id, p.startupId, 'rejected')}>
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}
                        {f.openQuestions.length > 0 && <div class="small muted">Ask the CIO: {f.openQuestions.join(' ')}</div>}
                      </div>
                    ) : (
                      <div class="small" style="margin-top:6px">
                        <span class="muted">No research yet. Offline shortlist from the catalog:</span>
                        <ul style="margin:4px 0 0;padding-left:18px">
                          {short.length ? short.map((c) => <li key={c.startup.id} title={c.why.join(', ')}>{c.startup.name}{c.startup.description ? `: ${c.startup.description}` : ''}</li>) : <li class="muted">Nothing matched by keywords.</li>}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {report && (
        <Modal title="Research pack imported" onClose={() => setReport(null)}>
          <ul class="small">
            {report.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

// ---------------- Innovation brief (customer output) ----------------

function Output({ params }: ViewProps) {
  const ws = useWorkspace();
  const d = dataOf(ws);
  const brief = d.briefs.find((b) => b.id === params[0]) ?? d.briefs[0];
  if (!brief) return <Empty>Add a brief first.</Empty>;
  const catalog = catalogOf(ws);
  const rep = briefReport(brief, d.findings, catalog, d.researchers);
  const md = briefMarkdown(brief, rep, DTC_NAME);
  const approved = rep.reduce((s, r) => s + r.startups.length, 0);
  return (
    <div class="stack" data-testid="innovation-output">
      <div class="row no-print">
        <Select value={brief.id} options={d.briefs.map((b) => b.id)} labels={Object.fromEntries(d.briefs.map((b) => [b.id, `${b.customer || 'Untitled'} (${b.receivedOn})`]))} onChange={(v) => navigate(`/innovation/output/${v}`)} />
        <span style="flex:1" />
        <button class="btn" onClick={() => downloadBlob(new Blob([sanitizeText(md)], { type: 'text/markdown' }), `innovation-brief-${slug(brief.customer)}-${today()}.md`)}>
          Download as Markdown
        </button>
        <button class="btn" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      {approved === 0 && <div class="callout no-print">No approved startups yet. Approve recommendations in Research; only approved companies appear here.</div>}
      <div>
        <div class="small muted">redesign innovation research</div>
        <h1 style="margin:2px 0">Innovation brief for {brief.customer}</h1>
        <div class="small muted">Brief received {brief.receivedOn}</div>
      </div>
      {rep.map((r) => (
        <div key={r.initiative.id} class="card">
          <h2>{r.initiative.title}</h2>
          <p class="muted">{r.initiative.detail}</p>
          {r.perspectives.length === 0 && <p class="small muted">Research in progress.</p>}
          {r.perspectives.map((p) => (
            <p key={p.domain} class="small">
              <b>{p.researcher}.</b> {sanitizeText(p.summary)} {p.approach ? sanitizeText(p.approach) : ''}
            </p>
          ))}
          {r.startups.length > 0 && (
            <>
              <h3>Companies worth meeting</h3>
              <ul class="small">
                {r.startups.map((s) => (
                  <li key={s.startup.id}>
                    <b>{s.startup.name}</b>: {s.startup.description} <span class="muted">Why: {sanitizeText(s.picks[0].why)}</span> {s.startup.website && <span class="muted">({s.startup.website})</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
      <p class="small muted">
        Startup information is from the {DTC_NAME} and public sources (as of {DTC_AS_OF}){rep.some((r) => r.startups.some((s) => !s.startup.verified)) ? '; some details are not yet verified by redesign' : ''}. Introductions are offered for evaluation only.
      </p>
    </div>
  );
}

// ---------------- Researchers ----------------

function Researchers() {
  const ws = useWorkspace();
  const d = dataOf(ws);
  const set = (dm: Domain, fn: (r: Researcher) => void, key: string) =>
    setData((x) => {
      if (!(ws.modules.innovation as Partial<InnovationData> | undefined)?.researchers?.length) x.researchers = structuredClone(DEFAULT_RESEARCHERS);
      fn(x.researchers.find((r) => r.domain === dm)!);
    }, 'Edited researcher', `rs-${dm}-${key}`);
  return (
    <div class="stack">
      <p class="muted small">Each researcher's focus and questions go into every packet. Keywords decide which initiatives reach them.</p>
      <div class="grid2">
        {d.researchers.map((r) => (
          <div class="card" key={r.domain}>
            <Field label="Name">
              <TextInput value={r.name} onChange={(v) => set(r.domain, (x) => (x.name = v), 'name')} />
            </Field>
            <Field label="Focus">
              <textarea class="text" rows={2} value={r.focus} onInput={(e) => set(r.domain, (x) => (x.focus = (e.target as HTMLTextAreaElement).value), 'focus')} />
            </Field>
            <Field label="Routing keywords (comma separated)">
              <textarea class="text" rows={2} value={r.keywords.join(', ')} onInput={(e) => set(r.domain, (x) => (x.keywords = (e.target as HTMLTextAreaElement).value.split(',').map((k) => k.trim()).filter(Boolean)), 'kw')} />
            </Field>
            <Field label="Questions it always asks (one per line)">
              <textarea class="text" rows={3} value={r.lens.join('\n')} onInput={(e) => set(r.domain, (x) => (x.lens = (e.target as HTMLTextAreaElement).value.split('\n').filter(Boolean)), 'lens')} />
            </Field>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Startup catalog ----------------

function Catalog() {
  const ws = useWorkspace();
  const all = catalogOf(ws);
  const counts = DOMAINS.map((dm) => [dm, all.filter((s) => s.domains.includes(dm) && s.status !== 'exited').length] as const);
  const load = () => {
    const fresh = dtcCatalog();
    update((w) => {
      const cur = new Map(catalogOf(w).map((s) => [s.id, s]));
      for (const s of fresh) {
        const old = cur.get(s.id);
        // Keep the office's own checks and notes; refresh the public facts.
        cur.set(s.id, old ? { ...old, ...s, description: s.description || old.description, verified: old.verified, notes: old.notes } : s);
      }
      (w.entities as Record<string, unknown[]>).startups = [...cur.values()];
    }, `Loaded ${DTC_NAME}`);
    toast(`Loaded ${fresh.length} companies (${fresh.filter((s) => s.status !== 'exited').length} active)`);
  };
  return (
    <div class="stack">
      <div class="row">
        <button class="btn primary" onClick={load} data-testid="load-dtc">
          Load {DTC_NAME}
        </button>
        <span class="small muted">
          {all.length} companies. Active by researcher: {counts.map(([dm, n]) => `${DOMAIN_LABEL[dm]} ${n}`).join(', ')}. Exited companies stay in the catalog but are not recommended.
        </span>
      </div>
      <div class="callout small">
        Compiled from the public DTC portfolio page on {DTC_AS_OF}; descriptions come from each company's website. Mark a company verified once the office has checked it. Unverified companies carry a note on customer output. Add other catalogs (another fund, your own list) through Data &gt; Import as "Startup catalog".
      </div>
      <EntityTable title="Startups" schema={STARTUP_SCHEMA} newRow={() => ({ id: newId('st'), name: 'New startup', description: '', domains: [], categories: [], verified: false })} />
    </div>
  );
}

export const innovationModule: ModuleManifest = {
  id: 'innovation',
  title: 'Innovation research',
  icon: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  navOrder: 48,
  entities: [STARTUP_SCHEMA],
  migrations: { version: VERSION, migrate: (_from, data) => data ?? { briefs: [], findings: [], researchers: DEFAULT_RESEARCHERS } },
  views: [
    { id: 'briefs', title: 'CIO briefs', component: Briefs },
    { id: 'research', title: 'Research', component: Research },
    { id: 'output', title: 'Innovation brief', component: Output },
    { id: 'researchers', title: 'Researchers', component: Researchers },
    { id: 'catalog', title: 'Startup catalog', component: Catalog },
  ],
};
