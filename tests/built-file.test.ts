// Checks the shipped artifact: one self-contained file, no network, CSP present, size budget.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const FILE = 'dist/cto-workbench.html';
const BUDGET = 3 * 1024 * 1024;

// XML namespace and schema identifiers inside SheetJS and Preact. They are string
// constants that are never fetched. Anything else is a failure.
const NAMESPACE_HOSTS = ['www.w3.org', 'schemas.openxmlformats.org', 'sheetjs.openxmlformats.org', 'schemas.microsoft.com', 'purl.org', 'purl.oclc.org', 'ns.adobe.com'];

const built = existsSync(FILE);
const html = built ? readFileSync(FILE, 'utf8') : '';

describe.skipIf(!built)('built file', () => {
  it('is a single file', () => {
    expect(readdirSync('dist')).toEqual(['cto-workbench.html']);
  });
  it('is under the size budget', () => {
    expect(statSync(FILE).size).toBeLessThan(BUDGET);
  });
  it('has a strict CSP with connect-src none', () => {
    const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
    expect(m).not.toBeNull();
    const csp = m![1];
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/https?:/);
    expect(csp).not.toContain('unsafe-eval');
  });
  it('loads nothing from outside the file', () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/(src|href)=["']?(https?:)?\/\//i);
    expect(html).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
    expect(html).not.toMatch(/@import/);
  });
  it('contains no external URLs except XML namespace identifiers', () => {
    const hosts = new Set([...html.matchAll(/(?:https?|wss?|ftp):\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()));
    const unexpected = [...hosts].filter((h) => !NAMESPACE_HOSTS.includes(h));
    expect(unexpected).toEqual([]);
  });
  it('contains no network APIs', () => {
    for (const api of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'importScripts', 'new Worker', 'serviceWorker', 'RTCPeerConnection']) {
      expect(html.includes(api), api).toBe(false);
    }
  });
  it('contains no eval', () => {
    expect(html).not.toMatch(/\beval\(/);
    expect(html).not.toMatch(/new Function\(/);
  });
  it('follows the DR naming rule', () => {
    // Em dashes are checked in source (tests/writing.test.ts): the minifier turns the
    // sanitizer's escape into a literal, and SheetJS ships one in a codepage table.
    const outsideSanitizer = html.replace(/VMware Live Site Recovery\|VMware Live Recovery\|Live Site Recovery/g, '');
    expect(outsideSanitizer).not.toMatch(/Live Site Recovery|VMware Live Recovery/);
  });
});

describe('build exists', () => {
  it('dist/cto-workbench.html was built (run npm run build)', () => {
    expect(built).toBe(true);
  });
});
