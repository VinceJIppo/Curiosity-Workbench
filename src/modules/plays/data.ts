// Records for the sales plays module, stored in workspace.modules.plays.
// Deck files themselves live in browser storage (putBlob), keyed by deck id.
import type { Workspace } from '../../core/schema/types';
import { DEFAULT_CATALOG, type SlideType } from '../../core/pitch/tags';
import type { StampCorner } from '../../core/pitch/pptx';

export interface SlideMeta {
  index: number;
  title: string;
  excerpt: string;
  types: SlideType[];
  products: string[];
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
  slides: SlideMeta[];
  stampCorner: StampCorner;
}

export interface Play {
  id: string;
  name: string;
  /** Slide types to pull, in the order they appear in the pitch. */
  types: SlideType[];
  maxSlides: number;
  servicesHeading: string;
  servicesBullets: string[];
}

export interface PlaysData {
  decks: DeckMeta[];
  catalog: Record<string, string[]>;
  plays: Play[];
  /** Decks older than this many months show as stale. */
  staleMonths: number;
}

const SERVICES = ['Assessment and design', 'Deployment and migration', 'Managed services and ongoing support'];

export function defaultPlays(): Play[] {
  return [
    { id: 'play-intro', name: '15-minute intro call', types: ['messaging', 'architecture'], maxSlides: 4, servicesHeading: 'How redesign helps', servicesBullets: SERVICES },
    { id: 'play-deep', name: 'Technical deep dive', types: ['architecture', 'use case', 'proof'], maxSlides: 8, servicesHeading: 'How redesign helps', servicesBullets: SERVICES },
    { id: 'play-exec', name: 'Executive briefing', types: ['messaging', 'proof', 'use case'], maxSlides: 5, servicesHeading: 'How redesign helps', servicesBullets: SERVICES },
  ];
}

export function defaultData(): PlaysData {
  return { decks: [], catalog: structuredClone(DEFAULT_CATALOG), plays: defaultPlays(), staleMonths: 6 };
}

export function getData(ws: Workspace): PlaysData {
  const d = ws.modules.plays as Partial<PlaysData> | undefined;
  const def = defaultData();
  return { ...def, ...(d ?? {}), catalog: { ...def.catalog, ...(d?.catalog ?? {}) } };
}

export function blobKey(deckId: string) {
  return `deck:${deckId}`;
}

export function monthsSince(yyyyMm: string, now = new Date()): number {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return Infinity;
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
}

export function isStale(d: DeckMeta, staleMonths: number, now = new Date()): boolean {
  return monthsSince(d.contentDate, now) > staleMonths;
}

/** Pick slides for a play: matching types, product mentioned first, legal slides kept separately. */
export function pickSlides(deck: DeckMeta, product: string, play: Play): { chosen: number[]; legal: number[] } {
  const legal = deck.slides.filter((s) => s.types.includes('legal')).map((s) => s.index);
  const pool = deck.slides.filter((s) => !s.types.includes('legal') && s.types.some((t) => play.types.includes(t)));
  const mentions = (s: SlideMeta) => s.products.includes(product);
  const neutral = (s: SlideMeta) => s.products.length === 0;
  const ranked = [...pool.filter(mentions), ...pool.filter((s) => !mentions(s) && neutral(s))].slice(0, play.maxSlides);
  const rank = (s: SlideMeta) => Math.min(...s.types.map((t) => (play.types.indexOf(t) < 0 ? 99 : play.types.indexOf(t))));
  ranked.sort((a, b) => rank(a) - rank(b) || a.index - b.index);
  return { chosen: ranked.map((s) => s.index), legal };
}
