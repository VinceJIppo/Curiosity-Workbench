import { describe, expect, it } from 'vitest';
import { routeBrief, prescreen, buildMasking, mask, unmask, researchPacket, importResearchPack, briefReport, briefMarkdown, ResearchError, type Brief, type Startup } from '../src/core/research/research';

const catalog: Startup[] = [
  { id: 'st-a', name: 'Sample SecureCo', description: 'Identity threat detection for hybrid workforces.', domains: ['cybersecurity'], categories: ['Security'] },
  { id: 'st-b', name: 'Sample FlowBot', description: 'Workflow automation for IT service tickets and approvals.', domains: ['automation'], categories: ['DevOps'] },
  { id: 'st-c', name: 'Sample ModelOps', description: 'Platform to govern and monitor generative AI models.', domains: ['ai'], categories: ['AI/ML'] },
  { id: 'st-d', name: 'Sample StackShift', description: 'Moves virtual machines to Kubernetes with no downtime.', domains: ['virtualization'], categories: ['Infrastructure'] },
  { id: 'st-e', name: 'Sample VoiceCare', description: 'AI agents for the contact center that cut handle time.', domains: ['cx', 'ai'], categories: ['AI/ML'] },
];
const brief: Brief = {
  id: 'b1',
  customer: 'Acme Health',
  contact: 'Pat Jones',
  receivedOn: '2026-11-21',
  anonymize: true,
  sensitiveTerms: ['Project Lighthouse'],
  initiatives: [
    { id: 'i1', title: 'Stop identity-based attacks', detail: 'Ransomware started from stolen identity credentials twice this year at Acme Health.' },
    { id: 'i2', title: 'Get off VMware licensing', detail: 'Project Lighthouse: migrate virtualization to containers and cut cost.' },
    { id: 'i3', title: 'Faster patient support', detail: 'Contact center wait times hurt satisfaction; we want AI agents to help customers.' },
    { id: 'i4', title: 'Board asked for an innovation plan', detail: 'No clear owner yet.' },
  ],
};

describe('routing', () => {
  const r = routeBrief(brief);
  const doms = (id: string) => r.filter((x) => x.initiativeId === id).map((x) => x.domain).sort();
  it('sends each initiative to the right researchers', () => {
    expect(doms('i1')).toEqual(['cybersecurity']);
    expect(doms('i2')).toContain('virtualization');
    expect(doms('i3')).toEqual(expect.arrayContaining(['cx', 'ai']));
  });
  it('an initiative with no signal goes to every researcher', () => {
    expect(doms('i4')).toHaveLength(5);
  });
  it('manual choices win', () => {
    const m = routeBrief({ ...brief, initiatives: [{ ...brief.initiatives[0], domains: ['ai'] }] });
    expect(m.map((x) => x.domain)).toEqual(['ai']);
  });
});

describe('pre-screen', () => {
  it('ranks startups in the domain that share words with the initiative', () => {
    expect(prescreen(brief.initiatives[0], 'cybersecurity', catalog)[0].startup.id).toBe('st-a');
    expect(prescreen(brief.initiatives[2], 'cx', catalog)[0].startup.id).toBe('st-e');
    expect(prescreen(brief.initiatives[1], 'virtualization', catalog).map((c) => c.startup.id)).toContain('st-d');
  });
});

describe('anonymization and the packet', () => {
  const m = buildMasking(brief);
  it('masks customer, contact and sensitive terms, and restores them', () => {
    const t = 'Acme Health and Pat Jones run project lighthouse.';
    expect(mask(t, m)).toBe('[CUSTOMER] and [CONTACT] run [TERM1].');
    expect(unmask('[CUSTOMER] should start with [TERM1].', m)).toBe('Acme Health should start with Project Lighthouse.');
  });
  it('the packet never contains masked names, and lists the routed catalog', () => {
    const { text } = researchPacket(brief, { catalog, catalogName: 'Sample catalog' });
    expect(text).not.toMatch(/Acme|Pat Jones|Lighthouse/i);
    expect(text).toContain('[CUSTOMER]');
    expect(text).toContain('## Cybersecurity researcher');
    expect(text).toContain('[st-a] Sample SecureCo');
    expect(text).toContain('"kind": "cto-workbench-research-pack"');
    expect(text).not.toContain('—');
  });
  it('without anonymization the brief goes as written', () => {
    expect(researchPacket({ ...brief, anonymize: false }, { catalog, catalogName: 'x' }).text).toContain('Acme Health');
  });
});

describe('research packs', () => {
  const m = buildMasking(brief);
  let n = 0;
  const pack = {
    kind: 'cto-workbench-research-pack',
    version: 1,
    briefId: 'b1',
    findings: [
      { initiativeId: 'i1', domain: 'cybersecurity', summary: '[CUSTOMER] needs identity threat detection.', startups: [{ startupId: 'st-a', fit: 'high', why: 'Built for [CUSTOMER]-style hybrid staff.', questions: ['Pricing?'], sources: ['catalog'] }, { startupId: 'Made Up Inc', fit: 'high', why: 'x' }], openQuestions: ['Who owns IAM at [CUSTOMER]?'], confidence: 'medium' },
      { initiativeId: 'i3', domain: 'cx', summary: 'Contact center AI.', startups: [{ startupId: 'Sample VoiceCare', fit: 'medium', why: 'Cuts handle time.' }] },
      { initiativeId: 'i9', domain: 'ai', summary: 'x', startups: [] },
    ],
  };
  const r = importResearchPack(pack, brief, catalog, m, () => `f${++n}`, 'Claude', '2026-11-21T00:00:00Z');
  it('maps startups by id or name, restores names and reports the rest', () => {
    expect(r.findings).toHaveLength(2);
    expect(r.findings[0].summary).toBe('Acme Health needs identity threat detection.');
    expect(r.findings[0].openQuestions).toEqual(['Who owns IAM at Acme Health?']);
    expect(r.findings[0].startups.map((s) => s.startupId)).toEqual(['st-a']);
    expect(r.findings[1].startups[0].startupId).toBe('st-e');
    expect(r.findings[0].startups[0].status).toBe('suggested');
    expect(r.problems.join('\n')).toMatch(/"Made Up Inc" is not in the catalog/);
    expect(r.problems.join('\n')).toMatch(/unknown initiative "i9"/);
  });
  it('rejects files that are not research packs', () => {
    expect(() => importResearchPack({ findings: [] }, brief, catalog, m, () => 'x', 'y')).toThrow(ResearchError);
  });
  it('customer output shows only approved startups', () => {
    const f = r.findings.map((x) => ({ ...x, startups: x.startups.map((s) => ({ ...s, status: s.startupId === 'st-a' ? ('approved' as const) : s.status })) }));
    const rep = briefReport(brief, f, catalog);
    expect(rep[0].startups.map((s) => s.startup.name)).toEqual(['Sample SecureCo']);
    expect(rep[2].startups).toEqual([]);
    const md = briefMarkdown(brief, rep, 'Sample catalog');
    expect(md).toContain('# Innovation brief for Acme Health');
    expect(md).toContain('**Sample SecureCo**');
    expect(md).toContain('not yet verified');
    expect(md).not.toContain('—');
  });
});

describe('Dell Technologies Capital catalog', async () => {
  const { dtcCatalog } = await import('../src/catalogs/dtc-portfolio');
  const cat = dtcCatalog();
  it('has the portfolio with sources and maps focus areas to researchers', () => {
    expect(cat).toHaveLength(155);
    expect(new Set(cat.map((s) => s.id)).size).toBe(155);
    expect(cat.every((s) => s.source === 'delltechnologiescapital.com/companies' && !/https?:/.test(s.website ?? '') && s.verified === false)).toBe(true);
    const halcyon = cat.find((s) => s.name === 'Halcyon')!;
    expect(halcyon.domains).toEqual(expect.arrayContaining(['cybersecurity', 'ai']));
    expect(halcyon.description).toMatch(/ransomware/i);
    expect(cat.find((s) => s.name === 'MavenAGI')!.domains).toContain('cx');
    expect(cat.find((s) => s.name === 'Druva')!.domains).toEqual(expect.arrayContaining(['virtualization', 'cybersecurity']));
  });
  it('every active company maps to at least one researcher', () => {
    expect(cat.filter((s) => s.status !== 'exited' && !s.domains.length)).toEqual([]);
  });
  it('the sample brief routes ransomware to cybersecurity and pre-screens real portfolio companies', () => {
    const active = cat.filter((s) => s.status !== 'exited');
    const ini = { id: 'x', title: 'Stop ransomware before it spreads', detail: 'Ransomware started from stolen identities; backups were hit too.' };
    expect(prescreen(ini, 'cybersecurity', active).map((c) => c.startup.name)).toEqual(expect.arrayContaining(['Halcyon', 'Calamu']));
  });
});
