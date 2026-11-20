// Sales plays: co-branded pitch kits built from OEM partner decks.
// The pitch builder is a four-step flow: meeting, what to showcase, recommended
// slides, finish. Recommendations come from the whole slide library.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ModuleManifest } from '../../app/module';
import { update, useWorkspace } from '../../app/store';
import { navigate } from '../../app/router';
import { downloadBlob, getBlob, pickFile, putBlob, deleteBlob } from '../../app/persist';
import { buildPitch, readDeck, STAMP_CORNERS, type PitchSource, type SlideRef, type StampCorner } from '../../core/pitch/pptx';
import { CATEGORIES, CATEGORY_LABELS, SLIDE_TYPES, type Category, type SlideCategory, type SlideType } from '../../core/pitch/tags';
import { describeQuota, recommend, type Rec } from '../../core/pitch/recommend';
import { sanitizeText } from '../../core/format';
import { makeSampleDeck, makeCompetitiveDeck, makeTechnicalDeck } from '../../samples/pptx';
import { Empty, Field, Modal, NumberInput, Select, TextInput, toast } from '../../ui/components';
import { hasLogo, logoPng } from '../../ui/logo';
import { analyzeDeck, blobKey, defaultData, getData, isStale, migratePlays, toLibDecks, PLAYS_VERSION, type DeckMeta, type PlaysData, type Play } from './data';
import { newId } from '../shared';

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
const LEVELS = ['None', 'Light', 'Some', 'Heavy'];
const CAT_HELP: Record<Category, string> = {
  messaging: 'Why it matters: value, outcomes, use cases, proof points.',
  technical: 'How it works: architecture, deployment, integrations, roadmap.',
  competitive: 'Why us over the alternative: comparisons, displacement, objection handling.',
};

async function importDeckBytes(bytes: Uint8Array, fileName: string, oem: string, contentDate: string, d: PlaysData): Promise<DeckMeta> {
  const info = readDeck(bytes);
  const name = fileName.replace(/\.pptx$/i, '');
  const a = analyzeDeck(info, name, d.catalog[oem] ?? [], d.competitors[oem] ?? []);
  const deck: DeckMeta = { id: newId('deck'), oem, name, fileName, contentDate, importedAt: new Date().toISOString(), size: bytes.length, stampCorner: 'bottom-right', ...a };
  if (!(await putBlob(blobKey(deck.id), bytes))) toast('Browser storage is blocked; the deck lasts until you close this tab');
  return deck;
}

function CategoryBadge({ c }: { c: SlideCategory }) {
  const cls = c === 'competitive' ? 'fail' : c === 'technical' ? 'pass' : c === 'messaging' ? 'Assumed' : 'Open';
  return <span class={`badge ${cls}`}>{CATEGORY_LABELS[c]}</span>;
}

// ---------------- Pitch builder (four steps) ----------------

interface Draft {
  customer: string;
  oem: string;
  products: string[];
  playId: string;
  minutes: number;
  emphasis: Record<Category, number>;
  competitor: string;
  keywords: string;
  /** Chosen slides, in pitch order, as deckId:index. */
  chosen: string[];
  subtitle: string;
  preparedBy: string;
  contact: string;
  heading: string;
  bullets: string;
}

const refKey = (r: { deckId: string; index: number }) => `${r.deckId}:${r.index}`;
const STEPS = ['Meeting', 'What to showcase', 'Recommended slides', 'Finish'];

function Builder() {
  const ws = useWorkspace();
  const d = getData(ws);
  const oems = oemNames(ws, d).filter((o) => d.decks.some((x) => x.oem === o));
  const firstPlay = d.plays[0];
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Draft>(() => ({
    customer: '',
    oem: oems[0] ?? '',
    products: [],
    playId: firstPlay?.id ?? '',
    minutes: firstPlay?.minutes ?? 15,
    emphasis: { ...(firstPlay?.emphasis ?? { messaging: 3, technical: 1, competitive: 0 }) },
    competitor: '',
    keywords: '',
    chosen: [],
    subtitle: firstPlay?.name ?? '',
    preparedBy: '',
    contact: '',
    heading: firstPlay?.servicesHeading ?? 'How redesign helps',
    bullets: (firstPlay?.servicesBullets ?? []).join('\n'),
  }));
  const set = (patch: Partial<Draft>) => setF((x) => ({ ...x, ...patch }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!oems.includes(f.oem) && oems.length) set({ oem: oems[0] });
  }, [oems.join('|')]);

  const decks = d.decks.filter((x) => x.oem === f.oem);
  const products = useMemo(() => [...new Set(decks.flatMap((x) => x.slides.flatMap((s) => s.products)))].sort(), [f.oem, ws]);
  const competitors = useMemo(() => [...new Set([...decks.flatMap((x) => x.slides.flatMap((s) => s.competitors)), ...(d.competitors[f.oem] ?? [])])], [f.oem, ws]);
  const partnerNames = ws.entities.vendors.map((v) => v.name);
  const rec = useMemo(
    () =>
      recommend(toLibDecks(d), {
        oem: f.oem,
        products: f.products,
        minutes: f.minutes,
        minutesPerSlide: d.minutesPerSlide,
        emphasis: f.emphasis,
        competitor: f.emphasis.competitive > 0 ? f.competitor || undefined : undefined,
        keywords: f.keywords.split(',').map((k) => k.trim()).filter(Boolean),
        staleMonths: d.staleMonths,
        now: new Date(),
        partnerNames,
      }),
    [ws, f.oem, f.products.join('|'), f.minutes, JSON.stringify(f.emphasis), f.competitor, f.keywords],
  );
  const allRecs = new Map([...rec.picks, ...rec.alternates].map((r) => [refKey(r), r]));

  if (!d.decks.length)
    return (
      <Empty>
        No partner decks yet. <a href="#/plays/library">Import one in the slide library</a>, or load the synthetic samples there to try the builder.
      </Empty>
    );

  const usePlay = (id: string) => {
    const p = d.plays.find((x) => x.id === id);
    if (!p) return;
    set({ playId: id, minutes: p.minutes, emphasis: { ...p.emphasis }, subtitle: p.name, heading: p.servicesHeading, bullets: p.servicesBullets.join('\n') });
  };
  const goRecommend = () => {
    set({ chosen: rec.picks.map(refKey) });
    setStep(2);
  };
  const chosenRecs = f.chosen.map((k) => allRecs.get(k)).filter((r): r is Rec => !!r);
  const usedDecks = [...new Set(chosenRecs.map((r) => r.deckId))];
  const legal = usedDecks.flatMap((id) => (d.decks.find((x) => x.id === id)?.slides ?? []).filter((s) => s.types.includes('legal')).map((s) => ({ deckId: id, index: s.index, title: s.title })));
  const toggle = (k: string) => set({ chosen: f.chosen.includes(k) ? f.chosen.filter((x) => x !== k) : [...f.chosen, k] });
  const move = (i: number, dir: -1 | 1) => {
    const n = [...f.chosen];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    set({ chosen: n });
  };

  const build = async () => {
    setBusy(true);
    try {
      const deckIds = [...new Set([...chosenRecs.map((r) => r.deckId), ...legal.map((l) => l.deckId)])];
      const sources: PitchSource[] = [];
      for (const id of deckIds) {
        const meta = d.decks.find((x) => x.id === id)!;
        const bytes = await getBlob(blobKey(id));
        if (!bytes) throw new Error(`The file for ${meta.name} is not in this browser. Import it again, or import a slide library file.`);
        sources.push({ bytes, partnerName: meta.oem, sourceLabel: `${meta.name} (${meta.contentDate})`, stampCorner: meta.stampCorner });
      }
      const ref = (deckId: string, index: number): SlideRef => ({ src: deckIds.indexOf(deckId), index });
      const res = buildPitch(
        sources,
        chosenRecs.map((r) => ref(r.deckId, r.index)),
        legal.map((l) => ref(l.deckId, l.index)),
        {
          partnerName: f.oem,
          title: f.products.join(', ') || f.oem,
          subtitle: f.subtitle,
          customer: f.customer,
          preparedBy: f.preparedBy,
          date: new Date().toISOString().slice(0, 10),
          servicesHeading: f.heading,
          servicesBullets: f.bullets.split('\n'),
          contact: f.contact,
          logoPng: (await logoPng()) ?? undefined,
        },
      );
      const name = `${slug(f.customer || 'pitch')}-${slug(f.products.join('-') || f.oem)}-redesign.pptx`;
      downloadBlob(new Blob([res.bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), name);
      toast(`Built ${res.slideCount} slides${res.renamed ? `, ${res.renamed} text runs updated to the naming rules` : ''}`);
      res.warnings.forEach((w) => toast(w));
    } catch (e) {
      toast(`Could not build: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const nav = (
    <div class="row" style="margin-top:14px">
      {step > 0 && (
        <button class="btn" onClick={() => setStep(step - 1)}>
          Back
        </button>
      )}
      {step === 0 && (
        <button class="btn primary" onClick={() => setStep(1)} disabled={!f.oem} data-testid="step-next">
          Next: what to showcase
        </button>
      )}
      {step === 1 && (
        <button class="btn primary" onClick={goRecommend} disabled={!CATEGORIES.some((c) => f.emphasis[c] > 0)} data-testid="step-next">
          Recommend slides
        </button>
      )}
      {step === 2 && (
        <button class="btn primary" onClick={() => setStep(3)} disabled={!f.chosen.length} data-testid="step-next">
          Next: finish
        </button>
      )}
    </div>
  );

  const RecRow = ({ r, on }: { r: Rec; on: boolean }) => (
    <tr class={on ? 'selected' : ''}>
      <td>
        <input type="checkbox" checked={on} onChange={() => toggle(refKey(r))} aria-label={`Include ${r.title}`} />
      </td>
      <td>
        <b>{r.title}</b>
        <div class="small muted">
          {r.deckName}, slide {r.index}
        </div>
        <div class="small">
          {r.reasons.map((x) => (
            <span key={x} class="badge" style="margin:2px 4px 0 0">
              {x}
            </span>
          ))}
          {r.warnings.map((x) => (
            <span key={x} class="badge fail" style="margin:2px 4px 0 0">
              {x}
            </span>
          ))}
        </div>
      </td>
      <td>
        <CategoryBadge c={r.category} />
      </td>
    </tr>
  );

  return (
    <div class="stack" data-testid="pitch-wizard">
      <div class="wizard-steps">
        {STEPS.map((s, i) => (
          <span key={s} class={i === step ? 'on' : ''} style={i < step ? 'cursor:pointer' : ''} onClick={() => i < step && setStep(i)}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {step === 0 && (
        <div class="card stack">
          <h3>Who is the meeting with, and what is it about?</h3>
          <div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
            <Field label="Customer">
              <TextInput value={f.customer} onChange={(v) => set({ customer: v })} placeholder="Account name" />
            </Field>
            <Field label="OEM">
              <Select value={f.oem} options={oems} onChange={(v) => set({ oem: v, products: [], competitor: '' })} />
            </Field>
            <Field label="Meeting type" hint="Sets the length and the mix of slides. You can change both next.">
              <Select value={f.playId} options={d.plays.map((p) => p.id)} labels={Object.fromEntries(d.plays.map((p) => [p.id, `${p.name} (${p.minutes} min)`]))} onChange={(v) => usePlay(v)} />
            </Field>
          </div>
          <Field label="Products to feature" hint="Pick none to draw from everything for this OEM.">
            <div class="row">
              {products.map((p) => (
                <button key={p} class={`btn small ${f.products.includes(p) ? 'primary' : ''}`} aria-pressed={f.products.includes(p)} onClick={() => set({ products: f.products.includes(p) ? f.products.filter((x) => x !== p) : [...f.products, p] })}>
                  {p}
                </button>
              ))}
              {!products.length && <span class="small muted">No product names found in this OEM's decks. Add names in Plays and catalog.</span>}
            </div>
          </Field>
          <p class="small muted">
            Library for {f.oem}: {decks.length} decks, {decks.reduce((s, x) => s + x.slides.length, 0)} slides
            {decks.some((x) => isStale(x, d.staleMonths)) ? `, ${decks.filter((x) => isStale(x, d.staleMonths)).length} stale` : ''}.
          </p>
          {nav}
        </div>
      )}

      {step === 1 && (
        <div class="card stack">
          <h3>What do you want to showcase?</h3>
          <div class="grid3">
            {CATEGORIES.map((c) => (
              <div class={`card ${f.emphasis[c] > 0 ? 'dark-edge' : ''}`} key={c}>
                <div class="row" style="justify-content:space-between">
                  <b>{CATEGORY_LABELS[c]}</b>
                  <span class="small muted">{rec.available[c]} slides fit</span>
                </div>
                <p class="small muted" style="min-height:36px">{CAT_HELP[c]}</p>
                <div class="seg" role="group" aria-label={CATEGORY_LABELS[c]}>
                  {LEVELS.map((l, i) => (
                    <button key={l} class={f.emphasis[c] === i ? 'on' : ''} aria-pressed={f.emphasis[c] === i} onClick={() => set({ emphasis: { ...f.emphasis, [c]: i } })} data-testid={`emph-${c}-${i}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {c === 'competitive' && f.emphasis.competitive > 0 && (
                  <div style="margin-top:10px">
                    <Field label="Against which competitor?">
                      <Select value={f.competitor} options={competitors} onChange={(v) => set({ competitor: v })} allowEmpty="Any competitor" />
                    </Field>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div class="form-grid">
            <Field label="Meeting length (minutes)" hint={`About ${d.minutesPerSlide} minutes a slide: ${rec.budget} slides plus title and closing.`}>
              <NumberInput value={f.minutes} onChange={(v) => set({ minutes: Math.max(3, Math.round(v ?? 15)) })} />
            </Field>
            <Field label="Focus words (comma separated)" hint="Topics the customer cares about, for example ransomware, SOC consolidation.">
              <TextInput value={f.keywords} onChange={(v) => set({ keywords: v })} />
            </Field>
          </div>
          <div class="callout small">
            Plan: {describeQuota(rec.quota) || 'nothing yet'}.
            {CATEGORIES.filter((c) => f.emphasis[c] > 0 && rec.available[c] === 0).map((c) => ` The library has no ${CATEGORY_LABELS[c].toLowerCase()} slides that fit; import a deck with some.`)}
          </div>
          {nav}
        </div>
      )}

      {step === 2 && (
        <div class="grid2" style="grid-template-columns:3fr 2fr">
          <div class="stack">
            <h3>Recommended for {f.customer || 'this meeting'}</h3>
            <p class="small muted">
              Picked from {new Set([...rec.picks, ...rec.alternates].map((r) => r.deckId)).size} decks. Each slide shows why it was chosen. Tick or untick to change the pitch.
            </p>
            {CATEGORIES.filter((c) => rec.picks.some((r) => r.category === c) || rec.alternates.some((r) => r.category === c)).map((c) => (
              <div key={c}>
                <h3 style="margin-top:6px">{CATEGORY_LABELS[c]}</h3>
                <table class="data">
                  <tbody>
                    {[...rec.picks, ...rec.alternates.slice(0, 50)]
                      .filter((r) => r.category === c)
                      .map((r) => (
                        <RecRow key={refKey(r)} r={r} on={f.chosen.includes(refKey(r))} />
                      ))}
                  </tbody>
                </table>
              </div>
            ))}
            {rec.internalOnly.length > 0 && (
              <details>
                <summary class="small">
                  {rec.internalOnly.length} slides marked internal by the OEM: for your prep, never in the customer deck
                </summary>
                <ul class="small">
                  {rec.internalOnly.map((r) => (
                    <li key={refKey(r)}>
                      {r.title} ({r.deckName}, slide {r.index})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div class="stack">
            <h3>Pitch order</h3>
            <ol class="small" style="margin:0;padding-left:20px" data-testid="pitch-order">
              <li>redesign title slide</li>
              {chosenRecs.map((r, k) => (
                <li key={refKey(r)}>
                  {r.title} <span class="muted">({CATEGORY_LABELS[r.category].toLowerCase()})</span>{' '}
                  <button class="btn small ghost" onClick={() => move(k, -1)} aria-label="Move up" disabled={k === 0}>
                    Up
                  </button>
                  <button class="btn small ghost" onClick={() => move(k, 1)} aria-label="Move down" disabled={k === chosenRecs.length - 1}>
                    Down
                  </button>
                </li>
              ))}
              {legal.map((l) => (
                <li key={refKey(l)} class="muted">
                  {l.title} (OEM notice, always included)
                </li>
              ))}
              <li>{f.heading || 'How redesign helps'}</li>
            </ol>
            <p class="small muted">
              {chosenRecs.length} OEM slides for a {f.minutes}-minute meeting (about {rec.budget}).
            </p>
            {nav}
          </div>
        </div>
      )}

      {step === 3 && (
        <div class="card stack">
          <h3>Finish and download</h3>
          {!hasLogo() && <div class="callout small">No redesign logo is embedded, so the slides carry the source line without a logo. Add assets/brand/redesign_logo_black.svg and rebuild.</div>}
          {usedDecks.some((id) => isStale(d.decks.find((x) => x.id === id)!, d.staleMonths)) && <div class="callout warn small">Some slides come from stale decks. Check the partner portal for current versions before a customer sees them.</div>}
          <div class="form-grid">
            <Field label="Customer">
              <TextInput value={f.customer} onChange={(v) => set({ customer: v })} placeholder="Account name" />
            </Field>
            <Field label="Subtitle">
              <TextInput value={f.subtitle} onChange={(v) => set({ subtitle: v })} />
            </Field>
            <Field label="Prepared by">
              <TextInput value={f.preparedBy} onChange={(v) => set({ preparedBy: v })} placeholder="Rep name" />
            </Field>
            <Field label="Contact line">
              <TextInput value={f.contact} onChange={(v) => set({ contact: v })} placeholder="Email or phone" />
            </Field>
            <Field label="Closing slide heading">
              <TextInput value={f.heading} onChange={(v) => set({ heading: v })} />
            </Field>
            <Field label="Closing slide bullets (one per line)">
              <textarea class="text" rows={4} value={f.bullets} onInput={(e) => set({ bullets: (e.target as HTMLTextAreaElement).value })} />
            </Field>
          </div>
          <p class="small">
            {chosenRecs.length + legal.length + 2} slides from {usedDecks.length} deck{usedDecks.length === 1 ? '' : 's'}: {usedDecks.map((id) => d.decks.find((x) => x.id === id)?.name).join(', ')}. OEM slides keep their content and notices and gain a redesign source line.
          </p>
          <div class="row">
            <button class="btn" onClick={() => setStep(2)}>
              Back
            </button>
            <button class="btn primary" onClick={build} disabled={busy || !chosenRecs.length} data-testid="build-pitch">
              {busy ? 'Building...' : 'Download co-branded PPTX'}
            </button>
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
        <p class="small">Download the current deck from the partner portal as .pptx, then pick it here. The file stays in this browser. The app suggests a label for the deck and each slide; check them afterwards.</p>
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
                toast(`Imported ${deck.slides.length} slides as ${CATEGORY_LABELS[deck.category].toLowerCase()}`);
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

const SLIDE_CATS: SlideCategory[] = [...CATEGORIES, 'structural'];

function DeckDetail({ deck, d }: { deck: DeckMeta; d: PlaysData }) {
  const setDeck = (fn: (x: DeckMeta) => void, label: string, coalesce?: string) => setData((x) => fn(x.decks.find((y) => y.id === deck.id)!), label, coalesce);
  const products = [...new Set([...(d.catalog[deck.oem] ?? []), ...deck.slides.flatMap((s) => s.products)])];
  const comps = [...new Set([...(d.competitors[deck.oem] ?? []), ...deck.slides.flatMap((s) => s.competitors)])];
  const [showTypes, setShowTypes] = useState(false);
  return (
    <div class="stack">
      <div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <Field label="Deck name">
          <TextInput value={deck.name} onChange={(v) => setDeck((x) => (x.name = v), 'Renamed deck', `dn-${deck.id}`)} />
        </Field>
        <Field label="Deck label">
          <div class="row">
            <Select value={deck.category} options={CATEGORIES} labels={CATEGORY_LABELS} onChange={(v) => v && setDeck((x) => (x.category = v as Category), 'Deck label')} />
            <button
              class="btn small"
              title="Give every content slide in this deck the deck's label"
              onClick={() => setDeck((x) => x.slides.forEach((s) => s.category !== 'structural' && (s.category = x.category)), `Labeled all slides ${CATEGORY_LABELS[deck.category]}`)}
            >
              Apply to all slides
            </button>
          </div>
        </Field>
        <Field label="Deck date (YYYY-MM)">
          <TextInput value={deck.contentDate} onChange={(v) => setDeck((x) => (x.contentDate = v), 'Deck date', `dd-${deck.id}`)} />
        </Field>
        <Field label="Source line and logo corner" hint="Pick a corner the OEM's slides leave clear.">
          <Select value={deck.stampCorner} options={STAMP_CORNERS} onChange={(v) => setDeck((x) => (x.stampCorner = (v || 'bottom-right') as StampCorner), 'Stamp corner')} />
        </Field>
      </div>
      <label class="small row">
        <input type="checkbox" checked={showTypes} onChange={(e) => setShowTypes((e.target as HTMLInputElement).checked)} /> Show detailed slide types
      </label>
      <div class="table-wrap" style="max-height:560px">
        <table class="data">
          <thead>
            <tr>
              <th class="num">#</th>
              <th>Slide</th>
              <th>Label</th>
              <th>Products</th>
              <th>Competitors</th>
              {showTypes && <th>Types</th>}
            </tr>
          </thead>
          <tbody>
            {deck.slides.map((s, k) => (
              <tr key={s.index}>
                <td class="num">{s.index}</td>
                <td>
                  <b>{s.title}</b>
                  <div class="small muted">{s.excerpt.slice(0, 160)}</div>
                  <label class="small">
                    <input type="checkbox" checked={s.internalOnly} onChange={(e) => setDeck((x) => (x.slides[k].internalOnly = (e.target as HTMLInputElement).checked), 'Internal only')} /> Internal only (never in a customer deck)
                  </label>
                </td>
                <td style="min-width:200px">
                  <Select value={s.category} options={SLIDE_CATS} labels={CATEGORY_LABELS} onChange={(v) => v && setDeck((x) => (x.slides[k].category = v as SlideCategory), 'Slide label')} />
                </td>
                <td style="min-width:170px">
                  {products.map((p) => (
                    <label key={p} class="small" style="display:block">
                      <input type="checkbox" checked={s.products.includes(p)} onChange={(e) => setDeck((x) => (x.slides[k].products = (e.target as HTMLInputElement).checked ? [...x.slides[k].products, p] : x.slides[k].products.filter((y) => y !== p)), 'Edited slide products')} /> {p}
                    </label>
                  ))}
                </td>
                <td style="min-width:150px">
                  {s.category === 'competitive' || s.competitors.length ? (
                    comps.map((p) => (
                      <label key={p} class="small" style="display:block">
                        <input type="checkbox" checked={s.competitors.includes(p)} onChange={(e) => setDeck((x) => (x.slides[k].competitors = (e.target as HTMLInputElement).checked ? [...x.slides[k].competitors, p] : x.slides[k].competitors.filter((y) => y !== p)), 'Edited slide competitors')} /> {p}
                      </label>
                    ))
                  ) : (
                    <span class="small muted">n/a</span>
                  )}
                </td>
                {showTypes && (
                  <td style="min-width:140px">
                    {SLIDE_TYPES.map((t) => (
                      <label key={t} class="small" style="display:block">
                        <input type="checkbox" checked={s.types.includes(t)} onChange={(e) => setDeck((x) => (x.slides[k].types = ((e.target as HTMLInputElement).checked ? [...x.slides[k].types, t] : x.slides[k].types.filter((y) => y !== t)) as SlideType[]), 'Edited slide type')} /> {t}
                      </label>
                    ))}
                  </td>
                )}
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
  const count = (x: DeckMeta, c: SlideCategory) => x.slides.filter((s) => s.category === c).length;

  const exportLibrary = async () => {
    const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify({ kind: 'cto-workbench-slide-library', version: PLAYS_VERSION, decks: d.decks }, null, 1)) };
    for (const x of d.decks) {
      const b = await getBlob(blobKey(x.id));
      if (b) files[`decks/${x.id}.pptx`] = b;
    }
    downloadBlob(new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `slide-library-${thisMonth()}.zip`);
  };
  const importLibrary = async () => {
    const file = await pickFile('.zip');
    if (!file) return;
    try {
      const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const man = JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array()));
      if (man.kind !== 'cto-workbench-slide-library') throw new Error('Not a slide library file');
      const decks: DeckMeta[] = migratePlays(man.version ?? 1, { decks: man.decks }).decks;
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
    const PAN = 'Palo Alto Networks';
    const BRC = 'Broadcom/VMware';
    const month = thisMonth();
    const samples: { oem: string; name: string; bytes: Uint8Array }[] = [
      { oem: PAN, name: 'Sample Cortex XDR overview (synthetic)', bytes: makeSampleDeck({ partner: PAN, product: 'Cortex XDR', otherProduct: 'Prisma Access' }) },
      { oem: PAN, name: 'Sample Cortex XDR technical deep dive (synthetic)', bytes: makeTechnicalDeck({ partner: PAN, product: 'Cortex XDR' }) },
      { oem: PAN, name: 'Sample Cortex XDR competitive battlecard (synthetic)', bytes: makeCompetitiveDeck({ partner: PAN, product: 'Cortex XDR', competitors: ['CrowdStrike', 'SentinelOne'] }) },
      { oem: BRC, name: 'Sample VMware Cloud Foundation overview (synthetic)', bytes: makeSampleDeck({ partner: BRC, product: 'VMware Cloud Foundation', otherProduct: 'VMware Avi Load Balancer' }) },
      { oem: BRC, name: 'Sample VMware Cloud Foundation battlecard (synthetic)', bytes: makeCompetitiveDeck({ partner: BRC, product: 'VMware Cloud Foundation', competitors: ['Nutanix', 'Microsoft Hyper-V'] }) },
    ];
    const made: DeckMeta[] = [];
    for (const s of samples) made.push(await importDeckBytes(s.bytes, `${s.name}.pptx`, s.oem, month, d));
    setData((x) => x.decks.push(...made), 'Loaded sample decks');
    toast(`Loaded ${made.length} synthetic sample decks`);
  };

  return (
    <div class="stack">
      <div class="callout small">
        Every deck and slide carries a label: {CATEGORIES.map((c) => CATEGORY_LABELS[c]).join(', ')}. The pitch builder uses the labels to recommend slides. Pitches are co-branded: redesign title and closing slides wrap the OEM's slides, which keep their content and notices. Use only decks the partner program lets you share; slides marked internal never go into a customer deck. Deck files stay in this browser; share them with a slide library file.
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
              <th>Label</th>
              <th>Date</th>
              <th class="num">Messaging</th>
              <th class="num">Technical</th>
              <th class="num">Competitive</th>
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
                  <td>
                    <CategoryBadge c={x.category} />
                  </td>
                  <td>{x.contentDate}</td>
                  <td class="num">{count(x, 'messaging')}</td>
                  <td class="num">{count(x, 'technical')}</td>
                  <td class="num">{count(x, 'competitive')}</td>
                  <td class="small">{[...new Set(x.slides.flatMap((s) => s.products))].join(', ')}</td>
                  <td>
                    {isStale(x, d.staleMonths) ? <span class="badge fail">stale</span> : <span class="badge pass">current</span>}
                    {x.slides.some((s) => s.internalOnly) && (
                      <span class="badge" style="margin-left:4px" title="Some slides are internal only">
                        has internal slides
                      </span>
                    )}
                    {present[x.id] === false && (
                      <span class="badge fail" style="margin-left:4px" title="The file is not in this browser">
                        file missing
                      </span>
                    )}
                  </td>
                  <td class="row">
                    <button class="btn small" onClick={() => setOpen(open === x.id ? null : x.id)} data-testid={`labels-${x.id}`}>
                      {open === x.id ? 'Close' : 'Labels'}
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
        <h3>Meeting types</h3>
        <p class="small muted">A meeting type sets the length and how much of each label to show. Reps start from one and adjust.</p>
        <Field label="Minutes per slide (pacing)">
          <NumberInput value={d.minutesPerSlide} onChange={(v) => setData((x) => (x.minutesPerSlide = Math.max(0.5, v ?? 3)), 'Pacing', 'pace')} />
        </Field>
        {d.plays.map((p) => (
          <div class="card" key={p.id}>
            <div class="form-grid">
              <Field label="Name">
                <TextInput value={p.name} onChange={(v) => setPlay(p.id, (x) => (x.name = v), 'Renamed play', `pn-${p.id}`)} />
              </Field>
              <Field label="Minutes">
                <NumberInput value={p.minutes} onChange={(v) => setPlay(p.id, (x) => (x.minutes = Math.max(3, Math.round(v ?? 15))), 'Play length', `pm-${p.id}`)} />
              </Field>
            </div>
            <div class="stack" style="gap:6px;margin:10px 0">
              {CATEGORIES.map((c) => (
                <div class="row" key={c}>
                  <span class="small" style="width:170px">{CATEGORY_LABELS[c]}</span>
                  <div class="seg" role="group" aria-label={`${p.name}: ${CATEGORY_LABELS[c]}`}>
                    {LEVELS.map((l, i) => (
                      <button key={l} class={p.emphasis[c] === i ? 'on' : ''} onClick={() => setPlay(p.id, (x) => (x.emphasis = { ...x.emphasis, [c]: i }), 'Play mix')}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Field label="Closing heading">
              <TextInput value={p.servicesHeading} onChange={(v) => setPlay(p.id, (x) => (x.servicesHeading = sanitizeText(v)), 'Play heading', `ph-${p.id}`)} />
            </Field>
            <Field label="Closing bullets (one per line)">
              <textarea class="text" rows={3} value={p.servicesBullets.join('\n')} onInput={(e) => setPlay(p.id, (x) => (x.servicesBullets = (e.target as HTMLTextAreaElement).value.split('\n')), 'Play bullets', `pb-${p.id}`)} />
            </Field>
            <div class="row" style="margin-top:8px">
              <button class="btn small ghost" onClick={() => setData((x) => (x.plays = x.plays.filter((y) => y.id !== p.id)), 'Deleted play')}>
                Delete
              </button>
            </div>
          </div>
        ))}
        <div class="row">
          <button class="btn small" onClick={() => setData((x) => x.plays.push({ ...defaultData().plays[0], id: newId('play'), name: 'New meeting type' }), 'Added play')}>
            Add meeting type
          </button>
        </div>
      </div>
      <div class="stack">
        <h3>Products and competitors</h3>
        <p class="small muted">Names the library looks for in slide text, by OEM. One per line. Applies to decks you import from now on; fix existing slides under Labels.</p>
        {oemNames(ws, d).map((o) => (
          <div class="card" key={o}>
            <b>{o}</b>
            <div class="form-grid" style="margin-top:6px">
              <Field label="Products">
                <textarea class="text" rows={4} value={(d.catalog[o] ?? []).join('\n')} onInput={(e) => setData((x) => (x.catalog[o] = (e.target as HTMLTextAreaElement).value.split('\n').map((s) => s.trim()).filter(Boolean)), `Catalog ${o}`, `cat-${o}`)} />
              </Field>
              <Field label="Competitors">
                <textarea class="text" rows={4} value={(d.competitors[o] ?? []).join('\n')} onInput={(e) => setData((x) => (x.competitors[o] = (e.target as HTMLTextAreaElement).value.split('\n').map((s) => s.trim()).filter(Boolean)), `Competitors ${o}`, `comp-${o}`)} />
              </Field>
            </div>
          </div>
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
  migrations: { version: PLAYS_VERSION, migrate: (from, data) => migratePlays(from, data) },
  views: [
    { id: 'builder', title: 'Pitch builder', component: Builder },
    { id: 'library', title: 'Slide library', component: Library },
    { id: 'plays', title: 'Meeting types and catalog', component: Plays },
  ],
};
