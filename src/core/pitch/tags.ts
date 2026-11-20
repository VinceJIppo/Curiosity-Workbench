// Slide tagging: suggests a slide type and a content label from its text, finds
// product and competitor names, and spots slides marked for internal use.
// Suggestions only; people correct them in the slide library.

export const SLIDE_TYPES = ['title', 'agenda', 'messaging', 'architecture', 'use case', 'proof', 'roadmap', 'pricing', 'competitive', 'legal', 'other'] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];

/** The three content labels reps choose from. Covers, agendas and legal notices are structural. */
export const CATEGORIES = ['messaging', 'technical', 'competitive'] as const;
export type Category = (typeof CATEGORIES)[number];
export type SlideCategory = Category | 'structural';
export const CATEGORY_LABELS: Record<SlideCategory, string> = {
  messaging: 'General messaging',
  technical: 'Technical product info',
  competitive: 'Competitive info',
  structural: 'Cover, agenda or legal',
};

const RULES: { type: SlideType; re: RegExp; titleOnly?: boolean }[] = [
  { type: 'legal', re: /forward[- ]looking|safe harbor|disclaimer|\btrademarks?\b|all rights reserved|©|copyright|confidential(ity)? notice|not a commitment/i },
  { type: 'agenda', re: /^\s*(agenda|today'?s? (discussion|topics)|contents)\b/i, titleOnly: true },
  { type: 'competitive', re: /\bvs\.?\s|\bversus\b|compared (to|with)|competiti|battle ?card|displace|why not\b|head[- ]to[- ]head|switch(ing)? from|migrat(e|ing) from|objection handling|landmines?/i },
  { type: 'architecture', re: /architecture|reference design|how it works|components?|integrat(es|ion|ions)|data flow|topology|deployment model|platform overview/i },
  { type: 'use case', re: /use cases?|scenario|customer (story|example)|in practice/i },
  { type: 'proof', re: /case study|results|roi\b|\btei\b|analyst|gartner|forrester|mitre|award|customers? (say|saw|achieved)/i },
  { type: 'roadmap', re: /roadmap|coming soon|what'?s next|future release/i },
  { type: 'pricing', re: /pricing|licens(e|ing)|subscription tiers|bundles?/i },
  { type: 'messaging', re: /why |value|benefits?|outcomes?|differentiat|challenges?|problem|key capabilities|overview/i },
];

const TECHNICAL_WORDS = /\bapi\b|sizing|requirements|specifications?|specs\b|deploy(ment)?|install|configur|throughput|latency|agent\b|sensor|telemetry|data sources?|integrations?|high availability|\bha\b|scal(e|ing|ability)|management plane|control plane/i;

export function suggestTypes(title: string, text: string, index: number): SlideType[] {
  const out: SlideType[] = [];
  for (const r of RULES) {
    const hay = r.titleOnly ? title : `${title}\n${text}`;
    if (r.re.test(hay)) out.push(r.type);
  }
  if (out.includes('legal')) return ['legal'];
  // The first slide of a partner deck is its cover; an agenda lists topics without covering them.
  if (index === 1) return ['title'];
  if (out.includes('agenda')) return ['agenda'];
  return out.length ? out.slice(0, 2) : ['other'];
}

/** Content label from slide types and text. `deckDefault` decides slides with no strong signal. */
export function suggestCategory(types: SlideType[], title: string, text: string, deckDefault?: Category): SlideCategory {
  if (types.some((t) => t === 'title' || t === 'agenda' || t === 'legal')) return 'structural';
  if (types.includes('competitive')) return 'competitive';
  if (types.some((t) => t === 'architecture' || t === 'roadmap' || t === 'pricing') || TECHNICAL_WORDS.test(`${title}\n${text}`)) return 'technical';
  if (types.some((t) => t === 'messaging' || t === 'use case' || t === 'proof')) return 'messaging';
  return deckDefault ?? 'messaging';
}

/** Deck label from its name, then from the most common slide label. */
export function suggestDeckCategory(name: string, slideCategories: SlideCategory[]): Category {
  if (/battle ?card|competiti|\bvs\b|versus|displace/i.test(name)) return 'competitive';
  if (/technical|architecture|deep ?dive|\btdm\b|design guide|reference/i.test(name)) return 'technical';
  const counts: Record<Category, number> = { messaging: 0, technical: 0, competitive: 0 };
  for (const c of slideCategories) if (c !== 'structural') counts[c]++;
  return (CATEGORIES as readonly Category[]).reduce((best, c) => (counts[c] > counts[best] ? c : best), 'messaging' as Category);
}

/** Slides the OEM marks as not for customers. They never go into a customer deck. */
export function isInternalOnly(title: string, text: string): boolean {
  return /internal (use )?only|partner (confidential|only|use only)|not for (customer|external|public)|do not (distribute|share)|for partner eyes|under nda\b|\bnda only\b/i.test(`${title}\n${text}`);
}

function findNames(text: string, catalog: string[]): string[] {
  const hay = text.toLowerCase();
  return [...catalog].sort((a, b) => b.length - a.length).filter((p) => hay.includes(p.toLowerCase()));
}

/** Products mentioned in the slide, from a catalog of names. Longest names win. */
export function detectProducts(text: string, catalog: string[]): string[] {
  return findNames(text, catalog);
}

/** Competitors named in the slide. */
export function detectCompetitors(text: string, catalog: string[]): string[] {
  return findNames(text, catalog);
}

/** Product names by OEM. Editable per workspace in Plays and catalog. */
export const DEFAULT_CATALOG: Record<string, string[]> = {
  'Palo Alto Networks': ['Cortex XDR', 'Cortex XSIAM', 'Cortex XSOAR', 'Cortex Xpanse', 'Prisma Access', 'Prisma Cloud', 'Prisma SD-WAN', 'Strata', 'Next-Generation Firewall', 'Unit 42'],
  'Broadcom/VMware': ['VMware Cloud Foundation', 'VMware vSphere Foundation', 'VMware Protection and Recovery', 'VMware NSX', 'VMware vDefend', 'VMware Avi Load Balancer', 'VMware Tanzu', 'VMware vSAN'],
};

/** Competitor names by OEM. Editable per workspace in Plays and catalog. */
export const DEFAULT_COMPETITORS: Record<string, string[]> = {
  'Palo Alto Networks': ['CrowdStrike', 'SentinelOne', 'Microsoft Defender', 'Fortinet', 'Cisco', 'Zscaler', 'Check Point', 'Trellix'],
  'Broadcom/VMware': ['Nutanix', 'Microsoft Hyper-V', 'Azure Stack HCI', 'Red Hat OpenShift', 'Proxmox', 'Zerto', 'Veeam'],
};
