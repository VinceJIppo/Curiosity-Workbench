import { describe, expect, it } from 'vitest';
import { readDeck } from '../src/core/pitch/pptx';
import { DEFAULT_CATALOG, DEFAULT_COMPETITORS } from '../src/core/pitch/tags';
import { makeSampleDeck, makeCompetitiveDeck } from '../src/samples/pptx';
import { analyzeDeck, migratePlays, PLAYS_VERSION, type DeckMeta } from '../src/modules/plays/data';
import {
  emptyKnowledge, seedFromLibrary, link, mergeNodes, removeNode, exportPack, importPack, freshAsOf, customerSafe, isStaleNode,
  brokenEvidence, neighbors, allowedRels, claudeInstructions, deckTextForClaude, KnowledgeError, upsertNode, type KnowledgeBase, type NodeKind,
} from '../src/core/pitch/knowledge';

const PAN = 'Palo Alto Networks';
const meta = (id: string, name: string, bytes: Uint8Array, date: string): DeckMeta => ({
  id, oem: PAN, name, fileName: `${name}.pptx`, contentDate: date, importedAt: '', size: 0, stampCorner: 'bottom-right',
  ...analyzeDeck(readDeck(bytes), name, DEFAULT_CATALOG[PAN], DEFAULT_COMPETITORS[PAN]),
});
const decks = [
  meta('d1', 'Cortex XDR overview', makeSampleDeck({ partner: PAN, product: 'Cortex XDR', otherProduct: 'Prisma Access' }), '2026-11'),
  meta('d2', 'Cortex XDR battlecard', makeCompetitiveDeck({ partner: PAN, product: 'Cortex XDR', competitors: ['CrowdStrike', 'SentinelOne'] }), '2026-03'),
];
let n = 0;
const ids = (k: NodeKind) => `${k}-${++n}`;
const now = new Date('2026-11-20');

describe('seeding from the library', () => {
  const { kb, added } = seedFromLibrary(emptyKnowledge(), decks, ids);
  it('adds products and competitors with slide evidence, plus personas and services', () => {
    const xdr = kb.nodes.find((x) => x.kind === 'product' && x.text === 'Cortex XDR')!;
    expect(xdr.status).toBe('approved');
    expect(xdr.evidence.some((e) => e.deckId === 'd1' && e.slide === 4)).toBe(true);
    expect(kb.nodes.find((x) => x.kind === 'competitor' && x.text === 'CrowdStrike')!.evidence).toEqual([{ deckId: 'd2', slide: 2 }, { deckId: 'd2', slide: 5 }]);
    expect(kb.nodes.filter((x) => x.kind === 'persona').length).toBe(7);
    expect(kb.nodes.filter((x) => x.kind === 'service').length).toBe(3);
    expect(added).toBe(kb.nodes.length);
  });
  it('is idempotent', () => {
    const again = seedFromLibrary(kb, decks, ids);
    expect(again.added).toBe(0);
    expect(again.kb.nodes.length).toBe(kb.nodes.length);
  });
});

describe('editing the graph', () => {
  let kb: KnowledgeBase = seedFromLibrary(emptyKnowledge(), decks, ids).kb;
  const xdr = kb.nodes.find((x) => x.text === 'Cortex XDR')!.id;
  kb = upsertNode(kb, { id: 'cap1', kind: 'capability', oem: PAN, text: 'Stitches endpoint, network and cloud data', status: 'approved', evidence: [{ deckId: 'd1', slide: 4 }], origin: 'manual' });
  kb = upsertNode(kb, { id: 'cap2', kind: 'capability', oem: PAN, text: 'Stitches endpoint network and cloud data', status: 'suggested', evidence: [{ deckId: 'd1', slide: 3 }], origin: 'manual' });
  kb = upsertNode(kb, { id: 'land', kind: 'differentiator', oem: PAN, text: 'Trap to set', status: 'suggested', evidence: [{ deckId: 'd2', slide: 5 }], origin: 'manual' });
  it('only allows links that make sense', () => {
    expect(allowedRels('product', 'capability')).toEqual(['has']);
    kb = link(kb, xdr, 'has', 'cap1');
    expect(() => link(kb, 'cap1', 'has', xdr)).toThrow(KnowledgeError);
    expect(link(kb, xdr, 'has', 'cap1').edges.length).toBe(kb.edges.length); // no duplicates
  });
  it('merges duplicates, moving evidence and links', () => {
    kb = link(kb, xdr, 'has', 'cap2');
    const m = mergeNodes(kb, 'cap1', 'cap2');
    expect(m.nodes.some((x) => x.id === 'cap2')).toBe(false);
    expect(m.nodes.find((x) => x.id === 'cap1')!.evidence).toHaveLength(2);
    expect(m.edges.filter((e) => e.to === 'cap1')).toHaveLength(1);
    expect(neighbors(m, 'cap1')[0].node.text).toBe('Cortex XDR');
    expect(() => mergeNodes(kb, 'cap1', xdr)).toThrow(KnowledgeError);
  });
  it('derives freshness, staleness and customer safety from evidence', () => {
    const cap = kb.nodes.find((x) => x.id === 'cap1')!;
    expect(freshAsOf(cap, decks)).toBe('2026-11');
    const trap = kb.nodes.find((x) => x.id === 'land')!;
    expect(customerSafe(trap, decks)).toBe(false); // slide 5 of the battlecard is internal only
    expect(customerSafe(cap, decks)).toBe(true);
    expect(isStaleNode(trap, decks, 6, now)).toBe(true);
    expect(brokenEvidence({ ...cap, evidence: [{ deckId: 'gone', slide: 1 }] }, decks)).toHaveLength(1);
  });
  it('removing a node removes its links', () => {
    const r = removeNode(kb, 'cap1');
    expect(r.edges.some((e) => e.to === 'cap1' || e.from === 'cap1')).toBe(false);
  });
});

describe('knowledge packs', () => {
  const seeded = seedFromLibrary(emptyKnowledge(), decks, ids).kb;
  const pack = {
    kind: 'cto-workbench-knowledge-pack',
    version: 1,
    source: 'Claude extraction',
    nodes: [
      { ref: 'p', kind: 'product', oem: PAN, text: 'Cortex XDR', evidence: [{ deck: 'Cortex XDR overview', slide: 4 }] },
      { ref: 'c', kind: 'capability', oem: PAN, text: 'Correlates alerts into incidents', evidence: [{ deck: 'Cortex XDR overview.pptx', slide: 4 }] },
      { ref: 'pain', kind: 'pain', oem: PAN, text: 'Too many alerts for a small team', evidence: [{ deck: 'd1', slide: 3 }] },
      { ref: 'bad', kind: 'widget', text: 'x' },
      { ref: 'ghost', kind: 'proof', oem: PAN, text: 'Made up', evidence: [{ deck: 'Unknown deck', slide: 1 }, { deck: 'Cortex XDR overview', slide: 99 }] },
    ],
    edges: [
      { from: 'p', rel: 'has', to: 'c' },
      { from: 'c', rel: 'solves', to: 'pain' },
      { from: 'pain', rel: 'has', to: 'c' },
      { from: 'c', rel: 'solves', to: 'missing' },
    ],
  };
  const r = importPack(seeded, pack, decks, ids, 'Claude extraction');
  it('imports new nodes as suggestions and merges existing ones', () => {
    expect(r.added).toBe(3); // capability, pain, proof (proof keeps no evidence)
    expect(r.merged).toBe(1); // Cortex XDR already seeded
    expect(r.kb.nodes.find((x) => x.text === 'Correlates alerts into incidents')!.status).toBe('suggested');
    expect(r.kb.nodes.find((x) => x.text === 'Correlates alerts into incidents')!.evidence).toEqual([{ deckId: 'd1', slide: 4 }]);
    expect(r.links).toBe(2);
  });
  it('reports what it could not use', () => {
    expect(r.problems.join('\n')).toMatch(/unknown kind "widget"/);
    expect(r.problems.join('\n')).toMatch(/"Unknown deck" is not in the slide library/);
    expect(r.problems.join('\n')).toMatch(/has no slide 99/);
    expect(r.problems.join('\n')).toMatch(/cannot "has"/);
    expect(r.problems.join('\n')).toMatch(/unknown node "missing"/);
  });
  it('personas are shared across OEMs, so a pack persona merges with the starter one', () => {
    const r2 = importPack(seeded, { kind: 'cto-workbench-knowledge-pack', version: 1, nodes: [{ ref: 'x', kind: 'persona', oem: PAN, text: 'CISO' }], edges: [] }, decks, ids, 'p');
    expect(r2.merged).toBe(1);
    expect(r2.kb.nodes.filter((x) => x.kind === 'persona' && x.text === 'CISO')).toHaveLength(1);
  });
  it('rejects files that are not packs', () => {
    expect(() => importPack(seeded, { nodes: [] }, decks, ids, 'x')).toThrow(KnowledgeError);
  });
  it('round-trips through export and import', () => {
    const approved = { ...r.kb, nodes: r.kb.nodes.map((x) => ({ ...x, status: 'approved' as const })) };
    const out = exportPack(approved, decks);
    const back = importPack(emptyKnowledge(), JSON.parse(JSON.stringify(out)), decks, ids, 'roundtrip');
    expect(back.problems).toEqual([]);
    expect(back.kb.nodes.length).toBe(approved.nodes.length);
    expect(back.kb.edges.length).toBe(approved.edges.length);
  });
});

describe('hand-off to Claude', () => {
  it('instructions describe the pack and the rules', () => {
    const t = claudeInstructions(PAN);
    expect(t).toContain('"kind": "cto-workbench-knowledge-pack"');
    expect(t).toContain('- product has capability');
    expect(t).toContain('VMware Protection and Recovery');
    expect(t).not.toContain('—');
  });
  it('deck text names decks and slides and marks internal slides', () => {
    const t = deckTextForClaude(decks);
    expect(t).toContain('### Cortex XDR overview, slide 4: Cortex XDR architecture');
    expect(t).toContain('slide 5 (INTERNAL ONLY): Competitive landmines');
  });
});

describe('module data', () => {
  it('v3 adds an empty knowledge base to older records', () => {
    expect(PLAYS_VERSION).toBe(3);
    expect(migratePlays(2, { decks: [], plays: [] }).knowledge).toEqual({ nodes: [], edges: [] });
    expect(migratePlays(1, { decks: [] }).knowledge).toEqual({ nodes: [], edges: [] });
  });
});
