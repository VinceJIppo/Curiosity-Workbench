// Read an OEM PPTX and build a co-branded pitch deck from it.
// Co-branded means: redesign title and closing slides wrap the OEM's slides, every
// OEM slide keeps its content, branding and notices, and gains a small redesign
// logo and a source line naming the OEM. OEM legal notice slides are always kept.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { sanitizeText } from '../format';
import {
  CT_SLIDE,
  EMU,
  REL_IMAGE,
  REL_LAYOUT,
  REL_NOTES,
  REL_SLIDE,
  XML_HEAD,
  attr,
  esc,
  parseRels,
  picture,
  pngSize,
  rect,
  relsPathFor,
  resolvePart,
  slideXml,
  textBox,
  unesc,
  writeRels,
  type Box,
} from './ooxml';

export interface SlideInfo {
  /** 1-based position in the source deck. */
  index: number;
  part: string;
  title: string;
  text: string;
}

export interface DeckInfo {
  slides: SlideInfo[];
  size: { cx: number; cy: number };
}

export class PptxError extends Error {}

type Files = Record<string, Uint8Array>;

function text(files: Files, part: string): string | undefined {
  const f = files[part];
  return f ? strFromU8(f) : undefined;
}

function paragraphs(xml: string): string[] {
  return xml
    .split(/<\/a:p>/)
    .map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => unesc(m[1])).join(''))
    .map((s) => s.trim())
    .filter(Boolean);
}

function slideList(files: Files): { id: string; rid: string; part: string }[] {
  const pres = text(files, 'ppt/presentation.xml');
  if (!pres) throw new PptxError('Not a PowerPoint file (no ppt/presentation.xml)');
  const rels = parseRels(text(files, 'ppt/_rels/presentation.xml.rels'));
  const list = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(pres)?.[1] ?? '';
  return [...list.matchAll(/<p:sldId\b[^>]*\/>/g)].map((m) => {
    const rid = attr(m[0], 'r:id') ?? '';
    const rel = rels.find((r) => r.id === rid);
    return { id: attr(m[0], 'id') ?? '', rid, part: rel ? resolvePart('ppt/presentation.xml', rel.target) : '' };
  });
}

function slideSize(files: Files) {
  const pres = text(files, 'ppt/presentation.xml') ?? '';
  const m = /<p:sldSz\b[^>]*\/>/.exec(pres);
  return { cx: Number(m && attr(m[0], 'cx')) || 12192000, cy: Number(m && attr(m[0], 'cy')) || 6858000 };
}

export function readDeck(bytes: Uint8Array): DeckInfo {
  let files: Files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new PptxError('Could not open the file. Save it as .pptx and try again.');
  }
  const slides = slideList(files).map((s, i) => {
    const xml = text(files, s.part) ?? '';
    const shapes = xml.split(/<\/p:sp>/);
    const titleShape = shapes.find((sh) => /<p:ph\b[^>]*type="(title|ctrTitle)"/.test(sh));
    const all = paragraphs(xml);
    const title = (titleShape ? paragraphs(titleShape).join(' ') : '') || all[0] || `Slide ${i + 1}`;
    return { index: i + 1, part: s.part, title, text: all.join('\n') };
  });
  return { slides, size: slideSize(files) };
}

export interface CoBrand {
  partnerName: string;
  /** Shown in the source line on every OEM slide, for example the deck name and date. */
  sourceLabel: string;
  title: string;
  subtitle?: string;
  customer?: string;
  preparedBy?: string;
  date: string;
  servicesHeading: string;
  servicesBullets: string[];
  contact?: string;
  /** redesign logo as PNG. Optional: without it the slides carry no logo. */
  logoPng?: Uint8Array;
  /** Corner for the source line and logo on OEM slides. Pick one the deck leaves clear. */
  stampCorner?: StampCorner;
}

export type StampCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export const STAMP_CORNERS: StampCorner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

export interface PitchResult {
  bytes: Uint8Array;
  slideCount: number;
  /** Text runs changed by the writing rules (DR product name, em dashes). */
  renamed: number;
  warnings: string[];
}

const INK = '222222';
const MUTED = '5F5F5F';
const LIME = 'C3FDAF';
const HEAD_FONT = 'Martina Plantijn';
const UI_FONT = 'AF Atelier Sans';

function maxShapeId(xml: string): number {
  let max = 1;
  for (const m of xml.matchAll(/<p:cNvPr\b[^>]*\sid="(\d+)"/g)) max = Math.max(max, Number(m[1]));
  return max;
}

function logoBox(png: Uint8Array | undefined, x: number, y: number, h: number): Box | null {
  if (!png) return null;
  const sz = pngSize(png);
  if (!sz || !sz.h) return null;
  return { x, y, w: (h * sz.w) / sz.h, h };
}

/**
 * Build a co-branded pitch from one source deck.
 * `order` lists 1-based source slide indexes in the order they should appear.
 * Legal notice slides in `keepAtEnd` are appended after them (always kept).
 */
export function buildPitch(src: Uint8Array, order: number[], keepAtEnd: number[], brand: CoBrand): PitchResult {
  const files = unzipSync(src);
  const warnings: string[] = [];
  const all = slideList(files);
  const { cx, cy } = slideSize(files);
  const wanted = [...order, ...keepAtEnd.filter((i) => !order.includes(i))];
  const keep = wanted.map((i) => all[i - 1]).filter((s): s is NonNullable<typeof s> => !!s && !!s.part && !!files[s.part]);
  if (!keep.length) throw new PptxError('Choose at least one slide');
  const keepParts = new Set(keep.map((s) => s.part));
  let ct = text(files, '[Content_Types].xml') ?? '';
  let pres = text(files, 'ppt/presentation.xml')!;
  const presRelsPath = 'ppt/_rels/presentation.xml.rels';
  let presRels = parseRels(text(files, presRelsPath));

  const removeOverride = (part: string) => {
    ct = ct.replace(new RegExp(`<Override PartName="/${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), '');
  };

  // 1. Drop slides that are not kept, with their notes.
  for (const s of all) {
    if (keepParts.has(s.part) || !s.part) continue;
    const relsPath = relsPathFor(s.part);
    for (const r of parseRels(text(files, relsPath))) {
      if (r.type === REL_NOTES) {
        const np = resolvePart(s.part, r.target);
        delete files[np];
        delete files[relsPathFor(np)];
        removeOverride(np);
      }
    }
    delete files[s.part];
    delete files[relsPath];
    removeOverride(s.part);
    presRels = presRels.filter((r) => r.id !== s.rid);
  }
  // Custom shows and sections point at slide ids; drop them rather than leave dangling references.
  pres = pres.replace(/<p:custShowLst>[\s\S]*?<\/p:custShowLst>/, '');
  pres = pres.replace(/<p:ext uri="\{521415D9-36F7-43E2-AB2F-B90AF26B5E84\}">[\s\S]*?<\/p:ext>/, '');

  // 2. Media: the redesign logo.
  const logoPart = 'ppt/media/redesign-cobrand-logo.png';
  if (brand.logoPng) {
    if (!pngSize(brand.logoPng)) warnings.push('Logo is not a PNG; slides were built without it');
    else {
      files[logoPart] = brand.logoPng;
      if (!/<Default Extension="png"/i.test(ct)) ct = ct.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');
    }
  }
  const logo = brand.logoPng && pngSize(brand.logoPng) ? brand.logoPng : undefined;

  // 3. Stamp each kept OEM slide with a small white pill holding the source line and logo,
  //    so it reads on any background. Apply writing rules to text runs.
  let renamed = 0;
  const corner = brand.stampCorner ?? 'bottom-right';
  const pillH = 0.3 * EMU;
  const pad = 0.1 * EMU;
  const edge = 0.12 * EMU;
  const label = `Source: ${brand.partnerName}, ${brand.sourceLabel}. Presented by redesign.`;
  const textW = Math.min(cx * 0.6, label.length * 0.056 * EMU);
  const lb0 = logoBox(logo, 0, 0, pillH - 2 * 0.06 * EMU);
  const pillW = pad + textW + (lb0 ? pad + lb0.w : 0) + pad;
  const px = corner.endsWith('right') ? cx - edge - pillW : edge;
  const py = corner.startsWith('bottom') ? cy - edge - pillH : edge;
  for (const s of keep) {
    let xml = text(files, s.part)!;
    xml = xml.replace(/<a:t>([^<]*)<\/a:t>/g, (whole, t: string) => {
      const before = unesc(t);
      const after = sanitizeText(before);
      if (after === before) return whole;
      renamed++;
      return `<a:t>${esc(after)}</a:t>`;
    });
    let id = maxShapeId(xml);
    const relsPath = relsPathFor(s.part);
    const rels = parseRels(text(files, relsPath));
    let shapes =
      `<p:sp><p:nvSpPr><p:cNvPr id="${++id}" name="redesign co-brand pill"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(px)}" y="${Math.round(py)}"/><a:ext cx="${Math.round(pillW)}" cy="${Math.round(pillH)}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="94000"/></a:srgbClr></a:solidFill><a:ln w="3175"><a:solidFill><a:srgbClr val="D0D0D0"/></a:solidFill></a:ln></p:spPr></p:sp>` +
      textBox(++id, 'redesign co-brand source', { x: px + pad, y: py, w: textW, h: pillH }, [label], { size: 8, color: INK, font: UI_FONT }, { anchor: 'ctr' });
    if (lb0) {
      let rid = 'rIdCoBrandLogo';
      while (rels.some((r) => r.id === rid)) rid += 'x';
      rels.push({ id: rid, type: REL_IMAGE, target: '../media/redesign-cobrand-logo.png' });
      shapes += picture(++id, 'redesign logo', { ...lb0, x: px + pad + textW + pad, y: py + (pillH - lb0.h) / 2 }, rid, 'redesign logo');
      files[relsPath] = strToU8(writeRels(rels));
    }
    const at = xml.lastIndexOf('</p:spTree>');
    if (at < 0) {
      warnings.push(`${s.part} has no shape tree; left unstamped`);
      continue;
    }
    files[s.part] = strToU8(xml.slice(0, at) + shapes + xml.slice(at));
  }

  // 4. Layout for the new slides: the blank layout of the first kept slide's master, else its own layout.
  const firstLayoutRel = parseRels(text(files, relsPathFor(keep[0].part))).find((r) => r.type === REL_LAYOUT);
  let layoutPart = firstLayoutRel ? resolvePart(keep[0].part, firstLayoutRel.target) : '';
  const blank = Object.keys(files).find((p) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p) && /<p:sldLayout\b[^>]*type="blank"/.test(text(files, p) ?? ''));
  if (blank) layoutPart = blank;
  if (!layoutPart) throw new PptxError('The deck has no slide layout to build on');

  // 5. New redesign slides.
  let n = Math.max(0, ...Object.keys(files).map((p) => Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(p)?.[1] ?? 0)));
  const newSlide = (shapes: string, withLogo: boolean): { part: string; rid: string } => {
    const part = `ppt/slides/slide${++n}.xml`;
    const rels = [{ id: 'rId1', type: REL_LAYOUT, target: `../slideLayouts/${layoutPart.split('/').pop()}` }];
    if (withLogo && logo) rels.push({ id: 'rId2', type: REL_IMAGE, target: '../media/redesign-cobrand-logo.png' });
    files[part] = strToU8(slideXml(shapes, { whiteBg: true, hideMaster: true }));
    files[relsPathFor(part)] = strToU8(writeRels(rels));
    ct = ct.replace('</Types>', `<Override PartName="/${part}" ContentType="${CT_SLIDE}"/></Types>`);
    let rid = `rIdPitch${n}`;
    while (presRels.some((r) => r.id === rid)) rid += 'x';
    presRels.push({ id: rid, type: REL_SLIDE, target: `slides/slide${n}.xml` });
    return { part, rid };
  };

  const S = (v: number) => (v * cx) / 13.333; // scale inches on a 13.333 in wide slide
  const V = (v: number) => (v * cy) / 7.5;
  const clean = (s: string) => sanitizeText(s.trim());
  let id = 1;
  const titleShapes = [
    rect(++id, 'accent', { x: 0, y: 0, w: S(0.28), h: cy }, LIME),
    ...(logo ? [picture(++id, 'redesign logo', logoBox(logo, S(0.9), V(0.7), V(0.45))!, 'rId2', 'redesign logo')] : []),
    textBox(++id, 'Title', { x: S(0.9), y: V(2.2), w: S(11.4), h: V(1.6) }, [clean(brand.title)], { size: 44, color: INK, font: HEAD_FONT }, { anchor: 'b' }),
    textBox(++id, 'Subtitle', { x: S(0.9), y: V(3.95), w: S(11.4), h: V(0.6) }, [clean(brand.subtitle ?? '')].filter(Boolean), { size: 20, color: INK, font: UI_FONT }),
    textBox(
      ++id,
      'Prepared for',
      { x: S(0.9), y: V(5.3), w: S(11.4), h: V(1.2) },
      [brand.customer ? `Prepared for ${clean(brand.customer)}` : '', [brand.preparedBy ? clean(brand.preparedBy) : '', clean(brand.date)].filter(Boolean).join(', '), `redesign with ${clean(brand.partnerName)}`].filter(Boolean),
      { size: 14, color: MUTED, font: UI_FONT },
    ),
  ].join('');
  id = 1;
  const closeShapes = [
    rect(++id, 'accent', { x: 0, y: 0, w: S(0.28), h: cy }, LIME),
    ...(logo ? [picture(++id, 'redesign logo', logoBox(logo, S(0.9), V(0.7), V(0.45))!, 'rId2', 'redesign logo')] : []),
    textBox(++id, 'Heading', { x: S(0.9), y: V(1.5), w: S(11.4), h: V(1.0) }, [clean(brand.servicesHeading)], { size: 36, color: INK, font: HEAD_FONT }, { anchor: 'b' }),
    textBox(++id, 'Services', { x: S(0.9), y: V(2.8), w: S(11.4), h: V(3.0) }, brand.servicesBullets.map(clean).filter(Boolean), { size: 18, color: INK, font: UI_FONT }, { bullets: true }),
    textBox(++id, 'Contact', { x: S(0.9), y: V(5.9), w: S(11.4), h: V(0.4) }, [clean(brand.contact ?? '')].filter(Boolean), { size: 14, color: INK, font: UI_FONT }),
    textBox(
      ++id,
      'Attribution',
      { x: S(0.9), y: V(6.5), w: S(11.4), h: V(0.6) },
      [`${clean(brand.partnerName)} product content in this deck is provided by ${clean(brand.partnerName)} and remains its property, including its trademarks and notices.`],
      { size: 9, color: MUTED, font: UI_FONT },
    ),
  ].join('');
  const first = newSlide(titleShapes, true);
  const last = newSlide(closeShapes, true);

  // 6. Slide order: title, kept OEM slides in the chosen order, closing.
  const byPart = new Map(all.map((s) => [s.part, s]));
  let nextId = Math.max(255, ...all.map((s) => Number(s.id) || 0));
  const entry = (rid: string) => `<p:sldId id="${++nextId}" r:id="${rid}"/>`;
  const ids = [entry(first.rid), ...keep.map((s) => `<p:sldId id="${byPart.get(s.part)!.id}" r:id="${byPart.get(s.part)!.rid}"/>`), entry(last.rid)];
  pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${ids.join('')}</p:sldIdLst>`);
  files['ppt/presentation.xml'] = strToU8(pres);
  files[presRelsPath] = strToU8(writeRels(presRels));
  files['[Content_Types].xml'] = strToU8(ct);
  const app = text(files, 'docProps/app.xml');
  if (app) files['docProps/app.xml'] = strToU8(app.replace(/<Slides>\d+<\/Slides>/, `<Slides>${ids.length}</Slides>`));

  return { bytes: zipSync(files, { level: 6 }), slideCount: ids.length, renamed, warnings };
}

/** Consistency check used by tests: every override and relationship target exists. */
export function checkPackage(bytes: Uint8Array): string[] {
  const files = unzipSync(bytes);
  const problems: string[] = [];
  const ct = text(files, '[Content_Types].xml') ?? '';
  for (const m of ct.matchAll(/<Override PartName="\/([^"]+)"/g)) if (!files[m[1]]) problems.push(`Content type for missing part ${m[1]}`);
  for (const p of Object.keys(files)) {
    if (!p.endsWith('.rels')) continue;
    const owner = p.replace(/_rels\/([^/]+)\.rels$/, '$1');
    for (const r of parseRels(text(files, p))) {
      if (r.mode === 'External') continue;
      const target = owner === '' || p === '_rels/.rels' ? r.target.replace(/^\//, '') : resolvePart(owner, r.target);
      if (!files[target]) problems.push(`${p}: ${r.id} points at missing ${target}`);
    }
  }
  for (const p of Object.keys(files)) if (/^ppt\/slides\/slide\d+\.xml$/.test(p) && !ct.includes(`PartName="/${p}"`)) problems.push(`No content type for ${p}`);
  return problems;
}

export { XML_HEAD };
