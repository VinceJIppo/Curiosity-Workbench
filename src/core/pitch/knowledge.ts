// Shared sales knowledge: a small graph of what partner decks say, curated by the
// office. Pure and deterministic. See docs/sales-knowledge-architecture.md.
//
// Every node keeps its evidence (deck and slide), so knowledge never detaches from
// the OEM's own words. Freshness and customer safety are derived from that evidence.

export const NODE_KINDS = ['product', 'capability', 'pain', 'persona', 'useCase', 'proof', 'competitor', 'differentiator', 'objection', 'answer', 'service'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const KIND_LABELS: Record<NodeKind, string> = {
  product: 'Product',
  capability: 'Capability',
  pain: 'Pain point',
  persona: 'Persona',
  useCase: 'Use case',
  proof: 'Proof point',
  competitor: 'Competitor',
  differentiator: 'Differentiator',
  objection: 'Objection',
  answer: 'Answer',
  service: 'redesign service',
};

export const RELS = ['has', 'solves', 'feltBy', 'supports', 'against', 'answers', 'attachesTo', 'enables'] as const;
export type Rel = (typeof RELS)[number];

export const REL_LABELS: Record<Rel, string> = {
  has: 'has',
  solves: 'solves',
  feltBy: 'is felt by',
  supports: 'supports',
  against: 'is against',
  answers: 'answers',
  attachesTo: 'attaches to',
  enables: 'enables',
};

/** Which links make sense: [from kind, relation, to kind]. */
export const ALLOWED: [NodeKind, Rel, NodeKind][] = [
  ['product', 'has', 'capability'],
  ['capability', 'solves', 'pain'],
  ['useCase', 'solves', 'pain'],
  ['pain', 'feltBy', 'persona'],
  ['capability', 'enables', 'useCase'],
  ['proof', 'supports', 'capability'],
  ['proof', 'supports', 'useCase'],
  ['proof', 'supports', 'differentiator'],
  ['differentiator', 'against', 'competitor'],
  ['objection', 'against', 'product'],
  ['answer', 'answers', 'objection'],
  ['service', 'attachesTo', 'product'],
];

export function allowedRels(from: NodeKind, to: NodeKind): Rel[] {
  return ALLOWED.filter(([f, , t]) => f === from && t === to).map(([, r]) => r);
}

export type NodeStatus = 'suggested' | 'approved' | 'retired';

export interface Evidence {
  deckId: string;
  slide: number;
}

export interface KNode {
  id: string;
  kind: NodeKind;
  /** OEM the knowledge belongs to. Empty for personas, generic pains and redesign services. */
  oem?: string;
  text: string;
  notes?: string;
  status: NodeStatus;
  evidence: Evidence[];
  /** Where it came from: seed, manual, or the name of an imported knowledge pack. */
  origin: string;
}

export interface KEdge {
  from: string;
  to: string;
  rel: Rel;
}

export interface KnowledgeBase {
  nodes: KNode[];
  edges: KEdge[];
}

/** What the knowledge layer needs to know about the slide library. */
export interface DeckRef {
  id: string;
  oem: string;
  name: string;
  fileName?: string;
  contentDate: string;
  slides: { index: number; title: string; text?: string; products: string[]; competitors: string[]; internalOnly: boolean }[];
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nodeKey = (n: Pick<KNode, 'kind' | 'oem' | 'text'>) => `${n.kind}|${norm(n.oem ?? '')}|${norm(n.text)}`;

export function emptyKnowledge(): KnowledgeBase {
  return { nodes: [], edges: [] };
}

// ---------------- Derived facts ----------------

/** Newest deck date among the node's evidence, YYYY-MM, or '' with no evidence. */
export function freshAsOf(n: KNode, decks: DeckRef[]): string {
  return n.evidence
    .map((e) => decks.find((d) => d.id === e.deckId)?.contentDate ?? '')
    .filter(Boolean)
    .sort()
    .at(-1) ?? '';
}

/** False when any evidence comes from a slide the OEM marked internal. */
export function customerSafe(n: KNode, decks: DeckRef[]): boolean {
  return n.evidence.every((e) => !decks.find((d) => d.id === e.deckId)?.slides.find((s) => s.index === e.slide)?.internalOnly);
}

/** Evidence that points at a deck or slide no longer in the library. */
export function brokenEvidence(n: KNode, decks: DeckRef[]): Evidence[] {
  return n.evidence.filter((e) => !decks.find((d) => d.id === e.deckId)?.slides.some((s) => s.index === e.slide));
}

function monthsSince(yyyyMm: string, now: Date): number {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return Infinity;
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
}

export function isStaleNode(n: KNode, decks: DeckRef[], staleMonths: number, now: Date): boolean {
  const f = freshAsOf(n, decks);
  return !!f && monthsSince(f, now) > staleMonths;
}

export function neighbors(kb: KnowledgeBase, id: string): { edge: KEdge; node: KNode; dir: 'out' | 'in' }[] {
  const byId = new Map(kb.nodes.map((n) => [n.id, n]));
  const out: { edge: KEdge; node: KNode; dir: 'out' | 'in' }[] = [];
  for (const e of kb.edges) {
    if (e.from === id && byId.has(e.to)) out.push({ edge: e, node: byId.get(e.to)!, dir: 'out' });
    if (e.to === id && byId.has(e.from)) out.push({ edge: e, node: byId.get(e.from)!, dir: 'in' });
  }
  return out;
}

// ---------------- Edits (return new knowledge bases) ----------------

export function upsertNode(kb: KnowledgeBase, n: KNode): KnowledgeBase {
  const i = kb.nodes.findIndex((x) => x.id === n.id);
  const nodes = [...kb.nodes];
  if (i >= 0) nodes[i] = n;
  else nodes.push(n);
  return { ...kb, nodes };
}

export class KnowledgeError extends Error {}

export function link(kb: KnowledgeBase, from: string, rel: Rel, to: string): KnowledgeBase {
  const a = kb.nodes.find((n) => n.id === from);
  const b = kb.nodes.find((n) => n.id === to);
  if (!a || !b) throw new KnowledgeError('Both nodes must exist');
  if (!allowedRels(a.kind, b.kind).includes(rel)) throw new KnowledgeError(`A ${KIND_LABELS[a.kind].toLowerCase()} cannot "${REL_LABELS[rel]}" a ${KIND_LABELS[b.kind].toLowerCase()}`);
  if (kb.edges.some((e) => e.from === from && e.to === to && e.rel === rel)) return kb;
  return { ...kb, edges: [...kb.edges, { from, to, rel }] };
}

export function unlink(kb: KnowledgeBase, e: KEdge): KnowledgeBase {
  return { ...kb, edges: kb.edges.filter((x) => !(x.from === e.from && x.to === e.to && x.rel === e.rel)) };
}

export function removeNode(kb: KnowledgeBase, id: string): KnowledgeBase {
  return { nodes: kb.nodes.filter((n) => n.id !== id), edges: kb.edges.filter((e) => e.from !== id && e.to !== id) };
}

/** Merge `drop` into `keep`: evidence and links move over, duplicates collapse. */
export function mergeNodes(kb: KnowledgeBase, keep: string, drop: string): KnowledgeBase {
  const k = kb.nodes.find((n) => n.id === keep);
  const d = kb.nodes.find((n) => n.id === drop);
  if (!k || !d || keep === drop) return kb;
  if (k.kind !== d.kind) throw new KnowledgeError('Only nodes of the same kind can be merged');
  const evidence = dedupeEvidence([...k.evidence, ...d.evidence]);
  const status: NodeStatus = k.status === 'approved' || d.status === 'approved' ? 'approved' : k.status;
  const nodes = kb.nodes.filter((n) => n.id !== drop).map((n) => (n.id === keep ? { ...k, evidence, status } : n));
  const seen = new Set<string>();
  const edges: KEdge[] = [];
  for (const e of kb.edges) {
    const f = e.from === drop ? keep : e.from;
    const t = e.to === drop ? keep : e.to;
    if (f === t) continue;
    const key = `${f}|${e.rel}|${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from: f, to: t, rel: e.rel });
  }
  return { nodes, edges };
}

function dedupeEvidence(list: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const k = `${e.deckId}:${e.slide}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------- Seeding ----------------

export const STARTER_PERSONAS = ['CISO', 'CIO', 'IT director', 'SOC lead', 'Infrastructure lead', 'CFO', 'Procurement'];
export const STARTER_SERVICES = ['Assessment and design', 'Deployment and migration', 'Managed services and ongoing support'];

/**
 * Seeds products and competitors from the slide library (with the slides that
 * mention them as evidence), plus starter personas and redesign services.
 * Existing nodes are kept and gain any new evidence. Seeded nodes are approved:
 * they are names, not claims.
 */
export function seedFromLibrary(kb: KnowledgeBase, decks: DeckRef[], newId: (kind: NodeKind) => string): { kb: KnowledgeBase; added: number } {
  let out = kb;
  let added = 0;
  const find = (kind: NodeKind, oem: string | undefined, text: string) => out.nodes.find((n) => nodeKey(n) === nodeKey({ kind, oem, text }));
  const put = (kind: NodeKind, oem: string | undefined, text: string, ev: Evidence[]) => {
    const ex = find(kind, oem, text);
    if (ex) out = upsertNode(out, { ...ex, evidence: dedupeEvidence([...ex.evidence, ...ev]) });
    else {
      out = upsertNode(out, { id: newId(kind), kind, oem, text, status: 'approved', evidence: ev, origin: 'seed' });
      added++;
    }
  };
  const byName = (pick: (s: DeckRef['slides'][number]) => string[]) => {
    const m = new Map<string, { oem: string; name: string; ev: Evidence[] }>();
    for (const d of decks)
      for (const s of d.slides)
        for (const name of pick(s)) {
          const k = `${d.oem}|${name}`;
          if (!m.has(k)) m.set(k, { oem: d.oem, name, ev: [] });
          m.get(k)!.ev.push({ deckId: d.id, slide: s.index });
        }
    return [...m.values()];
  };
  for (const p of byName((s) => s.products)) put('product', p.oem, p.name, p.ev);
  for (const c of byName((s) => s.competitors)) put('competitor', c.oem, c.name, c.ev);
  for (const p of STARTER_PERSONAS) put('persona', undefined, p, []);
  for (const s of STARTER_SERVICES) put('service', undefined, s, []);
  return { kb: out, added };
}

// ---------------- Knowledge packs ----------------
// A knowledge pack is the hand-off format: the office exports one, or Claude
// writes one from exported deck text, and the app imports it as suggestions.

export const PACK_KIND = 'cto-workbench-knowledge-pack';
export const PACK_VERSION = 1;

export interface PackNode {
  /** Any id unique within the pack; edges refer to it. */
  ref: string;
  kind: NodeKind;
  oem?: string;
  text: string;
  notes?: string;
  /** Slides that support the node: deck id or deck name or file name, plus 1-based slide number. */
  evidence?: { deck: string; slide: number }[];
}

export interface KnowledgePack {
  kind: typeof PACK_KIND;
  version: number;
  source?: string;
  nodes: PackNode[];
  edges: { from: string; rel: Rel; to: string }[];
}

export function exportPack(kb: KnowledgeBase, decks: DeckRef[], opts: { includeSuggested?: boolean; oem?: string } = {}): KnowledgePack {
  const keep = kb.nodes.filter((n) => n.status !== 'retired' && (opts.includeSuggested || n.status === 'approved') && (!opts.oem || !n.oem || n.oem === opts.oem));
  const ids = new Set(keep.map((n) => n.id));
  return {
    kind: PACK_KIND,
    version: PACK_VERSION,
    source: 'CTO Workbench export',
    nodes: keep.map((n) => ({
      ref: n.id,
      kind: n.kind,
      oem: n.oem,
      text: n.text,
      notes: n.notes,
      evidence: n.evidence.map((e) => ({ deck: decks.find((d) => d.id === e.deckId)?.name ?? e.deckId, slide: e.slide })),
    })),
    edges: kb.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ from: e.from, rel: e.rel, to: e.to })),
  };
}

export interface ImportReport {
  kb: KnowledgeBase;
  added: number;
  merged: number;
  links: number;
  problems: string[];
}

/**
 * Imports a pack as suggestions. Nodes that match an existing node (same kind, OEM
 * and text) merge into it instead of duplicating. Evidence must point at slides in
 * the library; anything else is reported and dropped.
 */
export function importPack(kb: KnowledgeBase, pack: unknown, decks: DeckRef[], newId: (kind: NodeKind) => string, origin: string): ImportReport {
  const problems: string[] = [];
  const p = pack as Partial<KnowledgePack>;
  if (!p || p.kind !== PACK_KIND || !Array.isArray(p.nodes)) throw new KnowledgeError('Not a knowledge pack. Expected "kind": "cto-workbench-knowledge-pack".');
  if ((p.version ?? 1) > PACK_VERSION) problems.push(`Pack version ${p.version} is newer than this app reads (${PACK_VERSION}); importing what it can.`);
  const deckFor = (s: string) => {
    const k = norm(s.replace(/\.pptx$/i, ''));
    return decks.find((d) => d.id === s || norm(d.name) === k || norm((d.fileName ?? '').replace(/\.pptx$/i, '')) === k);
  };
  let out = kb;
  let added = 0;
  let merged = 0;
  let links = 0;
  const refToId = new Map<string, string>();
  p.nodes.forEach((pn, i) => {
    const where = `Node ${i + 1}${pn?.ref ? ` (${pn.ref})` : ''}`;
    if (!pn || !NODE_KINDS.includes(pn.kind as NodeKind)) return problems.push(`${where}: unknown kind "${pn?.kind}"`);
    const text = String(pn.text ?? '').trim();
    if (!text) return problems.push(`${where}: no text`);
    const evidence: Evidence[] = [];
    for (const e of pn.evidence ?? []) {
      const d = deckFor(String(e.deck ?? ''));
      if (!d) problems.push(`${where}: deck "${e.deck}" is not in the slide library`);
      else if (!d.slides.some((s) => s.index === Number(e.slide))) problems.push(`${where}: ${d.name} has no slide ${e.slide}`);
      else evidence.push({ deckId: d.id, slide: Number(e.slide) });
    }
    // Personas and redesign services are shared across OEMs.
    const crossOem = pn.kind === 'persona' || pn.kind === 'service';
    const candidate = { kind: pn.kind as NodeKind, oem: crossOem ? undefined : pn.oem || undefined, text };
    const existing = out.nodes.find((n) => nodeKey(n) === nodeKey(candidate));
    if (existing) {
      out = upsertNode(out, { ...existing, evidence: dedupeEvidence([...existing.evidence, ...evidence]), notes: existing.notes || pn.notes });
      merged++;
      if (pn.ref) refToId.set(String(pn.ref), existing.id);
    } else {
      const id = newId(candidate.kind);
      out = upsertNode(out, { id, ...candidate, notes: pn.notes, status: 'suggested', evidence: dedupeEvidence(evidence), origin });
      added++;
      if (pn.ref) refToId.set(String(pn.ref), id);
    }
  });
  (p.edges ?? []).forEach((e, i) => {
    const from = refToId.get(String(e.from));
    const to = refToId.get(String(e.to));
    if (!from || !to) return problems.push(`Link ${i + 1}: unknown node "${!from ? e.from : e.to}"`);
    try {
      const before = out.edges.length;
      out = link(out, from, e.rel, to);
      if (out.edges.length > before) links++;
    } catch (err) {
      problems.push(`Link ${i + 1}: ${(err as Error).message}`);
    }
  });
  return { kb: out, added, merged, links, problems };
}

// ---------------- Hand-off to Claude ----------------

/** Instructions that travel with exported deck text so Claude returns a valid pack. */
export function claudeInstructions(oem: string): string {
  const kinds = NODE_KINDS.map((k) => `- ${k}: ${KIND_LABELS[k]}`).join('\n');
  const allowed = ALLOWED.map(([f, r, t]) => `- ${f} ${r} ${t}`).join('\n');
  return `# Extract sales knowledge from ${oem} partner decks

You are helping redesign, an IT solution provider, build shared sales knowledge from
${oem} partner decks. The deck text follows below, one block per slide, each with
its deck name and slide number.

Return ONLY a JSON object in this exact shape (a knowledge pack):

{
  "kind": "${PACK_KIND}",
  "version": ${PACK_VERSION},
  "source": "Claude extraction",
  "nodes": [
    { "ref": "n1", "kind": "capability", "oem": "${oem}", "text": "...", "evidence": [{ "deck": "<deck name>", "slide": 3 }] }
  ],
  "edges": [ { "from": "n2", "rel": "has", "to": "n1" } ]
}

Node kinds:
${kinds}

Allowed links (from, relation, to). Use no others:
${allowed}

Rules:
- Every node except personas must cite at least one slide as evidence, using the deck
  name and slide number exactly as given. Do not invent facts that are not on a slide.
- Keep each "text" short, plain and specific: one claim per node.
- Reuse one node per product, competitor and persona; link to it instead of repeating it.
- Skip cover, agenda and legal notice slides.
- Slides marked INTERNAL ONLY may be used for knowledge, but say so in "notes".
- Do not use em dashes. Write "redesign" in lowercase.
- Name the Broadcom DR product "VMware Protection and Recovery".
`;
}

/** Slide text for the decks of one OEM, ready to paste after the instructions. */
export function deckTextForClaude(decks: DeckRef[]): string {
  return decks
    .map((d) =>
      [`## Deck: ${d.name} (${d.contentDate})`, ...d.slides.map((s) => `### ${d.name}, slide ${s.index}${s.internalOnly ? ' (INTERNAL ONLY)' : ''}: ${s.title}\n${(s.text ?? '').trim()}`)].join('\n\n'),
    )
    .join('\n\n');
}
