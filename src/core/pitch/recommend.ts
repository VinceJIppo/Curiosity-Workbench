// Recommends slides from the whole library for what a rep wants to showcase.
// Pure and deterministic: same library and request, same answer. Every pick carries
// the reasons it was chosen so the rep can judge it.
import { CATEGORIES, CATEGORY_LABELS, type Category, type SlideCategory, type SlideType } from './tags';

export interface LibSlide {
  index: number;
  title: string;
  text: string;
  category: SlideCategory;
  types: SlideType[];
  products: string[];
  competitors: string[];
  internalOnly: boolean;
}

export interface LibDeck {
  id: string;
  oem: string;
  name: string;
  contentDate: string; // YYYY-MM
  category: Category;
  slides: LibSlide[];
}

export interface PitchRequest {
  oem: string;
  products: string[];
  minutes: number;
  minutesPerSlide: number;
  /** 0 = leave out, 1 = light, 2 = some, 3 = heavy. */
  emphasis: Record<Category, number>;
  competitor?: string;
  keywords: string[];
  staleMonths: number;
  now: Date;
  /** OEMs redesign partners with. A competitive slide naming one gets a warning. */
  partnerNames: string[];
}

export interface Rec {
  deckId: string;
  deckName: string;
  index: number;
  title: string;
  category: SlideCategory;
  types: SlideType[];
  score: number;
  reasons: string[];
  warnings: string[];
}

export interface Recommendation {
  budget: number;
  quota: Record<Category, number>;
  /** Available slides per label for the chosen OEM and products. */
  available: Record<Category, number>;
  picks: Rec[];
  alternates: Rec[];
  /** Matching slides the OEM marked internal. For prep only; never in a customer deck. */
  internalOnly: Rec[];
}

export function monthsSince(yyyyMm: string, now: Date): number {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return Infinity;
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function score(deck: LibDeck, s: LibSlide, req: PitchRequest, newestDate: string): Rec | null {
  if (s.category === 'structural') return null;
  const reasons: string[] = [];
  const warnings: string[] = [];
  let v = 0;
  const cat = s.category as Category;
  const w = req.emphasis[cat] ?? 0;
  if (w <= 0 && !s.internalOnly) return null;

  if (req.products.length) {
    const hit = s.products.filter((p) => req.products.includes(p));
    if (hit.length) {
      v += 4;
      reasons.push(`Covers ${hit.join(', ')}`);
    } else if (!s.products.length) {
      v += 1;
      reasons.push(`General ${deck.oem} content`);
    } else return null; // about a product the rep did not pick
  } else v += 1;

  v += w;
  if (cat === 'technical' && s.types.includes('architecture')) {
    v += 1.5;
    reasons.push('Architecture view');
  }
  if (cat === 'messaging' && s.types.some((t) => t === 'proof' || t === 'use case')) {
    v += 0.5;
    reasons.push(s.types.includes('proof') ? 'Proof point' : 'Use case');
  }
  if (cat === 'competitive' && req.competitor) {
    if (s.competitors.includes(req.competitor)) {
      v += 4;
      reasons.push(`About ${req.competitor}`);
    } else if (s.competitors.length) {
      v -= 2;
      reasons.push(`About ${s.competitors.join(', ')}, not ${req.competitor}`);
    }
  }
  for (const kw of req.keywords) {
    const k = kw.toLowerCase();
    if (!k) continue;
    if (s.title.toLowerCase().includes(k)) {
      v += 2;
      reasons.push(`Title matches "${kw}"`);
    } else if (s.text.toLowerCase().includes(k)) {
      v += 1;
      reasons.push(`Mentions "${kw}"`);
    }
  }
  if (deck.category === cat) v += 0.5;
  if (monthsSince(deck.contentDate, req.now) > req.staleMonths) {
    v -= 2;
    warnings.push(`Deck from ${deck.contentDate} is stale`);
  } else if (deck.contentDate === newestDate) {
    v += 0.5;
    reasons.push('From the newest deck');
  }
  const partners = s.competitors.filter((c) => req.partnerNames.some((p) => norm(p) === norm(c) || norm(p).includes(norm(c))));
  if (partners.length) warnings.push(`Names ${partners.join(', ')}, also a redesign partner`);
  return { deckId: deck.id, deckName: deck.name, index: s.index, title: s.title, category: s.category, types: s.types, score: v, reasons, warnings };
}

/** Largest-remainder split of the slide budget by emphasis, capped by what is available. */
function allocate(budget: number, emphasis: Record<Category, number>, available: Record<Category, number>): Record<Category, number> {
  const quota: Record<Category, number> = { messaging: 0, technical: 0, competitive: 0 };
  let left = budget;
  let open = CATEGORIES.filter((c) => (emphasis[c] ?? 0) > 0 && available[c] > 0);
  while (left > 0 && open.length) {
    const total = open.reduce((s, c) => s + emphasis[c], 0);
    const shares = open.map((c) => ({ c, raw: (left * emphasis[c]) / total }));
    let given = 0;
    for (const sh of shares) {
      const n = Math.min(Math.floor(sh.raw), available[sh.c] - quota[sh.c]);
      quota[sh.c] += n;
      given += n;
    }
    const rest = shares.filter((sh) => quota[sh.c] < available[sh.c]).sort((a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)) || emphasis[b.c] - emphasis[a.c]);
    for (const sh of rest) {
      if (given >= left) break;
      quota[sh.c]++;
      given++;
    }
    if (!given) break;
    left -= given;
    open = open.filter((c) => quota[c] < available[c]);
  }
  return quota;
}

export function recommend(decks: LibDeck[], req: PitchRequest): Recommendation {
  const mine = decks.filter((d) => d.oem === req.oem);
  const newest = mine.map((d) => d.contentDate).sort().at(-1) ?? '';
  const scored: Rec[] = [];
  const internal: Rec[] = [];
  for (const d of mine)
    for (const s of d.slides) {
      const r = score(d, s, req, newest);
      if (!r) continue;
      if (s.internalOnly) {
        r.warnings.unshift('Marked internal by the OEM: for your prep, not the customer deck');
        internal.push(r);
      } else scored.push(r);
    }
  // The same slide often appears in several decks: keep the best scored copy.
  const byTitle = new Map<string, Rec>();
  const order = (a: Rec, b: Rec) => b.score - a.score || a.deckName.localeCompare(b.deckName) || a.index - b.index;
  for (const r of [...scored].sort(order)) {
    const k = norm(r.title);
    if (!byTitle.has(k)) byTitle.set(k, r);
  }
  const unique = [...byTitle.values()].sort(order);
  const available: Record<Category, number> = { messaging: 0, technical: 0, competitive: 0 };
  for (const r of unique) available[r.category as Category]++;
  const budget = Math.max(1, Math.round(req.minutes / Math.max(0.5, req.minutesPerSlide)));
  const quota = allocate(budget, req.emphasis, available);
  const picks: Rec[] = [];
  const alternates: Rec[] = [];
  const taken: Record<Category, number> = { messaging: 0, technical: 0, competitive: 0 };
  for (const r of unique) {
    const c = r.category as Category;
    if (taken[c] < quota[c]) {
      taken[c]++;
      picks.push(r);
    } else alternates.push(r);
  }
  // Story order: why it matters, how it works, why it beats the alternative.
  // Inside a label: the message, then use cases, then proof; architecture leads technical.
  const rank = (c: SlideCategory) => (c === 'messaging' ? 0 : c === 'technical' ? 1 : 2);
  const typeRank = (r: Rec) => {
    const t = r.types;
    if (t.includes('messaging') || t.includes('architecture') || t.includes('competitive')) return 0;
    if (t.includes('use case')) return 1;
    if (t.includes('proof')) return 2;
    return 1;
  };
  picks.sort((a, b) => rank(a.category) - rank(b.category) || typeRank(a) - typeRank(b) || b.score - a.score);
  return { budget, quota, available, picks, alternates, internalOnly: internal.sort(order) };
}

export function describeQuota(q: Record<Category, number>): string {
  return CATEGORIES.filter((c) => q[c] > 0)
    .map((c) => `${q[c]} ${CATEGORY_LABELS[c].toLowerCase()}`)
    .join(', ');
}
