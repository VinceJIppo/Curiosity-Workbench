// Sales plays: co-branded pitch kits built from OEM partner decks.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ModuleManifest } from '../../app/module';
import { update, useWorkspace } from '../../app/store';
import { navigate } from '../../app/router';
import { downloadBlob, getBlob, pickFile, putBlob, deleteBlob } from '../../app/persist';
import { buildPitch, readDeck, STAMP_CORNERS, type StampCorner } from '../../core/pitch/pptx';
import { detectProducts, suggestTypes, SLIDE_TYPES, type SlideType } from '../../core/pitch/tags';
import { sanitizeText } from '../../core/format';
import { makeSampleDeck } from '../../samples/pptx';
import { Empty, Field, Modal, NumberInput, Select, TextInput, toast } from '../../ui/components';
import { hasLogo, logoPng } from '../../ui/logo';
import { blobKey, defaultData, getData, isStale, pickSlides, type DeckMeta, type PlaysData, type Play } from './data';
import { newId } from '../shared';

const PLAYS_VERSION = 1;

const setData = (fn: (d: PlaysData) => void, label: string, coalesce?: string) =>
  update(
    (w) => {
      const d = getData(w);
      fn(d);
      w.modules.plays = d;
      w.moduleVersions.plays = PLAYS_VERSION;
    },
    label,
    coalesce ? { coalesce } : undefined,
  );

function oemNames(ws: ReturnType<typeof useWorkspace>, d: PlaysData): string[] {
  return [...new Set([...ws.entities.vendors.filter((v) => v.kind === 'OEM').map((v) => v.name), ...Object.keys(d.catalog), ...d.decks.map((x) => x.oem)])];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const thisMonth = () => new Date().toISOString().slice(0, 7);

async function importDeckBytes(bytes: Uint8Array, fileName: string, oem: string, contentDate: string, d: PlaysData): Promise<DeckMeta> {
  const info = readDeck(bytes);
  const catalog = d.catalog[oem] ?? [];
  const deck: DeckMeta = {
    id: newId('deck'),
    oem,
    name: fileName.replace(/\.pptx$/i, ''),
    fileName,
    contentDate,
    importedAt: new Date().toISOString(),
    size: bytes.length,
    stampCorner: 'bottom-right',
    slides: info.slides.map((s) => ({ index: s.index, title: s.title, excerpt: (s.text.startsWith(s.title) ? s.text.slice(s.title.length) : s.text).replace(/\s+/g, ' ').trim().slice(0, 280), types: suggestTypes(s.title, s.text, s.index), products: detectProducts(`${s.title}\n${s.text}`, catalog) })),
  };
  if (!(await putBlob(blobKey(deck.id), bytes))) toast('Browser storage is blocked; the deck lasts until you close this tab');
  return deck;
}

// ---------------- Pitch builder ----------------

function Builder() {
  const ws = useWorkspace();
  const d = getData(ws);
  const oems = oemNames(ws, d).filter((o) => d.decks.some((x) => x.oem === o));
  const [oem, setOem] = useState(oems[0] ?? '');
  const products = useMemo(() => [...new Set([...(d.catalog[oem] ?? []), ...d.decks.filter((x) => x.oem === oem).flatMap((x) => x.slides.flatMap((s) => s.products))])], [oem, ws]);
  const [product, setProduct] = useState('');
  const [playId, setPlayId] = useState(d.plays[0]?.id ?? '');
  const play = d.plays.find((p) => p.id === playId) ?? d.plays[0];
  const decksForOem = d.decks.filter((x) => x.oem === oem).sort((a, b) => b.contentDate.localeCompare(a.contentDate));
  const withProduct = decksForOem.filter((x) => x.slides.some((s) => s.products.includes(product)));
  const [deckId, setDeckId] = useState('');
  const deck = d.decks.find((x) => x.id === deckId) ?? withProduct[0] ?? decksForOem[0];
  const [chosen, setChosen] = useState<number[]>([]);
  const [customer, setCustomer] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [contact, setContact] = useState('');
  const [heading, setHeading] = useState(play?.servicesHeading ?? 'How redesign helps');
  const [bullets, setBullets] = useState((play?.servicesBullets ?? []).join('\n'));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!oems.includes(oem) && oems.length) setOem(oems[0]);
  }, [oems.join('|')]);
  useEffect(() => {
    if (!product || !products.includes(product)) setProduct(products[0] ?? '');
  }, [oem, products.join('|')]);
  useEffect(() => {
    if (!deck || !play) return setChosen([]);
    setChosen(pickSlides(deck, product, play).chosen);
    setHeading(play.servicesHeading);
    setBullets(play.servicesBullets.join('\n'));
    setSubtitle(play.name);
  }, [deck?.id, product, play?.id]);

  if (!d.decks.length)
    return (
      <Empty>
        No partner decks yet. <a href="#/plays/library">Import one in the slide library</a>, or load the synthetic sample there to try the builder.
      </Empty>
    );
  const legal = deck ? deck.slides.filter((s) => s.types.includes('legal')).map((s) => s.index) : [];
  const move = (i: number, dir: -1 | 1) => {
    const n = [...chosen];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setChosen(n);
  };
  const build = async () => {
    if (!deck) return;
    setBusy(true);
    try {
      const src = await getBlob(blobKey(deck.id));
      if (!src) throw new Error('The deck file is not in this browser. Import it again, or import a slide library file.');
      const res = buildPitch(src, chosen, legal, {
        partnerName: deck.oem,
        sourceLabel: `${deck.name} (${deck.contentDate})`,
        title: product || deck.name,
        subtitle,
        customer,
        preparedBy,
        date: new Date().toISOString().slice(0, 10),
        servicesHeading: heading,
        servicesBullets: bullets.split('\n'),
        contact,
        logoPng: (await logoPng()) ?? undefined,
        stampCorner: deck.stampCorner,
      });
      const name = `${slug(customer || 'pitch')}-${slug(product || deck.name)}-redesign.pptx`;
      downloadBlob(new Blob([res.bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), name);
      toast(`Built ${res.slideCount} slides${res.renamed ? `, ${res.renamed} text runs updated to the naming rules` : ''}`);
      res.warnings.forEach((w) => toast(w));
    } catch (e) {
      toast(`Could not build: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="stack">
      <div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <Field label="OEM">
          <Select value={oem} options={oems} onChange={(v) => setOem(v)} />
        </Field>
        <Field label="Product">
          <Select value={product} options={products} onChange={(v) => setProduct(v)} allowEmpty="Any" />
        </Field>
        <Field label="Play">
          <Select value={play?.id ?? ''} options={d.plays.map((p) => p.id)} labels={Object.fromEntries(d.plays.map((p) => [p.id, p.name]))} onChange={(v) => setPlayId(v)} />
        </Field>
        <Field label="Source deck">
          <Select value={deck?.id ?? ''} options={decksForOem.map((x) => x.id)} labels={Object.fromEntries(decksForOem.map((x) => [x.id, `${x.name} (${x.contentDate})${isStale(x, d.staleMonths) ? ', stale' : ''}`]))} onChange={(v) => setDeckId(v)} />
        </Field>
      </div>
      {deck && isStale(deck, d.staleMonths) && (
        <div class="callout warn">
          This deck is from {deck.contentDate}, more than {d.staleMonths} months ago. Pull the current version from the {deck.oem} partner portal before a customer sees it.
        </div>
      )}
      {!hasLogo() && <div class="callout small">No redesign logo is embedded, so the slides carry the source line without a logo. Add assets/brand/redesign_logo_black.svg and rebuild.</div>}
      {deck && (
        <div class="grid2">
          <div>
            <h3>Slides in {deck.name}</h3>
            <div class="table-wrap" style="max-height:460px">
              <table class="data">
                <tbody>
                  {deck.slides.map((s) => {
                    const isLegal = s.types.includes('legal');
                    const on = chosen.includes(s.index) || isLegal;
                    return (
                      <tr key={s.index} class={on ? 'selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={isLegal}
                            aria-label={`Include slide ${s.index}`}
                            onChange={(e) => setChosen((e.target as HTMLInputElement).checked ? [...chosen, s.index] : chosen.filter((x) => x !== s.index))}
                          />
                        </td>
                        <td class="num">{s.index}</td>
                        <td>
                          <b>{s.title}</b>
                          <div class="small muted">{s.excerpt.slice(0, 120)}</div>
                        </td>
                        <td class="small">
                          {s.types.join(', ')}
                          {isLegal && <div class="muted">OEM notice, always included</div>}
                          {s.products.length > 0 && <div class="muted">{s.products.join(', ')}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div class="stack">
            <h3>Pitch order</h3>
            <ol class="small" style="margin:0;padding-left:20px">
              <li>redesign title slide</li>
              {chosen.map((i, k) => {
                const s = deck.slides.find((x) => x.index === i);
                return (
                  <li key={i}>
                    {s?.title ?? `Slide ${i}`}{' '}
                    <button class="btn small ghost" onClick={() => move(k, -1)} aria-label="Move up" disabled={k === 0}>
                      Up
                    </button>
                    <button class="btn small ghost" onClick={() => move(k, 1)} aria-label="Move down" disabled={k === chosen.length - 1}>
                      Down
                    </button>
                  </li>
                );
              })}
              {legal.filter((i) => !chosen.includes(i)).map((i) => (
                <li key={`l${i}`} class="muted">
                  {deck.slides.find((x) => x.index === i)?.title} (OEM notice)
                </li>
              ))}
              <li>{heading || 'How redesign helps'}</li>
            </ol>
            <div class="form-grid">
              <Field label="Customer">
                <TextInput value={customer} onChange={setCustomer} placeholder="Account name" />
              </Field>
              <Field label="Prepared by">
                <TextInput value={preparedBy} onChange={setPreparedBy} placeholder="Rep name" />
              </Field>
              <Field label="Subtitle">
                <TextInput value={subtitle} onChange={setSubtitle} />
              </Field>
              <Field label="Contact line">
                <TextInput value={contact} onChange={setContact} placeholder="Email or phone" />
              </Field>
            </div>
            <Field label="Closing slide heading">
              <TextInput value={heading} onChange={setHeading} />
            </Field>
            <Field label="Closing slide bullets (one per line)">
              <textarea class="text" rows={4} value={bullets} onInput={(e) => setBullets((e.target as HTMLTextAreaElement).value)} />
            </Field>
            <div class="row">
              <button class="btn primary" onClick={build} disabled={busy || !chosen.length} data-testid="build-pitch">
                {busy ? 'Building...' : 'Download co-branded PPTX'}
              </button>
              <span class="small muted">
                {chosen.length + legal.filter((i) => !chosen.includes(i)).length + 2} slides. OEM slides keep their content and notices and gain a redesign source line.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Slide library ----------------

function ImportDeck({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const d = getData(ws);
  const oems = oemNames(ws, d);
  const [file, setFile] = useState<File | null>(null);
  const [oem, setOem] = useState(oems[0] ?? '');
  const [date, setDate] = useState(thisMonth());
  const [err, setErr] = useState('');
  return (
    <Modal title="Import a partner deck" onClose={onClose}>
      <div class="stack">
        <p class="small">Download the current deck from the partner portal as .pptx, then pick it here. The file stays in this browser.</p>
        <div class="row">
          <button class="btn" onClick={async () => setFile(await pickFile('.pptx'))} data-testid="pick-deck">
            Choose .pptx
          </button>
          <span class="small">{file?.name ?? 'No file chosen'}</span>
        </div>
        <div class="form-grid">
          <Field label="OEM">
            <Select value={oem} options={oems} onChange={(v) => setOem(v)} />
          </Field>
          <Field label="Deck date (YYYY-MM)" hint="When the OEM published it. Drives the stale flag.">
            <TextInput value={date} onChange={setDate} />
          </Field>
        </div>
        {err && <div class="callout error">{err}</div>}
        <div class="row">
          <button
            class="btn primary"
            disabled={!file || !oem}
            data-testid="import-deck"
            onClick={async () => {
              try {
                const deck = await importDeckBytes(new Uint8Array(await file!.arrayBuffer()), file!.name, oem, date, d);
                setData((x) => x.decks.push(deck), `Imported deck ${deck.name}`);
                toast(`Imported ${deck.slides.length} slides`);
                onClose();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Import
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeckDetail({ deck, d }: { deck: DeckMeta; d: PlaysData }) {
  const setDeck = (fn: (x: DeckMeta) => void, label: string, coalesce?: string) => setData((x) => fn(x.decks.find((y) => y.id === deck.id)!), label, coalesce);
  const products = [...new Set([...(d.catalog[deck.oem] ?? []), ...deck.slides.flatMap((s) => s.products)])];
  return (
    <div class="stack">
      <div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <Field label="Deck name">
          <TextInput value={deck.name} onChange={(v) => setDeck((x) => (x.name = v), 'Renamed deck', `dn-${deck.id}`)} />
        </Field>
        <Field label="Deck date (YYYY-MM)">
          <TextInput value={deck.contentDate} onChange={(v) => setDeck((x) => (x.contentDate = v), 'Deck date', `dd-${deck.id}`)} />
        </Field>
        <Field label="Source line and logo corner" hint="Pick a corner the OEM's slides leave clear.">
          <Select value={deck.stampCorner} options={STAMP_CORNERS} onChange={(v) => setDeck((x) => (x.stampCorner = (v || 'bottom-right') as StampCorner), 'Stamp corner')} />
        </Field>
        <Field label="Slides">
          <span>
            {deck.slides.length} slides, {(deck.size / 1024 / 1024).toFixed(1)} MB
          </span>
        </Field>
      </div>
      <div class="table-wrap" style="max-height:520px">
        <table class="data">
          <thead>
            <tr>
              <th class="num">#</th>
              <th>Slide</th>
              <th>Type</th>
              <th>Products</th>
            </tr>
          </thead>
          <tbody>
            {deck.slides.map((s, k) => (
              <tr key={s.index}>
                <td class="num">{s.index}</td>
                <td>
                  <b>{s.title}</b>
                  <div class="small muted">{s.excerpt.slice(0, 160)}</div>
                </td>
                <td style="min-width:150px">
                  {SLIDE_TYPES.map((t) => (
                    <label key={t} class="small" style="display:block">
                      <input
                        type="checkbox"
                        checked={s.types.includes(t)}
                        onChange={(e) => setDeck((x) => (x.slides[k].types = (e.target as HTMLInputElement).checked ? [...x.slides[k].types, t] : x.slides[k].types.filter((y) => y !== t)) as SlideType[], 'Edited slide type')}
                      />{' '}
                      {t}
                    </label>
                  ))}
                </td>
                <td style="min-width:200px">
                  {products.map((p) => (
                    <label key={p} class="small" style="display:block">
                      <input
                        type="checkbox"
                        checked={s.products.includes(p)}
                        onChange={(e) => setDeck((x) => (x.slides[k].products = (e.target as HTMLInputElement).checked ? [...x.slides[k].products, p] : x.slides[k].products.filter((y) => y !== p)), 'Edited slide products')}
                      />{' '}
                      {p}
                    </label>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Library() {
  const ws = useWorkspace();
  const d = getData(ws);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [present, setPresent] = useState<Record<string, boolean>>({});
  useEffect(() => {
    Promise.all(d.decks.map(async (x) => [x.id, !!(await getBlob(blobKey(x.id)))] as const)).then((r) => setPresent(Object.fromEntries(r)));
  }, [d.decks.map((x) => x.id).join('|')]);
  const deck = d.decks.find((x) => x.id === open);

  const exportLibrary = async () => {
    const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify({ kind: 'cto-workbench-slide-library', version: 1, decks: d.decks }, null, 1)) };
    for (const x of d.decks) {
      const b = await getBlob(blobKey(x.id));
      if (b) files[`decks/${x.id}.pptx`] = b;
    }
    downloadBlob(new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `slide-library-${thisMonth()}.zip`);
  };
  const importLibrary = async () => {
    const f = await pickFile('.zip');
    if (!f) return;
    try {
      const files = unzipSync(new Uint8Array(await f.arrayBuffer()));
      const man = JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array()));
      if (man.kind !== 'cto-workbench-slide-library') throw new Error('Not a slide library file');
      const decks: DeckMeta[] = man.decks;
      for (const x of decks) if (files[`decks/${x.id}.pptx`]) await putBlob(blobKey(x.id), files[`decks/${x.id}.pptx`]);
      setData((dd) => {
        const m = new Map(dd.decks.map((x) => [x.id, x]));
        decks.forEach((x) => m.set(x.id, x));
        dd.decks = [...m.values()];
      }, `Imported slide library (${decks.length} decks)`);
      toast(`Imported ${decks.length} decks`);
      setPresent({});
    } catch (e) {
      toast(`Could not import: ${(e as Error).message}`);
    }
  };
  const loadSample = async () => {
    const samples = [
      { oem: 'Palo Alto Networks', product: 'Cortex XDR', other: 'Prisma Access' },
      { oem: 'Broadcom/VMware', product: 'VMware Cloud Foundation', other: 'VMware Avi Load Balancer' },
    ];
    const made: DeckMeta[] = [];
    for (const s of samples) {
      const bytes = makeSampleDeck({ partner: s.oem, product: s.product, otherProduct: s.other });
      const m = await importDeckBytes(bytes, `Sample ${s.product} deck (synthetic).pptx`, s.oem, thisMonth(), d);
      made.push(m);
    }
    setData((x) => x.decks.push(...made), 'Loaded sample decks');
    toast('Loaded two synthetic sample decks');
  };

  return (
    <div class="stack">
      <div class="callout small">
        Co-branded: redesign title and closing slides wrap the OEM's slides. OEM slides keep their content, branding and notices and gain a small "Source: OEM. Presented by redesign." line. Use only decks the partner program lets you share with customers. Deck files stay in this browser; share them with a slide library file, not the workspace file.
      </div>
      <div class="row">
        <button class="btn primary" onClick={() => setImporting(true)} data-testid="open-import-deck">
          Import a deck
        </button>
        <button class="btn" onClick={exportLibrary} disabled={!d.decks.length}>
          Export slide library
        </button>
        <button class="btn" onClick={importLibrary}>
          Import slide library
        </button>
        <button class="btn" onClick={loadSample} data-testid="load-sample-decks">
          Load sample decks
        </button>
        <span style="flex:1" />
        <label class="small row">
          Stale after
          <NumberInput value={d.staleMonths} onChange={(v) => setData((x) => (x.staleMonths = Math.max(1, Math.round(v ?? 6))), 'Stale months', 'stale')} cls="text" />
          months
        </label>
      </div>
      {d.decks.length === 0 ? (
        <Empty>No decks yet.</Empty>
      ) : (
        <table class="data">
          <thead>
            <tr>
              <th>OEM</th>
              <th>Deck</th>
              <th>Date</th>
              <th class="num">Slides</th>
              <th>Products</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...d.decks]
              .sort((a, b) => a.oem.localeCompare(b.oem) || b.contentDate.localeCompare(a.contentDate))
              .map((x) => (
                <tr key={x.id} class={open === x.id ? 'selected' : ''}>
                  <td>{x.oem}</td>
                  <td>{x.name}</td>
                  <td>{x.contentDate}</td>
                  <td class="num">{x.slides.length}</td>
                  <td class="small">{[...new Set(x.slides.flatMap((s) => s.products))].join(', ')}</td>
                  <td>
                    {isStale(x, d.staleMonths) ? <span class="badge fail">stale</span> : <span class="badge pass">current</span>}
                    {present[x.id] === false && <span class="badge fail" style="margin-left:4px" title="The file is not in this browser">file missing</span>}
                  </td>
                  <td class="row">
                    <button class="btn small" onClick={() => setOpen(open === x.id ? null : x.id)}>
                      {open === x.id ? 'Close' : 'Tags'}
                    </button>
                    <button
                      class="btn small ghost"
                      onClick={async () => {
                        if (!confirm(`Remove ${x.name}?`)) return;
                        await deleteBlob(blobKey(x.id));
                        setData((dd) => (dd.decks = dd.decks.filter((y) => y.id !== x.id)), `Removed deck ${x.name}`);
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {deck && <DeckDetail deck={deck} d={d} />}
      {importing && <ImportDeck onClose={() => setImporting(false)} />}
    </div>
  );
}

// ---------------- Plays and catalog ----------------

function Plays() {
  const ws = useWorkspace();
  const d = getData(ws);
  const setPlay = (id: string, fn: (p: Play) => void, label: string, coalesce?: string) => setData((x) => fn(x.plays.find((p) => p.id === id)!), label, coalesce);
  return (
    <div class="grid2">
      <div class="stack">
        <h3>Plays</h3>
        <p class="small muted">A play picks slide types in order, up to a slide count, and sets the closing slide. The rep picks the product when building.</p>
        {d.plays.map((p) => (
          <div class="card" key={p.id}>
            <div class="form-grid">
              <Field label="Name">
                <TextInput value={p.name} onChange={(v) => setPlay(p.id, (x) => (x.name = v), 'Renamed play', `pn-${p.id}`)} />
              </Field>
              <Field label="Maximum OEM slides">
                <NumberInput value={p.maxSlides} onChange={(v) => setPlay(p.id, (x) => (x.maxSlides = Math.max(1, Math.round(v ?? 4))), 'Play size', `pm-${p.id}`)} />
              </Field>
              <Field label="Slide types, in order (comma separated)" hint={SLIDE_TYPES.join(', ')}>
                <TextInput value={p.types.join(', ')} onChange={(v) => setPlay(p.id, (x) => (x.types = v.split(',').map((t) => t.trim()).filter((t): t is SlideType => (SLIDE_TYPES as readonly string[]).includes(t))), 'Play types', `pt-${p.id}`)} />
              </Field>
              <Field label="Closing heading">
                <TextInput value={p.servicesHeading} onChange={(v) => setPlay(p.id, (x) => (x.servicesHeading = sanitizeText(v)), 'Play heading', `ph-${p.id}`)} />
              </Field>
            </div>
            <Field label="Closing bullets (one per line)">
              <textarea class="text" rows={3} value={p.servicesBullets.join('\n')} onInput={(e) => setPlay(p.id, (x) => (x.servicesBullets = (e.target as HTMLTextAreaElement).value.split('\n')), 'Play bullets', `pb-${p.id}`)} />
            </Field>
            <div class="row" style="margin-top:8px">
              <button class="btn small ghost" onClick={() => setData((x) => (x.plays = x.plays.filter((y) => y.id !== p.id)), 'Deleted play')}>
                Delete play
              </button>
            </div>
          </div>
        ))}
        <div class="row">
          <button class="btn small" onClick={() => setData((x) => x.plays.push({ ...defaultData().plays[0], id: newId('play'), name: 'New play' }), 'Added play')}>
            Add play
          </button>
        </div>
      </div>
      <div class="stack">
        <h3>Product catalog</h3>
        <p class="small muted">Product names the library looks for in slide text, by OEM. One per line. Edits apply to decks you import from now on.</p>
        {oemNames(ws, d).map((o) => (
          <Field key={o} label={o}>
            <textarea class="text" rows={3} value={(d.catalog[o] ?? []).join('\n')} onInput={(e) => setData((x) => (x.catalog[o] = (e.target as HTMLTextAreaElement).value.split('\n').map((s) => s.trim()).filter(Boolean)), `Catalog ${o}`, `cat-${o}`)} />
          </Field>
        ))}
        <button class="btn small" onClick={() => navigate('/plays/library')}>
          Go to slide library
        </button>
      </div>
    </div>
  );
}

export const playsModule: ModuleManifest = {
  id: 'plays',
  title: 'Sales plays',
  icon: 'M3 5h18v12H3zM8 21h8M12 17v4M7 9h6M7 12h10',
  navOrder: 45,
  migrations: { version: PLAYS_VERSION, migrate: (_from, data) => (data && typeof data === 'object' ? { ...defaultData(), ...(data as object) } : defaultData()) },
  views: [
    { id: 'builder', title: 'Pitch builder', component: Builder },
    { id: 'library', title: 'Slide library', component: Library },
    { id: 'plays', title: 'Plays and catalog', component: Plays },
  ],
};
