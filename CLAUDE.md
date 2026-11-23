# CTO Workbench: notes for Claude

The control panel for the Curiosity and Technology Office at redesign. One local
tool, one self-contained HTML file, that models "what if" scenarios on org
structure, self-service and people vs external services using real company data
the user uploads. It grows module by module; design for change matters more than
feature count.

## Hard constraints (never break these)

1. **One self-contained file.** `npm run build` produces `dist/cto-workbench.html`.
   It opens by double-click from `file://` in Chrome or Edge and works offline.
   All JS, CSS, fonts and icons are inlined. No CDN. Budget: under 3 MB (today about 0.6 MB).
2. **Zero network at runtime.** The data includes comp, GP and customer names.
   The build injects a CSP meta tag with `connect-src 'none'` and `default-src 'none'`.
   No analytics, telemetry or web fonts. `tests/built-file.test.ts` scans the built
   file for external URLs and network APIs; the only URLs allowed are XML namespace
   identifiers inside SheetJS and Preact. The build strips Papa Parse's unused
   `XMLHttpRequest` streamer (`stripNetwork` in `scripts/vite-plugins.ts`).
3. **Modular source, single-file output.** TypeScript + Vite + `vite-plugin-singlefile`.
4. **Real data never goes in the repo.** `/data` and `*.workspace.json` are gitignored.
   `/samples` holds synthetic data only. Licensed fonts in `assets/fonts` are gitignored.
5. **Writing rules** for all UI copy, labels, docs and exports:
   - Never use an em dash. Tests fail on one anywhere in `src`, `samples` or the docs.
     Write `'\u2014'` in code when you need to match one.
   - Plain, direct language.
   - "redesign" is lowercase in body copy.
   - The Broadcom DR product is always "VMware Protection and Recovery", never
     "Live Site Recovery" or "VMware Live Recovery". `sanitizeText()` rewrites both
     on export.
   - The app's display name is a setting. Default "Curiosity and Technology Office".
6. **No hard-coded business numbers.** Every calculation reads named assumptions
   through bindings (see below). Round only at display (`src/core/format.ts`).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (no CSP, so HMR works) |
| `npm run build` | Typecheck, build, rename to `dist/cto-workbench.html` |
| `npm test` | Build, then all tests including the built-file check |
| `npm run test:unit` | Unit tests only (fast) |
| `npm run samples` | Regenerate `/samples` from `src/samples/seed.ts` |
| `npm run verify:browser` | Build, then open the file in Chromium offline and walk the definition of done. Screenshots in `verify-output/` |

Playwright is not a dependency; `verify-browser.mjs` finds a local or global install.

## Dependencies and why

| Package | Why | Notes |
| --- | --- | --- |
| `preact` | UI. 10 KB, React API, JSX | Hooks only, no compat layer |
| `papaparse` | CSV parsing with quotes, BOM, odd line endings | URL streamer stripped at build |
| `fflate` | Read and write PPTX (zip) for sales play pitch kits; also the slide library file. About 8 KB of sync code | Only sync APIs are imported, so no worker code ships |
| `xlsx` (SheetJS CE 0.20.3) | XLSX import with sheet choice | Installed from the SheetJS CDN tarball as their docs say, not the stale npm package |
| `vite`, `vite-plugin-singlefile`, `@preact/preset-vite` | Build to one file | dev only |
| `typescript`, `vitest`, `@types/*` | Types and tests | dev only |

Charts are hand-built SVG (`src/charts`). No chart library. Add a dependency only
with a reason in this table.

## Layout

```
src/
  core/                 pure TypeScript, no UI, no DOM (except import/parse via libs)
    schema/             types.ts (workspace v1), registry.ts (entity schemas),
                        migrate.ts (versioned migrations), diff.ts (snapshot diff)
    expr/expr.ts        safe expression evaluator (tokenizer, parser, AST walk; no eval)
    assumptions/        resolve.ts: dependency graph, cycle detection, cases, Conflict propagation
    engine/             run.ts (scenario engine), changes.ts (change type plugins),
                        explain.ts (show the math), sensitivity.ts, buildbuy.ts,
                        bindings.ts (semantic keys), calc.ts, types.ts
    import/             parse.ts (CSV, XLSX, JSON), mapping.ts (auto-map, validate,
                        templates, apply), quality.ts (data quality panel)
    pitch/              ooxml.ts (PowerPoint XML helpers), pptx.ts (read decks, build a
                        co-branded pitch from one or more decks, package check),
                        tags.ts (slide types, labels, products, competitors, internal-only),
                        recommend.ts (scores the library for what the rep wants to show),
                        knowledge.ts (shared knowledge graph, packs, Claude hand-off)
    growth/growth.ts    OEM scorecard, pursuits, gap suggestions, risk register
    research/research.ts innovation research: routing, pre-screen, masking, packets, packs
  catalogs/             public reference catalogs (Dell Technologies Capital portfolio)
    format.ts           display rounding and sanitizeText
  app/                  shell: App.tsx, store.ts (undo/redo), persist.ts (IndexedDB
                        autosave, file save/open), router.ts, engine.ts (memoized runs),
                        module.ts (the module contract), ui.ts (per-viewer UI state)
  ui/                   shared components, show-the-math popover, output views,
                        comparison body, editable entity table
  charts/               SVG LineChart, StackedBar, Tornado; PNG/SVG/CSV export
  modules/              one folder per module + registry.ts
  samples/seed.ts       synthetic sample workspace (the tests' known answers)
tests/                  vitest: golden, engine, assumptions, expr, import,
                        workspace, samples, writing, pitch, knowledge, built-file
scripts/                vite plugins (brand assets, CSP, strip network), rename, browser check
samples/                generated synthetic CSVs and sample-workspace.json
```

## Architecture

### Workspace (schema v1)
One JSON document: `settings`, `assumptions`, `entities` (people, territories,
practices, accounts, revenueFacts, opportunities, effortLogs, externalServices,
initiatives, kpis, vendors, plus any module collections), `scenarios`,
`baselineScenarioId`, `datasets` (raw imported rows), `mappingTemplates`,
`modules` (module-owned records), `moduleVersions`, `snapshots`, `changeLog`.
`migrateWorkspace()` upgrades older docs step by step and fills missing fields.
To change the schema: add a step to `STEPS` in `migrate.ts`, bump `SCHEMA_VERSION`,
add a test in `tests/workspace.test.ts`.

### Assumptions and bindings
The register is the single source of truth. Rows have low/base/high, status
(Open, Assumed, Stated, Measured, Conflict), source, as of, used in, notes, optional
formula and alternates. Formulas use the expression language over IDs.
`resolveAssumptions()` builds the graph, detects cycles, picks the case, and
propagates `deps` and `conflicts` transitively.

Cases: `conservative` (default) picks each row's `conservativeBound` (costs default
to high, everything else to low unless set), `aggressive` the other bound, `base`
the value. Sensitivity and bands also use `low` and `high`.

The engine never names an R-number. It reads semantic keys (`sellers_baseline`,
`wage_share`, `gp_uplift`, ...; see `src/core/engine/bindings.ts`) that map to
register IDs in `settings.bindings`. When the user imports their real R01 to R78
register, they re-point bindings in Assumptions > Engine bindings. Add a new key to
`BINDINGS` when the engine needs a new number.

### Scenario engine
`runScenario(ws, scenarioId, opts) => ScenarioResult` is pure and deterministic.
Months 0 to 36 from approval (default view 24). Per month: evaluate gates due this
month, apply changes due this month, compute the row (headcount by role, team,
practice; open reqs; loaded people cost; services cost; coverage; capacity; GP
uplift). Then incremental numbers vs the baseline run, and a summary (2 and 3 year
totals, annual, payback, ROI, break-even, coverage at the view month).

- Loaded cost per person per month = (base + variable) x FTE x (1 + burden) / 12.
  Default burden is the `burden_pct` binding; in the sample it is `1 / wage_share - 1`,
  so loaded = cash comp / wage share.
- Sellers in coverage = register value (`headcountAnchors.sellers`) + roster change
  since month 0. Coverage groups (which role families count as sellers, specialists,
  architects) are settings.
- GP anchors (2026-11-23): company GP last year $77M (R45), this year x1.5 (R46) =
  $115.5M (R47, `company_gp`); specialty GP last year $10M (R48) x the same
  multiplier = $15M (R49, `specialty_gp`); per specialist = R49 / specialists today
  (R10, `gp_per_specialist`, $3M); share credited to specialists R11 = 100%; later-year
  growth R50 (`gp_growth_after`, Open, 0).
- Specialist GP (`gpUplift`) = ramped specialists x specialty GP per specialist / 12 x
  share credited x driver factor (win rate, attach rate and utilization relative to
  today) x office effectiveness x later-year growth. Rows also carry the company GP
  plan and company GP with the scenario (plan + incremental GP); the summary shows
  year-1 company GP, specialty GP and specialty share.
- Programs (`program` change type): `office` makes specialists more effective
  (1 + `office_lift` once `office_lift_delay_months` have passed) x (1 + `campaign_lift`)
  ^ full years since launch. `pursuits` adds large pursuits GP: deals per year / 12 x
  GP per large deal x (min(1, base win rate x (1 + win lift)) x (1 + deal growth) -
  base win rate), after `pursuits_cycle_months`. Pursuits cost for its own payback is
  an allocation (office cost x `pursuits_time_share` + anyone on team "Large pursuits")
  and is not added to totals. Incremental GP compares `gpImpact` (specialist uplift +
  pursuits GP) with the baseline. Option B launches both at M0; C inherits them.
- Gates: a change with `gateId` waits for its gate. Manual gates pass unless marked
  a miss for that evaluation month; KPI gates evaluate an expression over the
  previous month's row and assumptions. A miss reruns after `retryMonths` (default
  from settings, 6) and shifts the held changes by the same delay; after
  `maxRetries` misses the changes drop.
- Inheritance: `inherits` segments take a parent's effective changes in
  `[fromMonth, toMonth)`, optionally filtered by tags; parent changes before the
  segment start are carried to its first month. Option C = B for 0 to 12, then A's
  `pods`-tagged changes.

### Show the math
`explainMonth()` and `explainSummary()` return a `Trace`: label, value, formula,
inputs (with assumption ID, status, source, as of, case used) and the Conflict IDs
it depends on. `<Num trace=...>` renders a clickable number with a ! flag when a
Conflict feeds it. Every displayed output number should go through `<Num>`.

## Add a module

1. Create `src/modules/<name>/index.tsx` exporting a `ModuleManifest`
   (`src/app/module.ts`): `id`, `title`, `icon` (SVG path on a 24 grid), `navOrder`,
   `views` (first is the default tab).
2. Optional parts of the manifest:
   - `entities`: `EntitySchema[]` for new collections. They are registered at
     startup and show up in the import wizard, Data > Browse and data quality.
   - `migrations`: `{ version, migrate(from, data) }` for `workspace.modules[id]`.
   - `changeTypes`: new `ChangeType` plugins for the scenario engine (fields drive
     the generic form, `apply()` mutates `SimState`).
   - `sampleData`, `landingPriority` (highest becomes the landing page; the
     Initiative portfolio should set this above Home's 10), `hiddenFromNav`.
3. Store module records in `ws.modules[<id>]` via `update()` from `src/app/store.ts`.
4. Import its manifest in `src/modules/registry.ts` and add it to `MODULES`.
   That is the only shared file you touch. Modules never import from each other;
   shared pieces go in `src/ui` or `src/modules/shared.tsx`.
5. Tests in `tests/<name>.test.ts`. Engine contributions need unit tests.
6. Check it off in `IDEAS.md`.

## Add a change type
Implement `ChangeType<P>` (see `src/core/engine/changes.ts`). Built-in types go in
`BUILTIN_CHANGE_TYPES`; module types go in the module manifest's `changeTypes`.
Use `ctx.A(key)` for numbers, never literals. Create people with ids derived from
`ctx.change.id` so runs stay deterministic.

## Sales plays and pitch kits (module `plays`)
Reps build a short redesign-branded deck for a customer call from OEM partner decks.
- **Co-branded, never white-labeled.** redesign title and closing slides wrap the
  OEM's slides. OEM slides keep their content, branding, trademarks and notices,
  and gain a small pill with "Source: OEM, deck (date). Presented by redesign." plus
  the logo, in a corner chosen per deck. Slides tagged `legal` are always included.
  Do not add features that strip or hide OEM attribution.
- **No fetching.** Someone downloads current decks from the partner portal and
  imports them. Decks carry a content date; older than `staleMonths` shows as stale.
- **Storage.** Deck files live in IndexedDB (`putBlob`, key `deck:<id>`), not in the
  workspace file. The workspace holds slide metadata, tags, plays and the product
  catalog in `ws.modules.plays`. Share decks with Export slide library (a zip with
  `manifest.json` and `decks/<id>.pptx`).
- **Labels.** Every deck and content slide carries one of three labels: General
  messaging, Technical product info, Competitive info (`Category` in `tags.ts`).
  Covers, agendas and legal notices are `structural`. Labels are suggested on import
  and edited in Slide library > Labels.
- **Recommendations.** `recommend()` is pure: it scores every slide for the OEM against
  the products, the label mix (0 to 3 per label), a competitor, focus words and deck age,
  splits the slide budget (minutes / minutes per slide) across labels, keeps the best
  copy of duplicate slides, and returns picks, alternates and reasons. Story order:
  messaging, technical, competitive.
- **Internal-only slides** (OEM wording like "internal use only", "partner confidential")
  are flagged on import and never go into a customer deck; the builder lists them for
  prep only. Competitive slides that name a redesign partner OEM carry a warning.
- **Mixed decks.** `buildPitch(sources, picks, legal, brand)` copies slides from other
  decks with their layouts, masters, themes and media under new part names, and
  registers the masters with fresh ids. Each source deck's legal slides are kept.
- The builder is four steps: meeting, what to showcase, recommended slides, finish.
- **Direction (2026-11-21): curated plays, not assembled decks.** Partner decks hold
  vendor claims, not knowledge, and slide-by-slide assembly gives no story. Next work
  is redesign template support, office-authored play decks, play freshness flags,
  rep personalization and play briefs (see `IDEAS.md`). The knowledge graph steps
  K2 to K4 are paused; do not build graph-driven deck assembly without asking.
- **Knowledge layer:** `docs/sales-knowledge-architecture.md` describes semantic,
  procedural, working and episodic memory for sales plays and the K1 to K5 steps in
  `IDEAS.md`. Read it before extending Sales plays. Built so far: the knowledge graph
  (`core/pitch/knowledge.ts`, stored in `ws.modules.plays.knowledge`, module data
  version 3), the curation screen (Sales plays > Knowledge), and the Claude hand-off
  (Export for Claude, Import knowledge pack). The office curates; imports arrive as
  suggestions; only approved knowledge should drive recommendations. Every node keeps
  slide evidence; freshness and customer safety are derived from it.
- Module data is version 3 (`PLAYS_VERSION`); `migratePlays()` upgrades older records and
  old slide library files.
- Slide text in kept slides passes through `sanitizeText()` (naming rules).
- `src/samples/pptx.ts` makes synthetic overview, technical and competitive decks for tests and "Load sample decks".
- Rendering check: `tests/pitch.test.ts` writes `verify-output/sample-pitch.pptx` and
  `sample-pitch-mixed.pptx`;
  open it with python-pptx or render it with `soffice --headless --convert-to pdf`.

## Strategy and growth (module `growth`)
OEM scorecard, large pursuits tracker, gaps and risk register, investment case.
- Data lives in entity collections `oemScores`, `pursuits` and `risks` (schemas in the
  module manifest, so they work in the import wizard and Data > Browse). Settings
  (amber tolerance, risk bands, concentration share) in `ws.modules.growth.settings`.
- Logic is pure in `src/core/growth/growth.ts`: RAG by target and direction, latest
  period and trend per OEM and metric, pursuit stats (win rate, practices involved,
  pace, GP by OEM), `suggestGaps()` (red and amber metrics, gaps named on pursuits
  weighted by lost GP, practices never in a pursuit, OEM concentration), risk score
  (likelihood x impact) and heat map.
- The pursuits tab compares tracker actuals with the planning assumptions (R38, R41,
  R42 by binding) and can write an actual into the register as Measured, keeping the
  old value as an alternate. The investment case links risks to scenarios and shows
  each scenario's 24-month cost, GP and payback from the engine.

## Innovation research (module `innovation`)
A panel of virtual domain researchers (cybersecurity, automation, AI, virtualization,
customer experience) works CIO briefs (3 to 5 initiatives) against a startup catalog.
- **Hand-off now, live later.** The app stays offline: it routes each initiative to
  researchers (keywords, or the office overrides), pre-screens the catalog, and
  exports a research packet; Claude plays the panel and returns a research pack
  (`cto-workbench-research-pack`), which the app validates against the catalog.
  `ResearchRunner` in `core/research/research.ts` is the seam for a later, opt-in
  live build; do not add network calls to the main build.
- **Anonymized by default.** Customer, contact and listed sensitive terms become
  tokens ([CUSTOMER], [CONTACT], [TERM1]) in packets; the masking used at export is
  stored on the brief and restored on import.
- **Office review.** Imported startup picks arrive as suggestions; only approved
  picks appear on the customer-facing innovation brief (print or Markdown).
  Unverified catalog entries carry a note.
- **Catalog.** `src/catalogs/dtc-portfolio.ts`: the Dell Technologies Capital
  portfolio compiled from its public page on 2026-11-21 (155 companies, 74 active,
  63 with a one-line description from the company's own site). Public reference
  data, allowed in the repo with source and date. Websites are stored as bare domains
  so the built file carries no external URLs. Exited companies are kept but never
  recommended. Focus areas map to researchers; descriptions about customers, contact
  centers or support add the customer experience researcher. Other catalogs import
  as entity type `startup`.
- Briefs, findings and researcher settings live in `ws.modules.innovation`; the
  catalog in the `startups` collection.

## Brand
Black `#222222` on white. Lime `#C3FDAF` only as a single highlight: the active nav
item and the one key number on a page (`.key-number`). Never body text, full
backgrounds or chart lines. Chart series order: indigo `#8098F9`, orange `#FF8C42`,
fuchsia `#D785F7`, light blue `#87B5F6`, gray `#B6B6B6` (baseline is gray). This
palette fails strict contrast and deuteranopia checks on white, so every chart
also uses a dash pattern per series, direct end labels and an in-chart legend.
Headlines in Martina Plantijn, UI in AF Atelier Sans: drop licensed files in
`assets/fonts` and rebuild; otherwise Georgia and the system sans (Settings says
which). If `assets/brand/redesign_logo_black.svg` exists it is inlined; never draw
or type the logo.

## Decisions made without asking (revisit if wrong)
- Sellers per architect counts the Solutions Architect role family only (16). Kurt
  Page is an Account Principal Architect, which makes 17 architects in total. Change
  in Settings > Coverage groups.
- The seller count for coverage comes from the register (R01, Conflict, 70 vs 53)
  plus roster changes, not from counting roster rows.
- Sam Aguilar and Ryan McKee have placeholder roles and all comp is synthetic.
- Approval month defaults to 2027-01 (Settings).
- Hires are released at the change month and start after the hiring lag (default
  3 months; Option C's gated hires use 6, so +2 released at M12 start at M18).
- Troy Sorrento is modeled as a backfill hire starting M6.

## Working agreements
- Engine first, tests green, then UI. Golden tests in `tests/golden.test.ts` must
  always pass; they match the user's register.
- Commit at each green milestone.
- Keep this file current when architecture or commands change.
- "Next idea" means: take the top unchecked item in `IDEAS.md`, propose a short plan,
  build it, test it, check it off.
