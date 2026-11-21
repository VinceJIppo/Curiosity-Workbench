// Read OEM PPTX decks and build a co-branded pitch deck from slides in one or more of them.
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
  type Rel,
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

export interface PitchSource {
  bytes: Uint8Array;
  partnerName: string;
  /** Shown in the source line on each of this deck's slides, for example the deck name and date. */
  sourceLabel: string;
  /** Corner for the source line and logo. Pick one the deck leaves clear. */
  stampCorner?: StampCorner;
}

/** A slide in a source deck: `src` indexes the sources array, `index` is 1-based. */
export interface SlideRef {
  src: number;
  index: number;
}

export interface CoBrand {
  partnerName: string;
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
const REL_MASTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster';

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

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Relative relationship target from one part to another. */
export function relTarget(from: string, to: string): string {
  const a = from.split('/').slice(0, -1);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/');
}


/** Relationship types for review comments. Comments are internal and never go to customers. */
const isCommentRel = (type: string) => /\/(comments|commentAuthors|authors)$/i.test(type) || /relationships\/comments$/i.test(type);

/** Removes review comments from a slide: the relationships and the slide's pointers to them. */
function stripComments(xml: string, rels: Rel[]): { xml: string; rels: Rel[] } {
  const drop = rels.filter((r) => isCommentRel(r.type)).map((r) => r.id);
  if (!drop.length) return { xml, rels };
  let out = xml;
  for (const id of drop) {
    // Modern comments are linked from an extension block inside the slide.
    out = out.replace(new RegExp(`<p:ext\\b[^>]*>(?:(?!</p:ext>)[\\s\\S])*?r:id="${escRe(id)}"[\\s\\S]*?</p:ext>`, 'g'), '');
  }
  out = out.replace(/<p:extLst>\s*<\/p:extLst>/g, '');
  return { xml: out, rels: rels.filter((r) => !drop.includes(r.id)) };
}

export interface Scale {
  f: number;
  dx: number;
  dy: number;
}

/** Scale factor and centering offset to fit a slide of one size onto another. */
export function fitScale(src: { cx: number; cy: number }, dst: { cx: number; cy: number }): Scale | null {
  if (src.cx === dst.cx && src.cy === dst.cy) return null;
  const f = Math.min(dst.cx / src.cx, dst.cy / src.cy);
  return { f, dx: (dst.cx - src.cx * f) / 2, dy: (dst.cy - src.cy * f) / 2 };
}

/**
 * Rescales every position, size, font size and spacing in a slide, layout or master,
 * so slides from a deck with a different page size keep their layout.
 */
export function scaleXml(xml: string, sc: Scale): string {
  const r = (v: string) => String(Math.round(Number(v) * sc.f));
  return xml
    .replace(/<a:(off|chOff)\b([^>]*?)\sx="(-?\d+)"([^>]*?)\sy="(-?\d+)"/g, (_, tag, a, x, b, y) => `<a:${tag}${a} x="${Math.round(Number(x) * sc.f + sc.dx)}"${b} y="${Math.round(Number(y) * sc.f + sc.dy)}"`)
    .replace(/<a:(ext|chExt)\b([^>]*?)\scx="(\d+)"([^>]*?)\scy="(\d+)"/g, (_, tag, a, cx, b, cy) => `<a:${tag}${a} cx="${r(cx)}"${b} cy="${r(cy)}"`)
    .replace(/(<a:(?:rPr|defRPr|endParaRPr)\b[^>]*?\ssz=")(\d+)"/g, (_, a, v) => `${a}${Math.max(100, Math.round(Number(v) * sc.f))}"`)
    .replace(/(<a:spcPts\b[^>]*?\sval=")(\d+)"/g, (_, a, v) => `${a}${r(v)}"`)
    .replace(/(<a:ln\b[^>]*?\sw=")(\d+)"/g, (_, a, v) => `${a}${r(v)}"`)
    .replace(/(\s(?:marL|marR|indent|lIns|tIns|rIns|bIns)=")(-?\d+)"/g, (_, a, v) => `${a}${r(v)}"`);
}

/**
 * Copies a slide from another deck with everything it depends on (layout, master,
 * theme, media, charts) under new part names, so decks can be mixed in one pitch.
 */
class Importer {
  readonly map = new Map<string, string>();
  readonly masters: string[] = [];
  private readonly srcCt: string;
  constructor(
    private readonly dst: Files,
    readonly src: Files,
    private readonly prefix: string,
    private readonly box: { ct: string },
    private readonly scale: Scale | null = null,
  ) {
    this.srcCt = text(src, '[Content_Types].xml') ?? '';
  }
  copy(part: string): string {
    const known = this.map.get(part);
    if (known) return known;
    const i = part.lastIndexOf('/');
    let np = `${part.slice(0, i)}/${this.prefix}${part.slice(i + 1)}`;
    while (this.dst[np]) np = np.replace(/(\.[^.]+)$/, 'x$1');
    this.map.set(part, np);
    this.dst[np] = this.src[part];
    const visual = /^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(part);
    const ov = new RegExp(`<Override PartName="/${escRe(part)}" ContentType="([^"]+)"`).exec(this.srcCt)?.[1];
    if (ov) this.box.ct = this.box.ct.replace('</Types>', `<Override PartName="/${np}" ContentType="${ov}"/></Types>`);
    else {
      const ext = np.split('.').pop()!.toLowerCase();
      const def = new RegExp(`<Default Extension="${escRe(ext)}" ContentType="([^"]+)"`, 'i').exec(this.srcCt)?.[1];
      if (def && !new RegExp(`<Default Extension="${escRe(ext)}"`, 'i').test(this.box.ct)) this.box.ct = this.box.ct.replace(/(<Types\b[^>]*>)/, `$1<Default Extension="${ext}" ContentType="${def}"/>`);
    }
    if (/^ppt\/slideMasters\/[^/]+\.xml$/.test(part)) this.masters.push(np);
    let rels = parseRels(text(this.src, relsPathFor(part)));
    if (visual) {
      let xml = text(this.src, part) ?? '';
      const st = stripComments(xml, rels);
      xml = st.xml;
      rels = st.rels;
      if (this.scale) xml = scaleXml(xml, this.scale);
      this.dst[np] = strToU8(xml);
    }
    if (rels.length) {
      const out: Rel[] = [];
      for (const r of rels) {
        if (r.mode === 'External') out.push(r);
        else if (r.type === REL_NOTES) continue;
        else if (r.type === REL_SLIDE) out.push({ ...r, target: np.split('/').pop()! }); // links to other slides point back to this one
        else {
          const tgt = resolvePart(part, r.target);
          if (this.src[tgt]) out.push({ ...r, target: relTarget(np, this.copy(tgt)) });
        }
      }
      this.dst[relsPathFor(np)] = strToU8(writeRels(out));
    }
    return np;
  }
}

/**
 * Build a co-branded pitch. `picks` are the slides in pitch order, from any of the
 * sources. `legal` slides (OEM notices) are always appended after them.
 * The first pick's deck is the base package; slides from other decks are copied in.
 */
export function buildPitch(sources: PitchSource[], picks: SlideRef[], legal: SlideRef[], brand: CoBrand): PitchResult {
  const key = (r: SlideRef) => `${r.src}:${r.index}`;
  const seen = new Set<string>();
  const order: SlideRef[] = [];
  for (const r of [...picks, ...legal]) {
    if (!sources[r.src] || seen.has(key(r))) continue;
    seen.add(key(r));
    order.push(r);
  }
  if (!order.length) throw new PptxError('Choose at least one slide');
  const base = order[0].src;
  const files = unzipSync(sources[base].bytes);
  const warnings: string[] = [];
  const all = slideList(files);
  const { cx, cy } = slideSize(files);
  const box = { ct: text(files, '[Content_Types].xml') ?? '' };
  let pres = text(files, 'ppt/presentation.xml')!;
  const presRelsPath = 'ppt/_rels/presentation.xml.rels';
  let presRels = parseRels(text(files, presRelsPath));
  const removeOverride = (part: string) => {
    box.ct = box.ct.replace(new RegExp(`<Override PartName="/${escRe(part)}"[^>]*/>`), '');
  };
  const uniqueRid = (stem: string) => {
    let rid = stem;
    while (presRels.some((r) => r.id === rid)) rid += 'x';
    return rid;
  };

  // 1. Drop base slides that are not kept, with their notes.
  const baseKeep = new Set(order.filter((r) => r.src === base).map((r) => all[r.index - 1]?.part).filter(Boolean));
  for (const s of all) {
    if (baseKeep.has(s.part) || !s.part) continue;
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

  // 2. Collect kept slides in order, copying in slides from other decks.
  const kept: { part: string; id?: string; rid: string; src: number }[] = [];
  const importers = new Map<number, Importer>();
  let k = 0;
  for (const r of order) {
    if (r.src === base) {
      const s = all[r.index - 1];
      if (s?.part && files[s.part]) kept.push({ part: s.part, id: s.id, rid: s.rid, src: r.src });
      else warnings.push(`Slide ${r.index} of ${sources[r.src].sourceLabel} was not found`);
      continue;
    }
    let imp = importers.get(r.src);
    if (!imp) {
      const srcFiles = unzipSync(sources[r.src].bytes);
      const sz = slideSize(srcFiles);
      imp = new Importer(files, srcFiles, `d${r.src}_`, box, fitScale(sz, { cx, cy }));
      importers.set(r.src, imp);
      if (sz.cx * cy !== sz.cy * cx) warnings.push(`${sources[r.src].sourceLabel} uses a different slide shape; its slides were fitted with margins`);
    }
    const sl = slideList(imp.src)[r.index - 1];
    if (!sl?.part || !imp.src[sl.part]) {
      warnings.push(`Slide ${r.index} of ${sources[r.src].sourceLabel} was not found`);
      continue;
    }
    const np = imp.copy(sl.part);
    const rid = uniqueRid(`rIdImp${++k}`);
    presRels.push({ id: rid, type: REL_SLIDE, target: relTarget('ppt/presentation.xml', np) });
    kept.push({ part: np, rid, src: r.src });
  }
  if (!kept.length) throw new PptxError('None of the chosen slides were found');

  // Register copied masters with fresh ids (master and layout ids share one number space).
  const newMasters = [...importers.values()].flatMap((i) => i.masters);
  if (newMasters.length) {
    const newSet = new Set(newMasters);
    let maxId = 2147483647;
    for (const m of pres.matchAll(/<p:sldMasterId\b[^>]*\sid="(\d+)"/g)) maxId = Math.max(maxId, Number(m[1]));
    for (const p of Object.keys(files)) {
      if (!/^ppt\/slideMasters\/[^/]+\.xml$/.test(p) || newSet.has(p)) continue;
      for (const m of (text(files, p) ?? '').matchAll(/<p:sldLayoutId\b[^>]*\sid="(\d+)"/g)) maxId = Math.max(maxId, Number(m[1]));
    }
    let entries = '';
    for (const mp of newMasters) {
      const xml = (text(files, mp) ?? '').replace(/(<p:sldLayoutId\b[^>]*\sid=")\d+"/g, (_, a) => `${a}${++maxId}"`);
      files[mp] = strToU8(xml);
      const rid = uniqueRid(`rIdMaster${maxId}`);
      presRels.push({ id: rid, type: REL_MASTER, target: relTarget('ppt/presentation.xml', mp) });
      entries += `<p:sldMasterId id="${++maxId}" r:id="${rid}"/>`;
    }
    pres = pres.replace('</p:sldMasterIdLst>', `${entries}</p:sldMasterIdLst>`);
  }

  // 3. Media: the redesign logo.
  const logoPart = 'ppt/media/redesign-cobrand-logo.png';
  if (brand.logoPng) {
    if (!pngSize(brand.logoPng)) warnings.push('Logo is not a PNG; slides were built without it');
    else {
      files[logoPart] = brand.logoPng;
      if (!/<Default Extension="png"/i.test(box.ct)) box.ct = box.ct.replace(/(<Types\b[^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>');
    }
  }
  const logo = brand.logoPng && pngSize(brand.logoPng) ? brand.logoPng : undefined;

  // 4. Stamp each OEM slide with a small white pill holding its source line and the logo,
  //    so it reads on any background. Apply writing rules to text runs.
  let renamed = 0;
  const pillH = 0.3 * EMU;
  const pad = 0.1 * EMU;
  const edge = 0.12 * EMU;
  const lb0 = logoBox(logo, 0, 0, pillH - 2 * 0.06 * EMU);
  for (const s of kept) {
    const src = sources[s.src];
    const corner = src.stampCorner ?? 'bottom-right';
    const label = `Source: ${src.partnerName}, ${src.sourceLabel}. Presented by redesign.`;
    const textW = Math.min(cx * 0.6, label.length * 0.056 * EMU);
    const pillW = pad + textW + (lb0 ? pad + lb0.w : 0) + pad;
    const px = corner.endsWith('right') ? cx - edge - pillW : edge;
    const py = corner.startsWith('bottom') ? cy - edge - pillH : edge;
    let xml = text(files, s.part)!;
    const relsPath0 = relsPathFor(s.part);
    const stripped = stripComments(xml, parseRels(text(files, relsPath0)));
    if (stripped.xml !== xml) {
      xml = stripped.xml;
      files[relsPath0] = strToU8(writeRels(stripped.rels));
    }
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
      rels.push({ id: rid, type: REL_IMAGE, target: relTarget(s.part, logoPart) });
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

  // 5. Layout for the new slides: a blank layout of the base deck, else the first kept slide's layout.
  const firstLayoutRel = parseRels(text(files, relsPathFor(kept[0].part))).find((r) => r.type === REL_LAYOUT);
  let layoutPart = firstLayoutRel ? resolvePart(kept[0].part, firstLayoutRel.target) : '';
  const blank = Object.keys(files).find((p) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p) && /<p:sldLayout\b[^>]*type="blank"/.test(text(files, p) ?? ''));
  if (blank) layoutPart = blank;
  if (!layoutPart) throw new PptxError('The deck has no slide layout to build on');

  // 6. New redesign slides.
  let n = Math.max(0, ...Object.keys(files).map((p) => Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(p)?.[1] ?? 0)));
  const newSlide = (shapes: string): { part: string; rid: string } => {
    const part = `ppt/slides/slide${++n}.xml`;
    const rels = [{ id: 'rId1', type: REL_LAYOUT, target: relTarget(part, layoutPart) }];
    if (logo) rels.push({ id: 'rId2', type: REL_IMAGE, target: relTarget(part, logoPart) });
    files[part] = strToU8(slideXml(shapes, { whiteBg: true, hideMaster: true }));
    files[relsPathFor(part)] = strToU8(writeRels(rels));
    box.ct = box.ct.replace('</Types>', `<Override PartName="/${part}" ContentType="${CT_SLIDE}"/></Types>`);
    const rid = uniqueRid(`rIdPitch${n}`);
    presRels.push({ id: rid, type: REL_SLIDE, target: `slides/slide${n}.xml` });
    return { part, rid };
  };

  const S = (v: number) => (v * cx) / 13.333; // scale inches on a 13.333 in wide slide
  const V = (v: number) => (v * cy) / 7.5;
  const clean = (s: string) => sanitizeText(s.trim());
  const partners = [...new Set(kept.map((s) => sources[s.src].partnerName))];
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
      partners.map((p) => `${clean(p)} product content in this deck is provided by ${clean(p)} and remains its property, including its trademarks and notices.`),
      { size: 9, color: MUTED, font: UI_FONT },
    ),
  ].join('');
  const first = newSlide(titleShapes);
  const last = newSlide(closeShapes);

  // 7. Slide order: title, kept OEM slides in the chosen order, closing.
  let nextId = Math.max(255, ...all.map((s) => Number(s.id) || 0));
  const entry = (rid: string) => `<p:sldId id="${++nextId}" r:id="${rid}"/>`;
  const ids = [entry(first.rid), ...kept.map((s) => (s.id ? `<p:sldId id="${s.id}" r:id="${s.rid}"/>` : entry(s.rid))), entry(last.rid)];
  pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${ids.join('')}</p:sldIdLst>`);
  files['ppt/presentation.xml'] = strToU8(pres);
  files[presRelsPath] = strToU8(writeRels(presRels));
  files['[Content_Types].xml'] = strToU8(box.ct);
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
  for (const p of Object.keys(files)) if (/^ppt\/slides\/[^/]+\.xml$/.test(p) && !ct.includes(`PartName="/${p}"`)) problems.push(`No content type for ${p}`);
  // Every r:id, r:embed or r:link in a slide, layout or master must exist in its .rels.
  // A dangling one is what makes PowerPoint offer to repair the file.
  for (const p of Object.keys(files)) {
    if (!/^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(p)) continue;
    const ids = new Set(parseRels(text(files, relsPathFor(p))).map((r) => r.id));
    for (const m of (text(files, p) ?? '').matchAll(/\sr:(?:id|embed|link|pict)="([^"]+)"/g)) if (!ids.has(m[1])) problems.push(`${p} refers to ${m[1]}, which has no relationship`);
  }
  return problems;
}

export { XML_HEAD };
