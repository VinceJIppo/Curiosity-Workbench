// Innovation research: a panel of virtual domain researchers works a CIO brief
// against a catalog of startups. Pure and deterministic.
//
// The app stays offline. It routes each initiative to the right researchers,
// pre-screens the catalog, and writes a research packet (anonymized by default).
// Claude plays the panel and returns a research pack, which the app validates,
// de-anonymizes and stores for review. `ResearchRunner` is the seam for a later,
// opt-in live mode.

export const DOMAINS = ['cybersecurity', 'automation', 'ai', 'virtualization', 'cx'] as const;
export type Domain = (typeof DOMAINS)[number];

export interface Researcher {
  domain: Domain;
  name: string;
  /** What this researcher looks at, in plain words. Goes into the packet. */
  focus: string;
  /** Words that route an initiative to this researcher. */
  keywords: string[];
  /** Questions this researcher always asks of a startup. */
  lens: string[];
}

export const DEFAULT_RESEARCHERS: Researcher[] = [
  {
    domain: 'cybersecurity',
    name: 'Cybersecurity researcher',
    focus: 'Threat detection and response, identity, zero trust, cloud and data security, security operations and resilience.',
    keywords: ['security', 'cyber', 'threat', 'ransomware', 'soc', 'siem', 'xdr', 'edr', 'identity', 'zero trust', 'iam', 'phishing', 'compliance', 'risk', 'vulnerability', 'breach', 'firewall', 'sase', 'dlp', 'privacy', 'resilience', 'backup', 'recovery'],
    lens: ['What threat or risk does it remove, and how is that measured?', 'How does it fit the existing security stack and SOC workflow?', 'What data leaves the customer environment?'],
  },
  {
    domain: 'automation',
    name: 'Automation researcher',
    focus: 'IT and business process automation, infrastructure as code, IT operations and observability, DevOps and platform engineering.',
    keywords: ['automation', 'automate', 'workflow', 'process', 'manual', 'itsm', 'itops', 'aiops', 'observability', 'monitoring', 'devops', 'ci/cd', 'pipeline', 'infrastructure as code', 'terraform', 'ansible', 'orchestration', 'self-service', 'ticket', 'efficiency', 'toil', 'platform engineering'],
    lens: ['What manual work does it remove, and for which team?', 'What does it integrate with on day one?', 'Who maintains the automations after go-live?'],
  },
  {
    domain: 'ai',
    name: 'AI researcher',
    focus: 'Generative and predictive AI, AI infrastructure and data platforms, AI governance and security, copilots and agents for the business.',
    keywords: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'genai', 'generative', 'llm', 'copilot', 'agent', 'agents', 'model', 'gpu', 'data platform', 'analytics', 'data', 'prediction', 'forecast', 'knowledge', 'search', 'rag'],
    lens: ['What business outcome does the AI change, and how is it measured?', 'What data does it need, and is that data ready?', 'How are models governed, secured and costed?'],
  },
  {
    domain: 'virtualization',
    name: 'Virtualization researcher',
    focus: 'Virtualization, private and hybrid cloud, containers and Kubernetes, storage and data protection, edge and datacenter modernization.',
    keywords: ['virtualization', 'vmware', 'hypervisor', 'vm', 'private cloud', 'hybrid cloud', 'multicloud', 'cloud', 'kubernetes', 'container', 'storage', 'datacenter', 'data center', 'hci', 'edge', 'migration', 'modernization', 'disaster recovery', 'licensing', 'infrastructure', 'cost'],
    lens: ['What does it replace or extend in the current platform?', 'What is the migration path and the risk during it?', 'How does it change licensing and running cost?'],
  },
  {
    domain: 'cx',
    name: 'Customer experience researcher',
    focus: 'Customer and employee experience: contact center, digital channels, personalization, customer data, feedback and service quality.',
    keywords: ['customer experience', 'cx', 'customer', 'customers', 'contact center', 'call center', 'service', 'support', 'satisfaction', 'nps', 'csat', 'personalization', 'digital', 'portal', 'self-service', 'employee experience', 'engagement', 'journey', 'retention', 'churn', 'omnichannel'],
    lens: ['Which customer or employee moment does it improve?', 'How is the improvement measured (CSAT, NPS, handle time, churn)?', 'What systems of record does it need access to?'],
  },
];

export interface Initiative {
  id: string;
  title: string;
  /** What the CIO wants to achieve and what stands in the way. */
  detail: string;
  priority?: number;
  /** Researchers assigned. Empty means route automatically. */
  domains?: Domain[];
}

export interface Brief {
  id: string;
  customer: string;
  industry?: string;
  contact?: string;
  receivedOn: string;
  initiatives: Initiative[];
  constraints?: string;
  /** Words to hide in packets besides the customer name, for example project or product names. */
  sensitiveTerms: string[];
  anonymize: boolean;
}

export interface Startup {
  id: string;
  name: string;
  description: string;
  domains: Domain[];
  categories: string[];
  status?: string;
  website?: string;
  investor?: string;
  source?: string;
  asOf?: string;
  /** Office has checked the facts. Unverified startups carry a warning on customer output. */
  verified?: boolean;
  notes?: string;
}

// ---------------- Routing ----------------

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9/+]+/g, ' ')} `;

function hits(text: string, words: string[]): string[] {
  const t = norm(text);
  return words.filter((w) => t.includes(norm(w)));
}

export interface Routing {
  initiativeId: string;
  domain: Domain;
  matched: string[];
  manual: boolean;
}

/** Which researchers take each initiative. Manual choices win; otherwise keyword matches, at least one. */
export function routeBrief(brief: Brief, researchers: Researcher[] = DEFAULT_RESEARCHERS): Routing[] {
  const out: Routing[] = [];
  for (const i of brief.initiatives) {
    if (i.domains && i.domains.length) {
      for (const d of i.domains) out.push({ initiativeId: i.id, domain: d, matched: [], manual: true });
      continue;
    }
    const scored = researchers.map((r) => ({ r, m: hits(`${i.title} ${i.detail}`, r.keywords) })).filter((x) => x.m.length);
    scored.sort((a, b) => b.m.length - a.m.length);
    const best = scored[0]?.m.length ?? 0;
    // Take every researcher with at least half the best match count, so cross-domain initiatives reach several.
    const chosen = scored.filter((x) => x.m.length >= Math.max(1, best / 2));
    if (!chosen.length) for (const r of researchers) out.push({ initiativeId: i.id, domain: r.domain, matched: [], manual: false });
    else for (const x of chosen) out.push({ initiativeId: i.id, domain: x.r.domain, matched: x.m, manual: false });
  }
  return out;
}

// ---------------- Pre-screen ----------------

export interface Candidate {
  startup: Startup;
  score: number;
  why: string[];
}

/** Offline first pass: startups in the researcher's domain whose description shares words with the initiative. */
export function prescreen(initiative: Initiative, domain: Domain, catalog: Startup[], researchers: Researcher[] = DEFAULT_RESEARCHERS, limit = 12): Candidate[] {
  const r = researchers.find((x) => x.domain === domain);
  const text = `${initiative.title} ${initiative.detail}`;
  const words = [...new Set(norm(text).trim().split(' ').filter((w) => w.length > 3))];
  const out: Candidate[] = [];
  for (const s of catalog) {
    const inDomain = s.domains.includes(domain);
    const about = `${s.description} ${s.categories.join(' ')}`;
    const kw = r ? hits(about, r.keywords).filter((k) => hits(text, [k]).length) : [];
    const shared = words.filter((w) => norm(about).includes(` ${w} `));
    let score = (inDomain ? 3 : 0) + kw.length * 2 + shared.length;
    if (s.status === 'exited') score -= 1;
    if (score < 3) continue;
    const why = [...(inDomain ? [`${domain} company`] : []), ...kw.map((k) => `matches "${k}"`), ...shared.slice(0, 4).map((w) => `mentions "${w}"`)];
    out.push({ startup: s, score, why });
  }
  return out.sort((a, b) => b.score - a.score || a.startup.name.localeCompare(b.startup.name)).slice(0, limit);
}

// ---------------- Anonymization ----------------

export interface Masking {
  /** token -> original */
  map: Record<string, string>;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildMasking(brief: Brief): Masking {
  const map: Record<string, string> = {};
  if (!brief.anonymize) return { map };
  if (brief.customer.trim()) map['[CUSTOMER]'] = brief.customer.trim();
  if (brief.contact?.trim()) map['[CONTACT]'] = brief.contact.trim();
  brief.sensitiveTerms.map((t) => t.trim()).filter(Boolean).forEach((t, i) => (map[`[TERM${i + 1}]`] = t));
  return { map };
}

/** Replace originals with tokens, longest first, case-insensitive. */
export function mask(text: string, m: Masking): string {
  let out = text;
  for (const [token, orig] of Object.entries(m.map).sort((a, b) => b[1].length - a[1].length)) out = out.replace(new RegExp(escRe(orig), 'gi'), token);
  return out;
}

export function unmask(text: string, m: Masking): string {
  let out = text;
  for (const [token, orig] of Object.entries(m.map)) out = out.split(token).join(orig);
  return out;
}

// ---------------- Packet ----------------

export const PACK_KIND = 'cto-workbench-research-pack';
export const PACK_VERSION = 1;

export interface PacketOptions {
  researchers?: Researcher[];
  catalog: Startup[];
  catalogName: string;
  /** Startups listed per researcher and initiative. */
  limit?: number;
}

/** The research request: instructions for the panel, the masked brief, routing and the shortlisted catalog. */
export function researchPacket(brief: Brief, opts: PacketOptions): { text: string; masking: Masking } {
  const researchers = opts.researchers ?? DEFAULT_RESEARCHERS;
  const m = buildMasking(brief);
  const routes = routeBrief(brief, researchers);
  const used = new Map<string, Startup>();
  const sections: string[] = [];
  for (const r of researchers) {
    const mine = routes.filter((x) => x.domain === r.domain);
    if (!mine.length) continue;
    const parts = [`## ${r.name} (domain: ${r.domain})`, `Focus: ${r.focus}`, `Always ask: ${r.lens.join(' ')}`];
    for (const ro of mine) {
      const ini = brief.initiatives.find((i) => i.id === ro.initiativeId)!;
      const cands = prescreen(ini, r.domain, opts.catalog, researchers, opts.limit ?? 12);
      cands.forEach((c) => used.set(c.startup.id, c.startup));
      parts.push(`### Initiative ${ini.id}: ${mask(ini.title, m)}`, `Shortlisted startups (pre-screened by keywords; you may use any startup in the catalog below): ${cands.length ? cands.map((c) => `${c.startup.name} [${c.startup.id}]`).join(', ') : 'none matched, search the full catalog'}`);
    }
    sections.push(parts.join('\n'));
  }
  // The catalog: every startup in a routed domain, so researchers can look past the shortlist.
  const domains = new Set(routes.map((x) => x.domain));
  for (const s of opts.catalog) if (s.domains.some((d) => domains.has(d))) used.set(s.id, s);
  const catalogLines = [...used.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `- [${s.id}] ${s.name} (${s.domains.join(', ')}${s.status ? `; ${s.status}` : ''}): ${s.description}${s.website ? ` ${s.website}` : ''}`);

  const initiatives = brief.initiatives
    .map((i, k) => `${k + 1}. [${i.id}] ${mask(i.title, m)}${i.priority ? ` (priority ${i.priority})` : ''}\n   ${mask(i.detail, m)}`)
    .join('\n');

  const text = `# Innovation research request

You are redesign's innovation research team: a panel of virtual domain researchers.
redesign is an IT solution provider. A CIO has shared the brief below. Each researcher
works the initiatives routed to them, using the startup catalog "${opts.catalogName}",
and recommends startups redesign could introduce to the customer.

## The brief${brief.anonymize ? ' (anonymized: keep tokens such as [CUSTOMER] exactly as written)' : ''}

Customer: ${mask(brief.customer, m) || 'not given'}${brief.industry ? `\nIndustry: ${brief.industry}` : ''}
Received: ${brief.receivedOn}

Initiatives and challenges:
${initiatives}
${brief.constraints ? `\nConstraints: ${mask(brief.constraints, m)}\n` : ''}
# Researchers and their assignments

${sections.join('\n\n')}

# Startup catalog

${catalogLines.join('\n') || '(empty)'}

# What to return

Return ONLY a JSON object in this shape (a research pack):

{
  "kind": "${PACK_KIND}",
  "version": ${PACK_VERSION},
  "briefId": "${brief.id}",
  "findings": [
    {
      "initiativeId": "<id from the brief>",
      "domain": "<one of: ${DOMAINS.join(', ')}>",
      "summary": "What this researcher thinks the customer needs, in two or three plain sentences.",
      "approach": "How redesign could approach it, independent of any startup.",
      "startups": [
        {
          "startupId": "<id from the catalog, for example ${opts.catalog[0]?.id ?? 'st-example'}>",
          "fit": "high | medium | low",
          "why": "Why this startup fits this initiative.",
          "risks": "Adoption, integration or vendor risks to check.",
          "questions": ["Questions to ask the startup before an introduction"],
          "sources": ["URLs or 'catalog' for every fact you state"]
        }
      ],
      "openQuestions": ["What to ask the CIO next"],
      "confidence": "high | medium | low"
    }
  ]
}

Rules:
- One finding per researcher per routed initiative. A researcher with nothing useful says so in the summary and returns no startups.
- Recommend only startups from the catalog above, by their id. At most three per finding, best first.
- Do not invent facts about startups or the customer. If you are unsure, say so in "risks".
- Plain, direct language. Do not use em dashes. Write "redesign" in lowercase.
- Name the Broadcom DR product "VMware Protection and Recovery".
`;
  return { text, masking: m };
}

// ---------------- Research packs ----------------

export type Fit = 'high' | 'medium' | 'low';

export interface StartupPick {
  startupId: string;
  fit: Fit;
  why: string;
  risks?: string;
  questions: string[];
  sources: string[];
  /** Office review. Only approved picks appear on customer output. */
  status: 'suggested' | 'approved' | 'rejected';
}

export interface Finding {
  id: string;
  briefId: string;
  initiativeId: string;
  domain: Domain;
  summary: string;
  approach?: string;
  startups: StartupPick[];
  openQuestions: string[];
  confidence?: Fit;
  importedAt: string;
  origin: string;
}

export interface ResearchImport {
  findings: Finding[];
  problems: string[];
}

export class ResearchError extends Error {}

const asFit = (v: unknown): Fit => (v === 'high' || v === 'medium' || v === 'low' ? v : 'medium');
const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : typeof v === 'string' && v ? [v] : []);

/** Validates a research pack, maps startups to the catalog and restores masked names. */
export function importResearchPack(pack: unknown, brief: Brief, catalog: Startup[], masking: Masking, newId: () => string, origin: string, now = new Date().toISOString()): ResearchImport {
  const p = pack as Record<string, any>;
  if (!p || p.kind !== PACK_KIND || !Array.isArray(p.findings)) throw new ResearchError('Not a research pack. Expected "kind": "cto-workbench-research-pack".');
  const problems: string[] = [];
  if (p.briefId && p.briefId !== brief.id) problems.push(`Pack is for brief ${p.briefId}, imported into ${brief.id}`);
  const byName = new Map(catalog.map((s) => [s.name.toLowerCase(), s]));
  const findings: Finding[] = [];
  p.findings.forEach((f: Record<string, any>, i: number) => {
    const where = `Finding ${i + 1}`;
    const ini = brief.initiatives.find((x) => x.id === f?.initiativeId);
    if (!ini) return problems.push(`${where}: unknown initiative "${f?.initiativeId}"`);
    if (!DOMAINS.includes(f.domain)) return problems.push(`${where}: unknown domain "${f.domain}"`);
    const picks: StartupPick[] = [];
    for (const [j, s] of (Array.isArray(f.startups) ? f.startups : []).entries()) {
      const hit = catalog.find((c) => c.id === s?.startupId) ?? byName.get(String(s?.startupId ?? s?.name ?? '').toLowerCase());
      if (!hit) {
        problems.push(`${where}, startup ${j + 1}: "${s?.startupId ?? s?.name}" is not in the catalog; left out`);
        continue;
      }
      picks.push({
        startupId: hit.id,
        fit: asFit(s.fit),
        why: unmask(String(s.why ?? ''), masking),
        risks: s.risks ? unmask(String(s.risks), masking) : undefined,
        questions: strs(s.questions).map((q) => unmask(q, masking)),
        sources: strs(s.sources),
        status: 'suggested',
      });
    }
    findings.push({
      id: newId(),
      briefId: brief.id,
      initiativeId: ini.id,
      domain: f.domain,
      summary: unmask(String(f.summary ?? ''), masking),
      approach: f.approach ? unmask(String(f.approach), masking) : undefined,
      startups: picks,
      openQuestions: strs(f.openQuestions).map((q) => unmask(q, masking)),
      confidence: f.confidence ? asFit(f.confidence) : undefined,
      importedAt: now,
      origin,
    });
  });
  return { findings, problems };
}

// ---------------- Customer output ----------------

export interface BriefReport {
  initiative: Initiative;
  perspectives: { domain: Domain; researcher: string; summary: string; approach?: string; openQuestions: string[] }[];
  startups: { startup: Startup; picks: (StartupPick & { domain: Domain })[] }[];
}

/** Approved picks per initiative, grouped by startup, for the customer-facing innovation brief. */
export function briefReport(brief: Brief, findings: Finding[], catalog: Startup[], researchers: Researcher[] = DEFAULT_RESEARCHERS): BriefReport[] {
  return brief.initiatives.map((ini) => {
    const mine = findings.filter((f) => f.briefId === brief.id && f.initiativeId === ini.id);
    const perspectives = mine.map((f) => ({ domain: f.domain, researcher: researchers.find((r) => r.domain === f.domain)?.name ?? f.domain, summary: f.summary, approach: f.approach, openQuestions: f.openQuestions }));
    const m = new Map<string, (StartupPick & { domain: Domain })[]>();
    for (const f of mine) for (const p of f.startups) if (p.status === 'approved') m.set(p.startupId, [...(m.get(p.startupId) ?? []), { ...p, domain: f.domain }]);
    const rank = { high: 0, medium: 1, low: 2 };
    const startups = [...m.entries()]
      .map(([id, picks]) => ({ startup: catalog.find((s) => s.id === id)!, picks }))
      .filter((x) => x.startup)
      .sort((a, b) => Math.min(...a.picks.map((p) => rank[p.fit])) - Math.min(...b.picks.map((p) => rank[p.fit])) || a.startup.name.localeCompare(b.startup.name));
    return { initiative: ini, perspectives, startups };
  });
}

/** Markdown version of the innovation brief, ready to paste into an email or a document. */
export function briefMarkdown(brief: Brief, report: BriefReport[], catalogName: string): string {
  const lines = [`# Innovation brief for ${brief.customer}`, '', `Prepared by redesign innovation research. Brief received ${brief.receivedOn}.`, ''];
  for (const r of report) {
    lines.push(`## ${r.initiative.title}`, '', r.initiative.detail, '');
    if (!r.perspectives.length) lines.push('_Research in progress._', '');
    for (const p of r.perspectives) lines.push(`**${p.researcher}.** ${p.summary}${p.approach ? ` ${p.approach}` : ''}`, '');
    if (r.startups.length) {
      lines.push('**Companies worth meeting**', '');
      for (const s of r.startups) {
        const best = s.picks[0];
        lines.push(`- **${s.startup.name}**: ${s.startup.description} Why: ${best.why}${s.startup.website ? ` (${s.startup.website})` : ''}`);
      }
      lines.push('');
    }
  }
  const unverified = report.some((r) => r.startups.some((s) => !s.startup.verified));
  lines.push('---', `Startup information is from ${catalogName} and public sources${unverified ? '; some details are not yet verified by redesign' : ''}. Introductions are offered for evaluation only.`);
  return lines.join('\n');
}

// ---------------- Runner seam ----------------

/** How research gets done. Today: hand-off. A live runner can implement the same shape later. */
export interface ResearchRunner {
  kind: 'handoff' | 'live';
  prepare(brief: Brief, opts: PacketOptions): { text: string; masking: Masking };
}

export const handoffRunner: ResearchRunner = { kind: 'handoff', prepare: researchPacket };
