// Slide tagging: suggests a slide type from its text and finds product names.
// Suggestions only; people correct them in the slide library.

export const SLIDE_TYPES = ['title', 'agenda', 'messaging', 'architecture', 'use case', 'proof', 'roadmap', 'pricing', 'legal', 'other'] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];

const RULES: { type: SlideType; re: RegExp; titleOnly?: boolean }[] = [
  { type: 'legal', re: /forward[- ]looking|safe harbor|disclaimer|\btrademarks?\b|all rights reserved|©|copyright|confidential(ity)? notice|not a commitment/i },
  { type: 'agenda', re: /^\s*(agenda|today'?s? (discussion|topics)|contents)\b/i, titleOnly: true },
  { type: 'architecture', re: /architecture|reference design|how it works|components?|integrat(es|ion|ions)|data flow|topology|deployment model|platform overview/i },
  { type: 'use case', re: /use cases?|scenario|customer (story|example)|in practice/i },
  { type: 'proof', re: /case study|results|roi\b|\btei\b|analyst|gartner|forrester|mitre|award|customers? (say|saw|achieved)/i },
  { type: 'roadmap', re: /roadmap|coming soon|what'?s next|future release/i },
  { type: 'pricing', re: /pricing|licens(e|ing)|subscription tiers|bundles?/i },
  { type: 'messaging', re: /why |value|benefits?|outcomes?|differentiat|challenges?|problem|key capabilities|overview/i },
];

export function suggestTypes(title: string, text: string, index: number): SlideType[] {
  const out: SlideType[] = [];
  for (const r of RULES) {
    const hay = r.titleOnly ? title : `${title}\n${text}`;
    if (r.re.test(hay)) out.push(r.type);
  }
  if (!out.length && index === 1) out.push('title');
  if (out.includes('legal')) return ['legal'];
  return out.length ? out.slice(0, 2) : ['other'];
}

/** Products mentioned in the slide, from a catalog of names. Longest names win. */
export function detectProducts(text: string, catalog: string[]): string[] {
  const hay = text.toLowerCase();
  return [...catalog].sort((a, b) => b.length - a.length).filter((p) => hay.includes(p.toLowerCase()));
}

/** Product names by OEM. Editable per workspace in the slide library. */
export const DEFAULT_CATALOG: Record<string, string[]> = {
  'Palo Alto Networks': ['Cortex XDR', 'Cortex XSIAM', 'Cortex XSOAR', 'Cortex Xpanse', 'Prisma Access', 'Prisma Cloud', 'Prisma SD-WAN', 'Strata', 'Next-Generation Firewall', 'Unit 42'],
  'Broadcom/VMware': ['VMware Cloud Foundation', 'VMware vSphere Foundation', 'VMware Protection and Recovery', 'VMware NSX', 'VMware vDefend', 'VMware Avi Load Balancer', 'VMware Tanzu', 'VMware vSAN'],
};
