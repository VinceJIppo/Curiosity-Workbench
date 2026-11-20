// Records for the sales plays module, stored in workspace.modules.plays.
// Deck files themselves live in browser storage (putBlob), keyed by deck id.
import type { Workspace } from '../../core/schema/types';
import type { DeckInfo, StampCorner } from '../../core/pitch/pptx';
import {
  DEFAULT_CATALOG,
  DEFAULT_COMPETITORS,
  detectCompetitors,
  detectProducts,
  isInternalOnly,
  suggestCategory,
  suggestDeckCategory,
  suggestTypes,
  type Category,
  type SlideCategory,
  type SlideType,
} from '../../core/pitch/tags';
import type { LibDeck } from '../../core/pitch/recommend';

export const PLAYS_VERSION = 2;

export interface SlideMeta {
  index: number;
  title: string;
  excerpt: string;
  /** Slide text (trimmed) used for keyword matching. */
  text: string;
  types: SlideType[];
  category: SlideCategory;
  products: string[];
  competitors: string[];
  /** Marked by the OEM as not for customers. Never goes into a customer deck. */
  internalOnly: boolean;
}

export interface DeckMeta {
  id: string;
  oem: string;
  name: string;
  fileName: string;
  /** YYYY-MM the OEM published or last updated the deck. Drives the stale flag. */
  contentDate: string;
  importedAt: string;
  size: number;
  category: Category;
  slides: SlideMeta[];
  stampCorner: StampCorner;
}

export interface Play {
  id: string;
  name: string;
  minutes: number;
  /** 0 = leave out, 1 = light, 2 = some, 3 = heavy. */
  emphasis: Record<Category, number>;
  servicesHeading: string;
  servicesBullets: string[];
}

export interface PlaysData {
  decks: DeckMeta[];
  catalog: Record<string, string[]>;
  competitors: Record<string, string[]>;
  plays: Play[];
  /** Decks older than this many months show as stale. */
  staleMonths: number;
  /** Pacing for turning meeting minutes into a slide count. */
  minutesPerSlide: number;
}

const SERVICES = ['Assessment and design', 'Deployment and migration', 'Managed services and ongoing support'];
const HEAD = 'How redesign helps';

export function defaultPlays(): Play[] {
  return [
    { id: 'play-intro', name: '15-minute intro call', minutes: 15, emphasis: { messaging: 3, technical: 1, competitive: 0 }, servicesHeading: HEAD, servicesBullets: SERVICES },
    { id: 'play-deep', name: 'Technical deep dive', minutes: 45, emphasis: { messaging: 1, technical: 3, competitive: 0 }, servicesHeading: HEAD, servicesBullets: SERVICES },
    { id: 'play-exec', name: 'Executive briefing', minutes: 20, emphasis: { messaging: 3, technical: 0, competitive: 1 }, servicesHeading: HEAD, servicesBullets: SERVICES },
    { id: 'play-displace', name: 'Competitive displacement', minutes: 30, emphasis: { messaging: 1, technical: 2, competitive: 3 }, servicesHeading: HEAD, servicesBullets: SERVICES },
  ];
}

export function defaultData(): PlaysData {
  return { decks: [], catalog: structuredClone(DEFAULT_CATALOG), competitors: structuredClone(DEFAULT_COMPETITORS), plays: defaultPlays(), staleMonths: 6, minutesPerSlide: 3 };
}

export function getData(ws: Workspace): PlaysData {
  const d = ws.modules.plays as Partial<PlaysData> | undefined;
  const def = defaultData();
  return { ...def, ...(d ?? {}), catalog: { ...def.catalog, ...(d?.catalog ?? {}) }, competitors: { ...def.competitors, ...(d?.competitors ?? {}) } };
}

export function blobKey(deckId: string) {
  return `deck:${deckId}`;
}

export function monthsSince(yyyyMm: string, now = new Date()): number {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return Infinity;
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
}

export function isStale(d: Pick<DeckMeta, 'contentDate'>, staleMonths: number, now = new Date()): boolean {
  return monthsSince(d.contentDate, now) > staleMonths;
}

/** Suggested labels for every slide in a deck. */
export function analyzeDeck(info: Pick<DeckInfo, 'slides'>, name: string, products: string[], competitors: string[]): { category: Category; slides: SlideMeta[] } {
  const raw = info.slides.map((s) => {
    const body = (s.text.startsWith(s.title) ? s.text.slice(s.title.length) : s.text).replace(/\s+/g, ' ').trim();
    const all = `${s.title}\n${s.text}`;
    const types = suggestTypes(s.title, s.text, s.index);
    return {
      index: s.index,
      title: s.title,
      excerpt: body.slice(0, 280),
      text: body.slice(0, 2000),
      types,
      products: detectProducts(all, products),
      competitors: detectCompetitors(all, competitors),
      internalOnly: isInternalOnly(s.title, s.text),
    };
  });
  const first = raw.map((s) => suggestCategory(s.types, s.title, s.text));
  const category = suggestDeckCategory(name, first);
  const slides: SlideMeta[] = raw.map((s) => ({ ...s, category: suggestCategory(s.types, s.title, s.text, category) }));
  return { category, slides };
}

export function toLibDecks(d: PlaysData): LibDeck[] {
  return d.decks.map((x) => ({ id: x.id, oem: x.oem, name: x.name, contentDate: x.contentDate, category: x.category, slides: x.slides }));
}

/** Upgrade module records from older versions. */
export function migratePlays(from: number, data: unknown): PlaysData {
  const def = defaultData();
  if (!data || typeof data !== 'object') return def;
  const d = { ...def, ...(data as Partial<PlaysData>) } as PlaysData & { plays: any[]; decks: any[] };
  if (from < 2) {
    // v1 plays picked slide types; v2 plays weight the three content labels.
    d.plays = (d.plays ?? []).map((p: any) => {
      if (p.emphasis) return p;
      const t: string[] = p.types ?? [];
      return {
        id: p.id,
        name: p.name,
        minutes: Math.max(5, (p.maxSlides ?? 4) * def.minutesPerSlide),
        emphasis: { messaging: t.some((x) => ['messaging', 'use case', 'proof'].includes(x)) ? 3 : 0, technical: t.some((x) => ['architecture', 'roadmap', 'pricing'].includes(x)) ? 2 : 0, competitive: 0 },
        servicesHeading: p.servicesHeading ?? HEAD,
        servicesBullets: p.servicesBullets ?? SERVICES,
      };
    });
    d.decks = (d.decks ?? []).map((x: any) => {
      const comp = d.competitors[x.oem] ?? [];
      const slides = (x.slides ?? []).map((s: any) => {
        const text = s.text ?? s.excerpt ?? '';
        const types = (s.types ?? []) as SlideType[];
        return { ...s, text, types, competitors: s.competitors ?? detectCompetitors(`${s.title}\n${text}`, comp), internalOnly: s.internalOnly ?? isInternalOnly(s.title, text), category: s.category ?? suggestCategory(types, s.title, text) };
      });
      return { ...x, slides, category: x.category ?? suggestDeckCategory(x.name ?? '', slides.map((s: SlideMeta) => s.category)) };
    });
  }
  return d;
}
