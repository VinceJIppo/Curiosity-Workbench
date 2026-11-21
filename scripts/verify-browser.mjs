// Opens the built file from disk in Chromium with the network off and walks the
// Phase 1 definition of done. Writes screenshots to verify-output/.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Playwright may be installed locally or globally; it is not a project dependency.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`));
}

const FILE = 'file://' + resolve('dist/cto-workbench.html');
const OUT = 'verify-output';
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, offline: true });
// Force the download / upload fallback so the test does not wait on native pickers.
await context.addInitScript(() => {
  delete window.showSaveFilePicker;
  delete window.showOpenFilePicker;
});
const requests = [];
context.on('request', (r) => {
  if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url());
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());

await page.goto(FILE);
await page.waitForSelector('nav.side');
check('loads from file:// offline', true);
check('sample workspace loaded', (await page.locator('[data-testid^="card-"]').count()) === 5, `${await page.locator('[data-testid^="card-"]').count()} scenario cards`);
await page.screenshot({ path: `${OUT}/01-home.png` });

const cardText = await page.locator('[data-testid="card-option-c"]').innerText();
check('Option C card shows numbers', /\$/.test(cardText) && /7\.8/.test(cardText), cardText.replace(/\s+/g, ' ').slice(0, 160));

for (const id of ['baseline', 'option-a', 'option-b', 'option-c', 'buy']) {
  await page.goto(`${FILE}#/scenarios/edit/${id}`);
  await page.waitForSelector('.kpis');
  const warn = await page.locator('.callout.error').count();
  check(`scenario ${id} computes`, warn === 0);
}
await page.goto(`${FILE}#/scenarios/edit/option-c`);
await page.waitForSelector('.timeline');
await page.screenshot({ path: `${OUT}/02-scenario-c.png`, fullPage: false });
await page.getByRole('tab', { name: 'Coverage' }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/03-coverage.png` });

// Show the math
await page.locator('.num-btn').first().click();
await page.waitForSelector('[role="dialog"]');
const math = await page.locator('[role="dialog"]').innerText();
check('show the math opens with formula and inputs', /Formula/.test(math) && /Inputs/.test(math));
check('Conflict flagged in show the math', /Conflict/.test(math), '');
await page.screenshot({ path: `${OUT}/04-math.png` });
await page.keyboard.press('Escape');

// Drag a chip in option A
await page.goto(`${FILE}#/scenarios/edit/option-a`);
await page.waitForSelector('.chip');
const chip = page.locator('.chip').nth(2);
await chip.scrollIntoViewIfNeeded();
const label0 = await chip.getAttribute('aria-label');
const box = await chip.boundingBox();
await page.mouse.move(box.x + 10, box.y + 10);
await page.mouse.down();
await page.mouse.move(box.x + 10 + 34 * 3, box.y + 10, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(150);
const label1 = await page.locator('.chip', { hasText: 'Cybersecurity Specialist' }).getAttribute('aria-label');
check('drag a chip changes the month', label0 !== label1, `${label0} > ${label1}`);
await page.getByRole('button', { name: 'Undo' }).click();

// Compare A, B, C
await page.goto(`${FILE}#/compare`);
await page.waitForSelector('[data-testid="compare-table"]');
const cmp = await page.locator('[data-testid="compare-table"]').innerText();
check('compare shows A, B and C side by side', /Option A/.test(cmp) && /Option B/.test(cmp) && /Option C/.test(cmp) && /Sellers per specialist/.test(cmp));
await page.screenshot({ path: `${OUT}/05-compare.png`, fullPage: true });

// Export a chart: PNG, SVG, CSV
for (const kind of ['PNG', 'SVG', 'CSV']) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.locator('.chart').first().getByRole('button', { name: kind }).click()]);
  const p = `${OUT}/chart.${kind.toLowerCase()}`;
  await dl.saveAs(p);
  const size = readFileSync(p).length;
  check(`chart exports ${kind}`, size > 200, `${dl.suggestedFilename()} ${size} bytes`);
}

// Sensitivity
await page.goto(`${FILE}#/scenarios/edit/option-c`);
await page.getByRole('tab', { name: 'Sensitivity' }).click();
await page.getByRole('button', { name: 'Run sensitivity' }).click();
await page.waitForSelector('text=Current case', { timeout: 20000 });
check('tornado renders', true);
await page.screenshot({ path: `${OUT}/06-tornado.png` });

// Build vs buy
await page.goto(`${FILE}#/people/buildbuy`);
const bvb = await page.locator('main').innerText();
check('build vs buy shows $924K to $1.32M', bvb.includes('$924K to $1.32M'));
check('buy year one shows $126K to $404K', bvb.includes('$126K to $404K'));

// Assumptions register
await page.goto(`${FILE}#/assumptions/register/R01`);
await page.waitForSelector('.drawer');
check('assumption drawer opens', true);
await page.screenshot({ path: `${OUT}/07-register.png` });

// Import a CSV through the wizard
const csv = 'ID,Assumption,Value,Unit,Status,Source,As of,Used in,Notes\nR90,Test import row,42,people,Measured,Browser check,2026-11,Test,\n';
writeFileSync(`${OUT}/register.csv`, csv);
await page.goto(`${FILE}#/data/import`);
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('choose-file').click()]);
await fc.setFiles(`${OUT}/register.csv`);
await page.getByRole('button', { name: 'Next: map columns' }).click();
await page.getByRole('button', { name: 'Next: validate' }).click();
await page.getByTestId('do-import').click();
await page.waitForTimeout(200);
const imported = await page.evaluate(() => document.body.innerText.includes('Imported 1 rows'));
check('import wizard imports a CSV and saves a mapping', imported);

// Sales plays: load sample decks, import a deck file, build a co-branded pitch
await page.goto(`${FILE}#/plays/library`);
await page.getByTestId('load-sample-decks').click();
await page.waitForSelector('text=Sample Cortex XDR competitive battlecard (synthetic)');
check('sample decks load into the slide library', true);
writeFileSync(`${OUT}/upload-deck.pptx`, readFileSync(`${OUT}/sample-source-deck.pptx`));
await page.getByTestId('open-import-deck').click();
const [fcDeck] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('pick-deck').click()]);
await fcDeck.setFiles(`${OUT}/upload-deck.pptx`);
await page.getByTestId('import-deck').click();
await page.waitForSelector('text=upload-deck');
check('a PPTX imports through the file picker', true);
await page.goto(`${FILE}#/plays/library`);
await page.locator('[data-testid^="labels-"]').first().click();
await page.screenshot({ path: `${OUT}/09-slide-library.png`, fullPage: true });
await page.goto(`${FILE}#/plays/builder`);
await page.waitForSelector('[data-testid="pitch-wizard"]');
await page.getByPlaceholder('Account name').fill('Sample Customer 01');
await page.locator('button', { hasText: /^Cortex XDR$/ }).click();
await page.getByTestId('step-next').click();
await page.getByTestId('emph-competitive-3').click();
await page.locator('select').filter({ hasText: 'Any competitor' }).selectOption('CrowdStrike');
await page.getByTestId('step-next').click();
const order = await page.getByTestId('pitch-order').innerText();
check('wizard recommends slides across labels, including the CrowdStrike comparison', /Why Cortex XDR/.test(order) && /Cortex XDR vs CrowdStrike/.test(order) && !/landmines/i.test(order), order.replace(/\s+/g, ' ').slice(0, 220));
await page.screenshot({ path: `${OUT}/10-recommendations.png`, fullPage: true });
await page.getByTestId('step-next').click();
const [pitch] = await Promise.all([page.waitForEvent('download'), page.getByTestId('build-pitch').click()]);
const pitchPath = `${OUT}/${pitch.suggestedFilename()}`;
await pitch.saveAs(pitchPath);
check('pitch builder downloads a PPTX', pitch.suggestedFilename().endsWith('-redesign.pptx') && readFileSync(pitchPath).length > 2000, pitch.suggestedFilename());

// Strategy and growth: scorecard, pursuits, gaps into the risk register, investment case
await page.goto(`${FILE}#/growth/scorecard`);
const card = await page.getByTestId('scorecard').innerText();
check('OEM scorecard shows status by OEM', /Palo Alto Networks/.test(card) && /red/.test(card));
await page.screenshot({ path: `${OUT}/12-scorecard.png`, fullPage: true });
await page.goto(`${FILE}#/growth/pursuits`);
const pt = await page.getByTestId('pursuits-table').innerText();
check('pursuits tracker lists pursuits with practices involved', /SOC modernization/.test(pt) && /Practices/.test(pt));
await page.goto(`${FILE}#/growth/risks`);
await page.getByTestId('add-all-gaps').click();
const reg = await page.getByTestId('risk-register').innerText();
check('suggested gaps go into the risk register', /No certified NSX engineer/.test(reg) && /Palo Alto Networks/.test(reg));
await page.screenshot({ path: `${OUT}/13-risks.png`, fullPage: true });
await page.goto(`${FILE}#/growth/investment`);
const inv = await page.getByTestId('investment-table').innerText();
check('investment case pulls scenario cost, GP and payback', /Option C/.test(inv) && /\$/.test(inv));
await page.screenshot({ path: `${OUT}/14-investment.png`, fullPage: true });

// Knowledge: seed, import a pack, approve, export for Claude
await page.goto(`${FILE}#/plays/knowledge`);
await page.getByTestId('seed-knowledge').click();
await page.waitForSelector('[data-testid="knowledge-table"]');
const seededRows = await page.locator('[data-testid="knowledge-table"] tbody tr').count();
check('knowledge seeds from the library', seededRows > 10, `${seededRows} items`);
writeFileSync(`${OUT}/knowledge-pack.json`, JSON.stringify({
  kind: 'cto-workbench-knowledge-pack', version: 1, source: 'Browser check',
  nodes: [
    { ref: 'p', kind: 'product', oem: 'Palo Alto Networks', text: 'Cortex XDR' },
    { ref: 'c', kind: 'capability', oem: 'Palo Alto Networks', text: 'Correlates alerts into incidents (sample)', evidence: [{ deck: 'Sample Cortex XDR overview (synthetic)', slide: 4 }] },
  ],
  edges: [{ from: 'p', rel: 'has', to: 'c' }],
}));
const [fcPack] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('import-pack').click()]);
await fcPack.setFiles(`${OUT}/knowledge-pack.json`);
await page.waitForSelector('text=1 new suggestions');
check('a knowledge pack imports as suggestions', true);
await page.getByRole('button', { name: 'Close' }).click();
await page.locator('[data-testid="knowledge-table"] tr', { hasText: 'Correlates alerts into incidents' }).click();
await page.waitForSelector('[data-testid="knowledge-detail"]');
const detail = await page.getByTestId('knowledge-detail').innerText();
check('knowledge shows its slide evidence and links', /slide 4: Cortex XDR architecture/.test(detail) && /Cortex XDR/.test(detail));
await page.screenshot({ path: `${OUT}/11-knowledge.png` });
await page.getByTestId('approve-node').click();
check('office approves knowledge', (await page.locator('[data-testid="knowledge-detail"] .badge.pass').count()) === 1);
const [req] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export for Claude' }).click()]);
await req.saveAs(`${OUT}/${req.suggestedFilename()}`);
const reqText = readFileSync(`${OUT}/${req.suggestedFilename()}`, 'utf8');
check('export for Claude includes instructions and slide text', reqText.includes('cto-workbench-knowledge-pack') && reqText.includes('slide 4: Cortex XDR architecture'), req.suggestedFilename());

// Snapshot
await page.goto(`${FILE}#/workspace/snapshots`);
await page.getByPlaceholder('pre-CEO review').fill('pre-CEO review');
await page.getByRole('button', { name: 'Take snapshot' }).click();
check('snapshot taken', (await page.locator('text=pre-CEO review').count()) > 0);

// Save and reopen
await page.goto(`${FILE}#/workspace/file`);
const [saved] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save (Ctrl+S)' }).click()]);
const savedPath = `${OUT}/${saved.suggestedFilename()}`;
await saved.saveAs(savedPath);
const before = JSON.parse(readFileSync(savedPath, 'utf8'));
check('workspace saved', before.assumptions.some((a) => a.id === 'R90') && before.snapshots.length === 1);

// Fresh browser context: no autosave, open the saved file
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, offline: true });
await ctx2.addInitScript(() => {
  delete window.showSaveFilePicker;
  delete window.showOpenFilePicker;
});
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errors.push(String(e)));
p2.on('dialog', (d) => d.accept());
await p2.goto(`${FILE}#/workspace/file`);
await p2.waitForSelector('nav.side');
const [fc2] = await Promise.all([p2.waitForEvent('filechooser'), p2.getByRole('button', { name: 'Open (Ctrl+O)' }).click()]);
await fc2.setFiles(savedPath);
await p2.waitForTimeout(300);
const [saved2] = await Promise.all([p2.waitForEvent('download'), p2.getByRole('button', { name: 'Save (Ctrl+S)' }).click()]);
const p2path = `${OUT}/roundtrip.json`;
await saved2.saveAs(p2path);
const after = JSON.parse(readFileSync(p2path, 'utf8'));
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const strip = (w) => canon({ ...w, updatedAt: '' });
check('workspace round-trips through save and open with no loss', JSON.stringify(strip(before)) === JSON.stringify(strip(after)));

// Print view
await page.goto(`${FILE}#/print/compare/option-a,option-b,option-c`);
await page.waitForSelector('[data-testid="compare-table"]');
await page.emulateMedia({ media: 'print' });
await page.screenshot({ path: `${OUT}/08-print.png`, fullPage: true });
await page.pdf({ path: `${OUT}/ceo-summary.pdf`, landscape: true, format: 'Letter' });
await page.emulateMedia({ media: 'screen' });
check('print view renders', true);

// Autosave survives reload
await page.goto(`${FILE}#/`);
await page.waitForTimeout(1200);
await page.reload();
await page.waitForSelector('nav.side');
await page.goto(`${FILE}#/assumptions/register/R90`);
check('autosave restores the workspace after reload', (await page.locator('[data-testid="row-R90"]').count()) === 1);

check('no network requests', requests.length === 0, requests.join(', '));
check('no console or page errors', errors.length === 0, errors.slice(0, 5).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
