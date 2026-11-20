import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { parseCsv, parseXlsx, parseJsonRows } from '../src/core/import/parse';
import { autoMap, headerSignature, mapRows, applyImport, suggestEntityType, parseNumber } from '../src/core/import/mapping';
import { getEntitySchema } from '../src/core/schema/registry';
import { sampleWorkspace } from '../src/samples/seed';
import { dataQuality } from '../src/core/import/quality';

const REGISTER = `ID,Assumption,Value,Unit,Status,Source,As of,Used in,Notes
R01,Core sellers,70,people,Conflict,Proposal,2026-10,Coverage,"Roster says 53"
R02,Specialists,5,people,measured,Roster,2026-10,Coverage,
R03,Wage share,70%,ratio,Stated,BLS,2026-10,Loaded cost,
R04,Thing,abc,people,Guess,x,2026-10,,
R02,Dup,1,people,Open,x,,,
`;

describe('parsing', () => {
  it('CSV with quotes and BOM', () => {
    const t = parseCsv('﻿' + REGISTER);
    expect(t.headers[0]).toBe('ID');
    expect(t.rows).toHaveLength(5);
    expect(t.rows[0].Notes).toBe('Roster says 53');
  });
  it('XLSX with a chosen sheet', () => {
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.aoa_to_sheet([['Cover page']]), 'Cover');
    utils.book_append_sheet(wb, utils.aoa_to_sheet([['Title row'], [], ['Name', 'Role family', 'Base'], ['A', 'Specialist', 100], ['B', 'Core Seller', 90]]), 'Roster');
    const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const book = parseXlsx(buf);
    expect(book.sheets).toEqual(['Cover', 'Roster']);
    const t = book.table('Roster');
    expect(t.headers).toEqual(['Name', 'Role family', 'Base']);
    expect(t.rows).toHaveLength(2);
  });
  it('JSON rows', () => {
    expect(parseJsonRows('[{"a":1},{"b":2}]').headers).toEqual(['a', 'b']);
    expect(parseJsonRows('{"rows":[{"a":1}]}').rows).toHaveLength(1);
  });
  it('numbers', () => {
    expect(parseNumber('$1,234')).toBe(1234);
    expect(parseNumber('(500)')).toBe(-500);
    expect(parseNumber('25%')).toBe(0.25);
    expect(parseNumber('72k')).toBe(72000);
    expect(parseNumber('n/a')).toBeNull();
  });
});

describe('mapping and validation', () => {
  const t = parseCsv(REGISTER);
  const schema = getEntitySchema('assumption')!;
  it('auto-maps by alias and suggests the entity type', () => {
    const { columnMap } = autoMap(schema, t.headers);
    expect(columnMap).toMatchObject({ id: 'ID', label: 'Assumption', value: 'Value', status: 'Status', asOf: 'As of', usedIn: 'Used in' });
    expect(suggestEntityType(t.headers)).toBe('assumption');
  });
  it('validates types, enums and duplicates', () => {
    const { columnMap } = autoMap(schema, t.headers);
    const { records, issues } = mapRows(schema, t.rows, columnMap);
    expect(records[1].status).toBe('Measured'); // synonym, case-insensitive
    expect(records[2].value).toBe(0.7);
    expect(issues.some((i) => i.row === 4 && i.kind === 'type')).toBe(true);
    expect(issues.some((i) => i.row === 4 && i.kind === 'enum')).toBe(true);
    expect(issues.some((i) => i.row === 5 && i.kind === 'duplicate')).toBe(true);
  });
  it('saves a template keyed by header signature and reuses it', () => {
    const ws = sampleWorkspace();
    const custom = { id: 'ID', label: 'Notes', value: 'Value' }; // deliberately odd
    const out = applyImport(ws, { entityType: 'assumption', datasetName: 'Register', fileName: 'r.csv', headers: t.headers, rawRows: t.rows, columnMap: custom, mode: 'upsert', saveTemplateName: 'My register', skipErrorRows: true, now: '2026-11-20T00:00:00Z' });
    expect(out.ws.mappingTemplates).toHaveLength(1);
    expect(out.ws.mappingTemplates[0].headerSignature).toBe(headerSignature([...t.headers].reverse()));
    const again = autoMap(schema, t.headers, out.ws.mappingTemplates);
    expect(again.template?.name).toBe('My register');
    expect(again.columnMap).toEqual(custom);
    expect(out.ws.datasets[0].rawRows).toHaveLength(5);
  });
  it('imports people and keeps raw rows', () => {
    const ws = sampleWorkspace();
    const csv = parseCsv('Employee Name,Job Title,Role Family,Base Salary,Territory\nPat,AE,Core Seller,"$100,000",t1\nLee,SA,Architect,150000,t9\n');
    const s = getEntitySchema('person')!;
    const { columnMap } = autoMap(s, csv.headers);
    expect(columnMap).toMatchObject({ name: 'Employee Name', title: 'Job Title', roleFamily: 'Role Family', base: 'Base Salary', territory: 'Territory' });
    const out = applyImport(ws, { entityType: 'person', datasetName: 'Roster', fileName: 'roster.csv', headers: csv.headers, rawRows: csv.rows, columnMap, mode: 'replace' });
    expect(out.ws.entities.people).toHaveLength(2);
    expect(out.ws.entities.people[0].base).toBe(100000);
    expect(out.ws.entities.people[1].roleFamily).toBe('Other');
    const q = dataQuality(out.ws);
    expect(q.items.some((i) => i.message.includes('territory'))).toBe(true);
    expect(q.items.some((i) => i.message.includes('Register says 70 sellers; roster has 1'))).toBe(true);
  });
});
