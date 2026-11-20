import { describe, expect, it } from 'vitest';
import { sampleWorkspace } from '../src/samples/seed';
import { migrateWorkspace, MigrationError } from '../src/core/schema/migrate';
import { diffContent } from '../src/core/schema/diff';
import { SCHEMA_VERSION } from '../src/core/schema/types';

describe('workspace documents', () => {
  it('round-trips through JSON with no loss', () => {
    const ws = sampleWorkspace();
    const back = migrateWorkspace(JSON.parse(JSON.stringify(ws)));
    expect(back).toEqual(ws);
  });
  it('migrates a v0 document', () => {
    const ws = sampleWorkspace() as any;
    const v0 = { ...ws, register: ws.assumptions };
    delete v0.assumptions;
    delete v0.schemaVersion;
    const m = migrateWorkspace(v0);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.assumptions).toHaveLength(ws.assumptions.length);
  });
  it('fills missing fields', () => {
    const m = migrateWorkspace({ schemaVersion: 1, assumptions: [] });
    expect(m.scenarios[0].id).toBe('baseline');
    expect(m.entities.people).toEqual([]);
  });
  it('refuses newer schemas', () => {
    expect(() => migrateWorkspace({ schemaVersion: 999 })).toThrow(MigrationError);
  });
  it('runs module migrations', () => {
    const m = migrateWorkspace({ schemaVersion: 1 }, { demo: { version: 2, migrate: (from) => ({ from }) } });
    expect(m.modules.demo).toEqual({ from: 0 });
    expect(m.moduleVersions.demo).toBe(2);
  });
  it('diffs snapshots', () => {
    const a = sampleWorkspace();
    const b = structuredClone(a);
    b.assumptions[0].value = 53;
    b.entities.people.pop();
    b.scenarios[1].changes[0].month = 2;
    const d = diffContent(a, b);
    expect(d.find((x) => x.area === 'Assumptions')?.fields?.[0]).toEqual({ field: 'value', before: 70, after: 53 });
    expect(d.some((x) => x.kind === 'removed' && x.area === 'Data: people')).toBe(true);
    expect(d.some((x) => x.area.includes('changes') && x.kind === 'changed')).toBe(true);
  });
});
