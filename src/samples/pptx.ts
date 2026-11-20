// Synthetic "partner deck" for tests and the sample library. Placeholder wording
// only: no real OEM content. Shaped like a typical partner deck: a master with the
// partner's band, title placeholders, an architecture slide with boxes, and a
// legal notice slide.
import { strToU8, zipSync } from 'fflate';
import { NS_A, NS_P, NS_R, NS_CT, NS_REL, XML_HEAD, SP_TREE_HEAD, esc, rect, textBox, writeRels, REL_LAYOUT, REL_SLIDE, CT_SLIDE } from '../core/pitch/ooxml';

const W = 12192000;
const H = 6858000;
const IN = 914400;

function titleShape(id: number, t: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Title ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${0.6 * IN}" y="${0.5 * IN}"/><a:ext cx="${12 * IN}" cy="${0.9 * IN}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3200"/><a:t>${esc(t)}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

function slide(shapes: string): string {
  return `${XML_HEAD}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${SP_TREE_HEAD}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const body = (id: number, lines: string[], y = 1.6) => textBox(id, `Body ${id}`, { x: 0.6 * IN, y: y * IN, w: 12 * IN, h: 4.5 * IN }, lines, { size: 20, color: '333333' }, { bullets: true });

const THEME = `${XML_HEAD}<a:theme xmlns:a="${NS_A}" name="Sample Partner"><a:themeElements><a:clrScheme name="Sample"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2><a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="F97316"/></a:accent2><a:accent3><a:srgbClr val="10B981"/></a:accent3><a:accent4><a:srgbClr val="8B5CF6"/></a:accent4><a:accent5><a:srgbClr val="EF4444"/></a:accent5><a:accent6><a:srgbClr val="6B7280"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme><a:fontScheme name="Sample"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Sample"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

export interface SampleDeckOptions {
  partner: string;
  product: string;
  otherProduct: string;
  /** Extra text on the messaging slide, used by tests for the naming rules. */
  extraLine?: string;
}

export function makeSampleDeck(o: SampleDeckOptions): Uint8Array {
  const band = rect(2, 'Partner band', { x: 0, y: H - 0.45 * IN, w: W, h: 0.45 * IN }, '1F2937', { paras: [`${o.partner} partner content (sample)`], st: { size: 10, color: 'FFFFFF' } });
  const master = `${XML_HEAD}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F3F4F6"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${SP_TREE_HEAD}${band}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/></p:sldLayoutIdLst></p:sldMaster>`;
  const layout = (name: string, type: string) => `${XML_HEAD}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="${type}" preserve="1"><p:cSld name="${name}"><p:spTree>${SP_TREE_HEAD}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

  const boxes = ['Endpoints', 'Network', 'Cloud', 'Identity'].map((t, i) => rect(10 + i, `Source ${t}`, { x: (0.6 + i * 3.1) * IN, y: 1.8 * IN, w: 2.8 * IN, h: 0.9 * IN }, 'DBEAFE', { paras: [t], st: { size: 16, color: '1F2937' } })).join('');
  const core = rect(20, 'Core', { x: 0.6 * IN, y: 3.2 * IN, w: 12 * IN, h: 1.1 * IN }, '2563EB', { paras: [`${o.product} analytics and response (placeholder)`], st: { size: 20, color: 'FFFFFF' } });
  const out = rect(21, 'Outcomes', { x: 0.6 * IN, y: 4.8 * IN, w: 12 * IN, h: 0.9 * IN }, 'E5E7EB', { paras: ['Integrations with SIEM, ticketing and identity tools (placeholder)'], st: { size: 16, color: '1F2937' } });

  const slides = [
    slide(titleShape(2, `${o.product} overview (sample deck)`) + body(3, ['Synthetic partner deck for testing the pitch builder', 'No real partner content'], 2)),
    slide(titleShape(2, 'Agenda') + body(3, ['Why it matters', 'Architecture', 'Use cases', 'Next steps'])),
    slide(titleShape(2, `Why ${o.product}`) + body(3, ['Placeholder value message one', 'Placeholder value message two', 'Placeholder differentiator', ...(o.extraLine ? [o.extraLine] : [])])),
    slide(titleShape(2, `${o.product} architecture`) + boxes + core + out),
    slide(titleShape(2, 'Customer use cases') + body(3, [`Placeholder scenario where ${o.product} shortens response time`, 'Placeholder scenario for a lean security team'])),
    slide(titleShape(2, `${o.otherProduct} overview`) + body(3, ['A different product in the same deck', 'Should not be picked for this pitch'])),
    slide(titleShape(2, 'Forward-looking statements') + body(3, [`Sample legal notice. ${o.partner} and its product names are trademarks of their owner (sample).`, 'This slide must stay in any deck built from this one.'])),
  ];

  const files: Record<string, Uint8Array> = {};
  const ct = [
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`,
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`,
    `<Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`,
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`,
    ...slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${CT_SLIDE}"/>`),
  ];
  files['[Content_Types].xml'] = strToU8(`${XML_HEAD}<Types xmlns="${NS_CT}">${ct.join('')}</Types>`);
  files['_rels/.rels'] = strToU8(writeRels([{ id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument', target: 'ppt/presentation.xml' }]));
  files['ppt/presentation.xml'] = strToU8(
    `${XML_HEAD}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  files['ppt/_rels/presentation.xml.rels'] = strToU8(
    writeRels([
      { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster', target: 'slideMasters/slideMaster1.xml' },
      { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme', target: 'theme/theme1.xml' },
      ...slides.map((_, i) => ({ id: `rId${i + 3}`, type: REL_SLIDE, target: `slides/slide${i + 1}.xml` })),
    ]),
  );
  files['ppt/slideMasters/slideMaster1.xml'] = strToU8(master);
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = strToU8(
    writeRels([
      { id: 'rId1', type: REL_LAYOUT, target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: REL_LAYOUT, target: '../slideLayouts/slideLayout2.xml' },
      { id: 'rId3', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme', target: '../theme/theme1.xml' },
    ]),
  );
  files['ppt/slideLayouts/slideLayout1.xml'] = strToU8(layout('Title Only', 'titleOnly'));
  files['ppt/slideLayouts/slideLayout2.xml'] = strToU8(layout('Blank', 'blank'));
  for (const l of [1, 2]) files[`ppt/slideLayouts/_rels/slideLayout${l}.xml.rels`] = strToU8(writeRels([{ id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster', target: '../slideMasters/slideMaster1.xml' }]));
  files['ppt/theme/theme1.xml'] = strToU8(THEME);
  slides.forEach((s, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(s);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = strToU8(writeRels([{ id: 'rId1', type: REL_LAYOUT, target: '../slideLayouts/slideLayout1.xml' }]));
  });
  return zipSync(files, { level: 6 });
}

export { NS_REL };
