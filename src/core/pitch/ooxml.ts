// Small OOXML (PowerPoint) helpers. String based so it runs in the browser and in tests.

export const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
export const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
export const REL_SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
export const REL_LAYOUT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';
export const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
export const REL_NOTES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';
export const CT_SLIDE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** 914400 EMU per inch. */
export const EMU = 914400;

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function unesc(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

export function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unesc(m[1]) : undefined;
}

export interface Rel {
  id: string;
  type: string;
  target: string;
  mode?: string;
}

export function parseRels(xml: string | undefined): Rel[] {
  if (!xml) return [];
  return [...xml.matchAll(/<Relationship\b[^>]*\/?>/g)].map((m) => ({ id: attr(m[0], 'Id') ?? '', type: attr(m[0], 'Type') ?? '', target: attr(m[0], 'Target') ?? '', mode: attr(m[0], 'TargetMode') }));
}

export function writeRels(rels: Rel[]): string {
  return `${XML_HEAD}<Relationships xmlns="${NS_REL}">${rels.map((r) => `<Relationship Id="${esc(r.id)}" Type="${esc(r.type)}" Target="${esc(r.target)}"${r.mode ? ` TargetMode="${esc(r.mode)}"` : ''}/>`).join('')}</Relationships>`;
}

/** Resolve a relationship target relative to the part that owns the .rels file. */
export function resolvePart(ownerPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ownerPart.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** ppt/slides/slide1.xml -> ppt/slides/_rels/slide1.xml.rels */
export function relsPathFor(part: string): string {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
}

export const SP_TREE_HEAD = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

export interface RunStyle {
  size: number; // points
  color?: string; // hex without #
  bold?: boolean;
  font?: string;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const xfrm = (b: Box) => `<a:xfrm><a:off x="${Math.round(b.x)}" y="${Math.round(b.y)}"/><a:ext cx="${Math.round(b.w)}" cy="${Math.round(b.h)}"/></a:xfrm>`;

function run(text: string, st: RunStyle): string {
  const font = st.font ? `<a:latin typeface="${esc(st.font)}"/><a:cs typeface="${esc(st.font)}"/>` : '';
  return `<a:r><a:rPr lang="en-US" sz="${Math.round(st.size * 100)}" b="${st.bold ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${st.color ?? '222222'}"/></a:solidFill>${font}</a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}

/** A text box. Each string in `paras` is a paragraph. `bullets` adds a bullet character. */
export function textBox(id: number, name: string, box: Box, paras: string[], st: RunStyle, opts: { bullets?: boolean; anchor?: 't' | 'ctr' | 'b'; align?: 'l' | 'r' | 'ctr' } = {}): string {
  const pPr = opts.bullets
    ? `<a:pPr marL="285750" indent="-285750"${opts.align ? ` algn="${opts.align}"` : ''}><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/></a:pPr>`
    : opts.align
      ? `<a:pPr algn="${opts.align}"/>`
      : '';
  const body = paras.map((t) => `<a:p>${pPr}${run(t, st)}</a:p>`).join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${opts.anchor ?? 't'}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body || '<a:p/>'}</p:txBody></p:sp>`;
}

export function rect(id: number, name: string, box: Box, fill: string, text?: { paras: string[]; st: RunStyle }): string {
  const tx = text
    ? `<p:txBody><a:bodyPr wrap="square" anchor="ctr"/><a:lstStyle/>${text.paras.map((t) => `<a:p><a:pPr algn="ctr"/>${run(t, text.st)}</a:p>`).join('')}</p:txBody>`
    : '';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>${tx}</p:sp>`;
}

export function picture(id: number, name: string, box: Box, relId: string, descr: string): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(name)}" descr="${esc(descr)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${esc(relId)}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

export function slideXml(shapes: string, opts: { whiteBg?: boolean; hideMaster?: boolean } = {}): string {
  const bg = opts.whiteBg ? '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' : '';
  return `${XML_HEAD}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"${opts.hideMaster ? ' showMasterSp="0"' : ''}><p:cSld>${bg}<p:spTree>${SP_TREE_HEAD}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

/** PNG width and height from the IHDR chunk. */
export function pngSize(png: Uint8Array): { w: number; h: number } | null {
  if (png.length < 24 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) return null;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}
