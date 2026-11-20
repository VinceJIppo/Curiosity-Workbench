// /samples holds synthetic files that mirror the exports you will bring. They are
// generated from the seed. Run `npm run samples` after changing the seed.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { sampleWorkspace } from '../src/samples/seed';
import { toCsvText } from './helpers';
import { parseCsv } from '../src/core/import/parse';
import { suggestEntityType, autoMap, mapRows } from '../src/core/import/mapping';
import { getEntitySchema } from '../src/core/schema/registry';

const ws = sampleWorkspace();
const territories = new Map(ws.entities.territories.map((t) => [t.id, t.name]));

const FILES: Record<string, { type: string; headers: string[]; rows: unknown[][] }> = {
  'assumptions-register.csv': {
    type: 'assumption',
    headers: ['ID', 'Label', 'Value', 'Low', 'High', 'Unit', 'Status', 'Source', 'As of', 'Used in', 'Notes', 'Formula'],
    rows: ws.assumptions.map((a) => [a.id, a.label, a.value ?? '', a.low ?? '', a.high ?? '', a.unit, a.status, a.source, a.asOf, a.usedIn, a.notes, a.formula ?? '']),
  },
  'territory-roster.csv': {
    type: 'person',
    headers: ['Employee ID', 'Employee Name', 'Job Title', 'Role Family', 'Territory', 'Team', 'Practices', 'Manager ID', 'Base Salary', 'Variable Target', 'FTE', 'Status'],
    rows: ws.entities.people.map((p) => [p.id, p.name, p.title, p.roleFamily, p.territory ? territories.get(p.territory) : '', p.team ?? '', p.practices.join('; '), p.managerId ?? '', p.base, p.variableTarget, p.fte, p.status]),
  },
  'territories.csv': {
    type: 'territory',
    headers: ['Territory ID', 'Territory Name', 'RVP', 'Regional Directors'],
    rows: ws.entities.territories.map((t) => [t.id, t.name, t.rvp ?? '', t.regionalDirectors.join('; ')]),
  },
  'external-service-quotes.csv': {
    type: 'externalService',
    headers: ['Vendor', 'Service', 'Category', 'Pricing Model', 'Low', 'Base Price', 'High', 'Term Months', 'Source'],
    rows: ws.entities.externalServices.map((s) => [s.vendor, s.name, s.category, s.pricingModel, s.low, s.base, s.high, s.termMonths ?? '', s.source ?? '']),
  },
  'revenue-gp-by-line.csv': {
    type: 'revenueFact',
    headers: ['Quarter', 'Line', 'Revenue', 'Gross Profit', 'Specialist Touched'],
    rows: ws.entities.revenueFacts.map((r) => [r.period, r.line, r.revenue, r.gp, r.specialistTouched ? 'Yes' : 'No']),
  },
  'specialist-effort-review.csv': {
    type: 'effortLog',
    headers: ['specialist', 'account', 'opportunity_type', 'effort_points', 'revenue_6mo', 'gross_profit_6mo'],
    rows: ws.entities.effortLogs.map((e) => [e.person, e.account, e.opportunityType, e.effort, e.revenue6mo, e.gp6mo]),
  },
};

const update = process.env.UPDATE_SAMPLES === '1';

describe('sample files', () => {
  for (const [name, f] of Object.entries(FILES)) {
    it(`${name} is current and auto-maps to ${f.type}`, () => {
      const text = toCsvText(f.headers, f.rows);
      const path = `samples/${name}`;
      if (update) {
        mkdirSync('samples', { recursive: true });
        writeFileSync(path, text);
      }
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, 'utf8')).toBe(text);
      const t = parseCsv(text);
      expect(suggestEntityType(t.headers)).toBe(f.type);
      const schema = getEntitySchema(f.type)!;
      const { columnMap } = autoMap(schema, t.headers);
      const { issues } = mapRows(schema, t.rows, columnMap);
      expect(issues.filter((i) => i.kind !== 'duplicate')).toEqual([]);
    });
  }
  it('sample workspace file is current', () => {
    const text = JSON.stringify(sampleWorkspace(), null, 1) + '\n';
    if (update) writeFileSync('samples/sample-workspace.json', text);
    expect(readFileSync('samples/sample-workspace.json', 'utf8')).toBe(text);
  });
});
