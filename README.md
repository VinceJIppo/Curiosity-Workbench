# CTO Workbench

The control panel for the Curiosity and Technology Office. It models "what if"
scenarios on org structure, self-service, and the cost of people versus external
services, using your own data. Everything runs in one HTML file on your laptop.
Nothing leaves the machine.

## Open the app

1. Build it once: `npm install`, then `npm run build`.
2. Double-click `dist/cto-workbench.html`. It opens in Chrome or Edge from disk and
   works with networking turned off.
3. On first open it loads a synthetic sample workspace with five scenarios:
   Baseline, Option A (pods now), Option B (three-person office), Option C (office
   first, then pods) and Buy instead of build.

Click any number to see its math: the formula, every input by ID, and each input's
status and source. A ! next to a number means it depends on an assumption marked
Conflict (in the sample, R01 core sellers: 70 vs 53).

The top bar switches between the Conservative (default), Base and Aggressive cases.

## Save, open and share

- The app autosaves to this browser as you work.
- **Save** (Ctrl+S) writes a `.workspace.json` file. That file is the source of
  truth and how you share with Sam and Ryan. It contains comp, GP and customer
  names, so treat it like the spreadsheet it came from.
- **Open** (Ctrl+O) loads a workspace file.
- Workspace > Snapshots and diff: name a snapshot ("pre-CEO review") and compare
  any two snapshots, or a snapshot with the current state.
- Keep real files in `/data`. It is gitignored, as is every `*.workspace.json`.

## Import your files

Data > Import. Drop a CSV, XLSX (you pick the sheet) or JSON file.

1. The wizard guesses what the file holds (assumptions register, roster and comp,
   territories, revenue and GP by line, specialist effort review, service quotes,
   and more).
2. Map columns. Common header names map themselves.
3. Validate: it flags missing required fields, bad numbers, duplicate IDs and
   unknown values (for example a status that is not Open, Assumed, Stated, Measured
   or Conflict).
4. Import, and save the mapping. Next time a file with the same headers arrives,
   it maps itself.

Raw rows are kept alongside the mapped rows (Data > Datasets). Data > Data quality
shows row counts, missing fields, broken references and conflicts, such as the
register's seller count against the roster.

`/samples` has synthetic files shaped like the exports you will bring: try
`samples/assumptions-register.csv` and `samples/specialist-effort-review.csv`.

### After you import your register

Go to Assumptions > Engine bindings and point each role (core sellers today, wage
share, GP uplift, hiring lag, and so on) at the matching row of your R01 to R78
register. The engine reads numbers only through these bindings, so your IDs drive
every calculation without code changes.

## Add a scenario

1. Scenarios > New, or Duplicate an existing one.
2. Add changes from "Add a change...": hire, depart, move, backfill, change comp,
   start or end an external service, shift work between tiers, change a driver,
   override an assumption, or organize a role family into pods.
3. Drag chips on the timeline (or use the arrow keys) to change months.
4. Gates tab: add a gate (manual pass or miss, or a KPI condition). Pick it on a
   change to hold that change until the gate passes. A missed gate reruns 6 months
   later by default.
5. Inheritance tab: start from another scenario and switch at a month, the way
   Option C uses Option B for months 0 to 12 and then Option A's pods.
6. Read the outputs: summary, headcount, cost, coverage, GP and payback, capacity,
   sensitivity (tornado), and the change and gate log.

Compare puts 2 to 4 scenarios side by side. Every chart exports PNG (16:9), SVG and
CSV. "Print summary" and "Print comparison" give a clean page for Save as PDF.

## Sales plays: co-branded pitch decks

Sales plays turn current OEM partner decks into a short redesign-branded deck for
a customer call, for example a 15-minute Cortex XDR conversation.

**Build the library.** Download current decks from the Palo Alto Networks or
Broadcom partner portal as .pptx (only decks the partner program lets you share
with customers). In Sales plays > Slide library, import each one with its OEM and
date. Every deck and slide gets a label: **General messaging**, **Technical product
info** or **Competitive info**. The app suggests labels, products, competitors and
"internal only" slides; check them under Labels.

**Build a pitch** in four steps:
1. **Meeting:** customer, OEM, meeting type, and the products to feature.
2. **What to showcase:** how much of each label (none, light, some, heavy), which
   competitor, the meeting length, and focus words such as "ransomware".
3. **Recommended slides:** the best slides from the whole library, with the reason
   each was picked. Tick, untick and reorder.
4. **Finish:** title, closing slide, download the PPTX.

The result is co-branded: a redesign title slide and a "How redesign helps" slide
wrap the OEM's slides. OEM slides keep their content and notices and gain a small
"Source: OEM, deck (date). Presented by redesign." line with the logo. Each source
deck's legal notice slides are always kept. Slides the OEM marks internal never go
into a customer deck; the builder lists them for your prep. Decks older than 6
months (a setting) are flagged stale. Deck files stay in this browser; share them
with Export slide library. Try it with Load sample decks (five synthetic decks).

## Brand assets (optional)

- Licensed fonts: put Martina Plantijn and AF Atelier Sans files in `assets/fonts`
  and rebuild. Without them the app uses Georgia and the system sans and says so
  in Settings.
- Logo: put `redesign_logo_black.svg` in `assets/brand` and rebuild.

## For developers

See `CLAUDE.md` for architecture, the module recipe, writing rules and commands.
`npm test` builds and runs every test, including the golden numbers and the
no-network check on the built file. `npm run verify:browser` opens the built file
in Chromium offline and walks the full flow.

## Known limits (Phase 1)

- Sample comp, GP and names (other than the named leaders) are synthetic. Sam
  Aguilar's and Ryan McKee's current roles are placeholders.
- GP impact is driver based (ramped specialists x touched GP x uplift x drivers).
  It is a planning model, not an attribution study. The effort to revenue analysis
  is Phase 2.
- Monthly granularity, 36-month horizon.
- Undo history covers the current session only. Snapshots persist in the file.
- Native Save and Open dialogs need Chrome or Edge. Other browsers fall back to
  download and upload.
- Autosave lives in this browser's storage. Clearing site data clears it. Save to a
  file for anything you need to keep.
- Built for laptops 1280 px and wider.
- Pitch kits read .pptx only (not PDF) and show slide titles and text rather than
  thumbnails. Labels and recommendations are keyword based, so check the labels on
  each new deck. Slides from decks with a different slide shape (4:3 vs 16:9) can
  look stretched; the builder warns.
- Chart colors follow the brand palette, which is hard to tell apart for some
  color vision types; charts add dash patterns, direct labels and legends to
  compensate.
