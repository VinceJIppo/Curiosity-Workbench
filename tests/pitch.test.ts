import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeSampleDeck } from '../src/samples/pptx';
import { readDeck, buildPitch, checkPackage, PptxError } from '../src/core/pitch/pptx';
import { suggestTypes, detectProducts, DEFAULT_CATALOG } from '../src/core/pitch/tags';

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
const deck = makeSampleDeck({ partner: 'Palo Alto Networks', product: 'Cortex XDR', otherProduct: 'Prisma Access', extraLine: 'Pairs with VMware Live Recovery — sample' });
const brand = {
  partnerName: 'Palo Alto Networks',
  sourceLabel: 'Sample deck (2026-11)',
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

describe('reading a deck', () => {
  const info = readDeck(deck);
  it('lists slides in order with titles', () => {
    expect(info.slides.map((s) => s.title)).toEqual(['Cortex XDR overview (sample deck)', 'Agenda', 'Why Cortex XDR', 'Cortex XDR architecture', 'Customer use cases', 'Prisma Access overview', 'Forward-looking statements']);
    expect(info.size).toEqual({ cx: 12192000, cy: 6858000 });
  });
  it('suggests slide types', () => {
    const t = info.slides.map((s) => suggestTypes(s.title, s.text, s.index));
    expect(t[1]).toContain('agenda');
    expect(t[2]).toContain('messaging');
    expect(t[3]).toContain('architecture');
    expect(t[4]).toContain('use case');
    expect(t[6]).toEqual(['legal']);
  });
  it('detects products', () => {
    const cat = DEFAULT_CATALOG['Palo Alto Networks'];
    expect(detectProducts(info.slides[3].text + info.slides[3].title, cat)).toEqual(['Cortex XDR']);
    expect(detectProducts(info.slides[5].title, cat)).toEqual(['Prisma Access']);
  });
  it('rejects files that are not decks', () => {
    expect(() => readDeck(new Uint8Array([1, 2, 3]))).toThrow(PptxError);
  });
});

describe('building a co-branded pitch', () => {
  const out = buildPitch(deck, [4, 3], [7], brand);
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
    const arch = info.slides[1];
    expect(arch.text).toContain('Cortex XDR analytics and response (placeholder)');
    for (const s of info.slides.slice(1, 4)) {
      expect(s.text).toContain('Source: Palo Alto Networks, Sample deck (2026-11). Presented by redesign.');
      expect(strFromU8(files[s.part])).toContain('name="redesign logo"');
    }
    expect(files['ppt/media/redesign-cobrand-logo.png']).toBeDefined();
  });
  it('names the customer and credits the partner', () => {
    expect(info.slides[0].text).toContain('Prepared for Sample Customer 01');
    expect(info.slides[0].text).toContain('redesign with Palo Alto Networks');
    expect(info.slides[4].text).toContain('remains its property');
  });
  it('applies the writing rules to slide text', () => {
    expect(out.renamed).toBe(1);
    expect(info.slides[2].text).toContain('Pairs with VMware Protection and Recovery, sample');
    expect(info.slides[2].text).not.toContain('—');
  });
  it('always keeps legal slides even when not chosen', () => {
    const o2 = readDeck(buildPitch(deck, [3], [7], brand).bytes);
    expect(o2.slides.at(-2)!.title).toBe('Forward-looking statements');
  });
  it('places the stamp in the chosen corner', () => {
    const o4 = buildPitch(deck, [3], [], { ...brand, stampCorner: 'top-left' });
    const xml = strFromU8(unzipSync(o4.bytes)[readDeck(o4.bytes).slides[1].part]);
    expect(xml).toMatch(/name="redesign co-brand pill"\/>[\s\S]*?<a:off x="109728" y="109728"\/>/);
  });
  it('works without a logo', () => {
    const o3 = buildPitch(deck, [3], [], { ...brand, logoPng: undefined });
    expect(checkPackage(o3.bytes)).toEqual([]);
    expect(unzipSync(o3.bytes)['ppt/media/redesign-cobrand-logo.png']).toBeUndefined();
  });
  it('writes a file for manual inspection', () => {
    mkdirSync('verify-output', { recursive: true });
    writeFileSync('verify-output/sample-source-deck.pptx', deck);
    writeFileSync('verify-output/sample-pitch.pptx', out.bytes);
  });
});
