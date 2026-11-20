// Writing rules for UI copy, labels, samples and docs.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeText } from '../src/core/format';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = [...walk('src'), ...walk('samples'), 'README.md', 'CLAUDE.md', 'IDEAS.md'].filter((f) => /\.(tsx?|css|md|csv|json|html)$/.test(f));

describe('writing rules', () => {
  it('no em dashes anywhere in source, samples or docs', () => {
    const bad = files.filter((f) => readFileSync(f, 'utf8').includes('\u2014'));
    expect(bad).toEqual([]);
  });
  it('the Broadcom DR product is always VMware Protection and Recovery', () => {
    // CLAUDE.md states the rule, so it names the forbidden terms.
    const bad = files.filter((f) => !f.endsWith('format.ts') && f !== 'CLAUDE.md' && /Live Site Recovery|VMware Live Recovery/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
  it('sanitizeText fixes user text on export', () => {
    expect(sanitizeText('A \u2014 B')).toBe('A, B');
    expect(sanitizeText('VMware Live Recovery and Live Site Recovery')).toBe('VMware Protection and Recovery and VMware Protection and Recovery');
  });
  it('default display name', async () => {
    const { sampleWorkspace } = await import('../src/samples/seed');
    expect(sampleWorkspace().settings.displayName).toBe('Curiosity and Technology Office');
  });
});
