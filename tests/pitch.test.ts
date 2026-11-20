import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeSampleDeck, makeCompetitiveDeck, makeTechnicalDeck } from '../src/samples/pptx';
import { readDeck, buildPitch, checkPackage, PptxError, type PitchSource } from '../src/core/pitch/pptx';
import { suggestTypes, detectProducts, DEFAULT_CATALOG, DEFAULT_COMPETITORS, isInternalOnly, suggestCategory } from '../src/core/pitch/tags';
import { recommend, type PitchRequest } from '../src/core/pitch/recommend';
import { analyzeDeck, isStale, migratePlays, defaultPlays, type DeckMeta } from '../src/modules/plays/data';

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
const PAN = 'Palo Alto Networks';
const deck = makeSampleDeck({ partner: PAN, product: 'Cortex XDR', otherProduct: 'Prisma Access', extraLine: 'Pairs with VMware Live Recovery — sample' });
const comp = makeCompetitiveDeck({ partner: PAN, product: 'Cortex XDR', competitors: ['CrowdStrike', 'SentinelOne'] });
const tech = makeTechnicalDeck({ partner: PAN, product: 'Cortex XDR' });
const src = (bytes: Uint8Array, label: string): PitchSource => ({ bytes, partnerName: PAN, sourceLabel: label });
const brand = {
  partnerName: PAN,
  title: 'Cortex XDR',
  subtitle: '15-minute call',
  customer: 'Sample Customer 01',
  preparedBy: 'Sample Rep',
  date: '2026-11-20',
  servicesHeading: 'How redesign helps',
  servicesBullets: ['Assessment and design', 'Deployment', 'Managed services'],
  contact: 'rep@example.com',
  logoPng: PNG,
};

describe('reading and labeling decks', () => {
  const info = readDeck(deck);
  it('lists slides in order with titles', () => {
    expect(info.slides.map((s) => s.title)).toEqual(['Cortex XDR overview (sample deck)', 'Agenda', 'Why Cortex XDR', 'Cortex XDR architecture', 'Customer use cases', 'Prisma Access overview', 'Forward-looking statements']);
    expect(info.size).toEqual({ cx: 12192000, cy: 6858000 });
  });
  it('suggests slide types', () => {
    const t = info.slides.map((s) => suggestTypes(s.title, s.text, s.index));
    expect(t[0]).toEqual(['title']);
    expect(t[1]).toEqual(['agenda']);
    expect(t[2]).toContain('messaging');
    expect(t[3]).toContain('architecture');
    expect(t[4]).toContain('use case');
    expect(t[6]).toEqual(['legal']);
  });
  it('labels slides as general messaging, technical product info or competitive info', () => {
    const a = analyzeDeck(info, 'Cortex XDR overview', DEFAULT_CATALOG[PAN], DEFAULT_COMPETITORS[PAN]);
    expect(a.slides.map((s) => s.category)).toEqual(['structural', 'structural', 'messaging', 'technical', 'messaging', 'messaging', 'structural']);
    const c = analyzeDeck(readDeck(comp), 'Cortex XDR battlecard', DEFAULT_CATALOG[PAN], DEFAULT_COMPETITORS[PAN]);
    expect(c.category).toBe('competitive');
    expect(c.slides[1]).toMatchObject({ category: 'competitive', competitors: ['CrowdStrike'] });
    expect(c.slides[2].competitors).toEqual(['SentinelOne']);
    expect(c.slides[4].internalOnly).toBe(true);
    const t = analyzeDeck(readDeck(tech), 'Cortex XDR technical deep dive', DEFAULT_CATALOG[PAN], DEFAULT_COMPETITORS[PAN]);
    expect(t.category).toBe('technical');
    expect(t.slides[1].category).toBe('technical');
    expect(t.slides[2].category).toBe('technical');
  });
  it('spots internal-only wording', () => {
    expect(isInternalOnly('Landmines', 'Partner confidential. Internal use only.')).toBe(true);
    expect(isInternalOnly('Why Cortex XDR', 'Value for customers')).toBe(false);
    expect(suggestCategory(['other'], 'Notes', 'nothing', 'technical')).toBe('technical');
  });
  it('detects products', () => {
    const cat = DEFAULT_CATALOG[PAN];
    expect(detectProducts(info.slides[3].text + info.slides[3].title, cat)).toEqual(['Cortex XDR']);
    expect(detectProducts(info.slides[5].title, cat)).toEqual(['Prisma Access']);
  });
  it('rejects files that are not decks', () => {
    expect(() => readDeck(new Uint8Array([1, 2, 3]))).toThrow(PptxError);
  });
});

describe('building a co-branded pitch from one deck', () => {
  const out = buildPitch([src(deck, 'Sample deck (2026-11)')], [{ src: 0, index: 4 }, { src: 0, index: 3 }], [{ src: 0, index: 7 }], brand);
  const files = unzipSync(out.bytes);
  const info = readDeck(out.bytes);
  it('orders title, chosen slides, legal notices, closing', () => {
    expect(info.slides.map((s) => s.title)).toEqual(['Cortex XDR', 'Cortex XDR architecture', 'Why Cortex XDR', 'Forward-looking statements', 'How redesign helps']);
    expect(out.slideCount).toBe(5);
  });
  it('is a consistent package', () => {
    expect(checkPackage(out.bytes)).toEqual([]);
    expect(checkPackage(deck)).toEqual([]);
  });
  it('drops unselected slides', () => {
    expect(info.slides.some((s) => s.title.includes('Prisma'))).toBe(false);
    expect(Object.keys(files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))).toHaveLength(5);
  });
  it('keeps OEM content and adds a source line and logo to each OEM slide', () => {
    expect(info.slides[1].text).toContain('Cortex XDR analytics and response (placeholder)');
    for (const s of info.slides.slice(1, 4)) {
      expect(s.text).toContain('Source: Palo Alto Networks, Sample deck (2026-11). Presented by redesign.');
      expect(strFromU8(files[s.part])).toContain('name="redesign logo"');
    }
  });
  it('names the customer and credits the partner', () => {
    expect(info.slides[0].text).toContain('Prepared for Sample Customer 01');
    expect(info.slides[0].text).toContain('redesign with Palo Alto Networks');
    expect(info.slides[4].text).toContain('remains its property');
  });
  it('applies the writing rules to slide text', () => {
    expect(out.renamed).toBe(1);
    expect(info.slides[2].text).toContain('Pairs with VMware Protection and Recovery, sample');
  });
  it('places the stamp in the chosen corner', () => {
    const o4 = buildPitch([{ ...src(deck, 'S'), stampCorner: 'top-left' }], [{ src: 0, index: 3 }], [], brand);
    const xml = strFromU8(unzipSync(o4.bytes)[readDeck(o4.bytes).slides[1].part]);
    expect(xml).toMatch(/name="redesign co-brand pill"\/>[\s\S]*?<a:off x="109728" y="109728"\/>/);
  });
  it('works without a logo', () => {
    const o3 = buildPitch([src(deck, 'S')], [{ src: 0, index: 3 }], [], { ...brand, logoPng: undefined });
    expect(checkPackage(o3.bytes)).toEqual([]);
    expect(unzipSync(o3.bytes)['ppt/media/redesign-cobrand-logo.png']).toBeUndefined();
  });
});

describe('building a pitch from several decks', () => {
  const sources = [src(deck, 'Overview (2026-11)'), src(tech, 'Technical deep dive (2026-10)'), src(comp, 'Battlecard (2026-09)')];
  const out = buildPitch(sources, [{ src: 0, index: 3 }, { src: 1, index: 2 }, { src: 0, index: 4 }, { src: 2, index: 2 }], [{ src: 0, index: 7 }, { src: 2, index: 6 }], brand);
  const info = readDeck(out.bytes);
  it('mixes slides from three decks in the chosen order', () => {
    expect(info.slides.map((s) => s.title)).toEqual(['Cortex XDR', 'Why Cortex XDR', 'Deployment model and sizing', 'Cortex XDR architecture', 'Cortex XDR vs CrowdStrike', 'Forward-looking statements', 'Legal notice', 'How redesign helps']);
    expect(out.warnings).toEqual([]);
  });
  it('is a consistent package with each deck credited on its own slides', () => {
    expect(checkPackage(out.bytes)).toEqual([]);
    expect(info.slides[2].text).toContain('Source: Palo Alto Networks, Technical deep dive (2026-10).');
    expect(info.slides[4].text).toContain('Source: Palo Alto Networks, Battlecard (2026-09).');
  });
  it('registers the copied masters with unique ids', () => {
    const pres = strFromU8(unzipSync(out.bytes)['ppt/presentation.xml']);
    const files = unzipSync(out.bytes);
    const ids = [...pres.matchAll(/<p:sldMasterId id="(\d+)"/g)].map((m) => m[1]);
    for (const p of Object.keys(files)) if (/^ppt\/slideMasters\/[^/]+\.xml$/.test(p)) ids.push(...[...strFromU8(files[p]).matchAll(/<p:sldLayoutId id="(\d+)"/g)].map((m) => m[1]));
    expect(ids.length).toBe(9); // 3 masters + 6 layouts
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('writes files for manual inspection', () => {
    mkdirSync('verify-output', { recursive: true });
    writeFileSync('verify-output/sample-source-deck.pptx', deck);
    writeFileSync('verify-output/sample-pitch.pptx', buildPitch([src(deck, 'Sample deck (2026-11)')], [{ src: 0, index: 4 }, { src: 0, index: 3 }], [{ src: 0, index: 7 }], brand).bytes);
    writeFileSync('verify-output/sample-pitch-mixed.pptx', out.bytes);
  });
});

describe('recommendations', () => {
  const now = new Date('2026-11-20');
  const meta = (id: string, name: string, bytes: Uint8Array, date: string): DeckMeta => {
    const a = analyzeDeck(readDeck(bytes), name, DEFAULT_CATALOG[PAN], DEFAULT_COMPETITORS[PAN]);
    return { id, oem: PAN, name, fileName: `${name}.pptx`, contentDate: date, importedAt: '', size: 0, stampCorner: 'bottom-right', ...a };
  };
  const lib = [meta('d1', 'Cortex XDR overview', deck, '2026-11'), meta('d2', 'Cortex XDR technical deep dive', tech, '2026-10'), meta('d3', 'Cortex XDR battlecard', comp, '2026-09')];
  const base: PitchRequest = { oem: PAN, products: ['Cortex XDR'], minutes: 15, minutesPerSlide: 3, emphasis: { messaging: 3, technical: 1, competitive: 0 }, keywords: [], staleMonths: 6, now, partnerNames: ['CrowdStrike', PAN] };
  const titles = (r: ReturnType<typeof recommend>) => r.picks.map((p) => p.title);

  it('fits the slide budget to the meeting length and weights the labels', () => {
    const r = recommend(lib, base);
    expect(r.budget).toBe(5);
    // 3:1 would be 4 messaging and 1 technical, but only 2 messaging slides exist,
    // so the spare slots go to technical.
    expect(r.available.messaging).toBe(2);
    expect(r.quota).toEqual({ messaging: 2, technical: 3, competitive: 0 });
    expect(r.picks.every((p) => p.category !== 'competitive')).toBe(true);
    expect(titles(r)[0]).toBe('Why Cortex XDR');
    expect(titles(r)).toContain('Cortex XDR architecture');
  });
  it('never recommends slides about another product', () => {
    const r = recommend(lib, { ...base, emphasis: { messaging: 3, technical: 3, competitive: 3 }, minutes: 90 });
    expect([...r.picks, ...r.alternates].some((p) => p.title.includes('Prisma'))).toBe(false);
  });
  it('a competitive displacement against CrowdStrike leads with the CrowdStrike slide', () => {
    const r = recommend(lib, { ...base, minutes: 30, emphasis: { messaging: 1, technical: 2, competitive: 3 }, competitor: 'CrowdStrike' });
    const c = r.picks.filter((p) => p.category === 'competitive');
    expect(c[0].title).toBe('Cortex XDR vs CrowdStrike');
    expect(c[0].reasons).toContain('About CrowdStrike');
    expect(c[0].warnings).toContain('Names CrowdStrike, also a redesign partner');
    expect(r.picks.map((p) => p.category)).toEqual([...r.picks.map((p) => p.category)].sort((a, b) => ['messaging', 'technical', 'competitive'].indexOf(a) - ['messaging', 'technical', 'competitive'].indexOf(b)));
  });
  it('keeps internal-only slides out of the customer deck', () => {
    const r = recommend(lib, { ...base, minutes: 60, emphasis: { messaging: 0, technical: 0, competitive: 3 } });
    expect([...r.picks, ...r.alternates].some((p) => p.title === 'Competitive landmines')).toBe(false);
    expect(r.internalOnly.map((p) => p.title)).toEqual(['Competitive landmines']);
  });
  it('focus words lift matching slides', () => {
    const r = recommend(lib, { ...base, emphasis: { messaging: 0, technical: 3, competitive: 0 }, minutes: 3, keywords: ['ransomware'] });
    expect(titles(r)).toEqual(['Ransomware detection and response']);
    expect(r.picks[0].reasons).toContain('Title matches "ransomware"');
  });
  it('flags stale decks and prefers current ones', () => {
    const old = [meta('d0', 'Old overview', deck, '2025-01'), ...lib];
    const r = recommend(old, base);
    expect(r.picks.find((p) => p.title === 'Why Cortex XDR')!.deckId).toBe('d1');
    expect(isStale({ contentDate: '2026-01' }, 6, now)).toBe(true);
  });
});

describe('module data migration', () => {
  it('upgrades v1 plays and decks', () => {
    const v1 = { decks: [{ id: 'x', oem: PAN, name: 'Battlecard', contentDate: '2026-01', slides: [{ index: 2, title: 'Cortex XDR vs CrowdStrike', excerpt: 'compare', types: ['other'], products: [] }] }], plays: [{ id: 'p', name: 'Intro', types: ['messaging', 'architecture'], maxSlides: 4, servicesHeading: 'H', servicesBullets: ['a'] }] };
    const m = migratePlays(1, v1);
    expect(m.plays[0]).toMatchObject({ minutes: 12, emphasis: { messaging: 3, technical: 2, competitive: 0 } });
    expect(m.decks[0].category).toBe('competitive');
    expect(m.decks[0].slides[0].competitors).toEqual(['CrowdStrike']);
    expect(defaultPlays().map((p) => p.name)).toContain('Competitive displacement');
  });
});
