# Ideas backlog

When Vince says "next idea": take the top unchecked item, propose a short plan,
build it, test it, check it off. See "Add a module" in CLAUDE.md.

## Phase 2

- [ ] Org view: before and after org chart, plus a swimlane timeline of moves and gates
- [ ] Tier 1 to 3 self-service modeler (request volumes, effort per tier, shift plans, freed capacity by destination)
- [ ] Scorecards: KPI library, practice scorecards, target vs actual, RAG status, trend
- [ ] Effort to revenue: join effort logs to revenue and GP by account for the specialist impact analysis; simple regression with honest caveats on sample size

## Phase 3

- [x] Innovation research: virtual researchers (cybersecurity, automation, AI, virtualization, customer experience), CIO briefs, anonymized research packets for Claude, research pack import and review, customer innovation brief, Dell Technologies Capital catalog
- [ ] Innovation research live mode: a separate, opt-in build that calls Claude from the app (API key, explicit consent per brief)
- [ ] Innovation catalog: fill the 11 active Dell Technologies Capital companies without a description, refresh the catalog quarterly, add other funds

- [x] Strategy and growth: OEM scorecard, large pursuits tracker (practices involved, gaps), gap analysis into a risk register, investment case linked to scenarios
- [ ] Pursuits from Salesforce: import large opportunities directly and keep the tracker in sync

- [ ] OEM playbooks for Palo Alto Networks, Dell, Broadcom/VMware, Microsoft, Rapid7, CrowdStrike and Avant (program and tier, incentives and deal registration, ideal customer profile and triggers, plays by practice, competitive notes, services attach, enablement assets, contacts, KPIs; markdown export)
- [x] Pitch kits inside sales plays (built co-branded; see CLAUDE.md): import OEM partner decks (PPTX) downloaded from the partner portal, apply redesign branding (theme, fonts, title and closing slides, logo on layouts) while keeping OEM attribution and legal notices, tag slides by product (for example Cortex XDR) and slide type (architecture, messaging), and assemble a short pitch deck for a customer call. Manual import keeps the app offline.
- [ ] Sales enablement tracker (programs, audience, completion, linked KPIs)
- [ ] Innovation Lab pipeline (intake, screen, evaluate, brief, decide; quarterly cycle; candidate cards)
- [ ] Initiative portfolio: every initiative with owner, status, gate, linked scenario and KPIs. Becomes the landing page (set `landingPriority` above 10)

## Sales plays: curated plays (direction since 2026-11-21, see docs/sales-knowledge-architecture.md)

- [ ] Pilot: prepare two or three real meetings three ways (assembled deck, OEM short deck with redesign title and closing, office-built play) and ask reps which they would use
- [ ] redesign template support: upload redesign's .pptx template and standard slides (title, agenda, about redesign, section dividers, services, next steps); every pitch builds on it and OEM slides are fitted into it
- [ ] Play decks: the office authors 6 to 10 plays on the template, each a fixed storyline with chosen OEM slides and optional modules (competitor, persona proof)
- [ ] Play freshness: flag a play when a source OEM deck is replaced or goes stale, and show which slides to recheck
- [ ] Rep personalization: pick a play, add the customer, swap optional modules, download
- [ ] Play briefs: one page per play (discovery questions, objections and answers, key proof, redesign services attach), drafted by Claude, approved quarterly, written into speaker notes
- [ ] Near-duplicate slide check across decks (same statistic or title in two decks)
- [ ] Outcomes: link plays to Salesforce opportunities and win/loss notes (with Phase 2 effort to revenue)

### Sales knowledge graph (paused)

- [x] K1 Knowledge model: nodes, edges, provenance, curation screen, persona and pain lists, knowledge pack export and import (kept as a searchable index)
- [x] K5 Export for Claude and import Claude's knowledge pack as suggestions
- [ ] K2 Claim candidates from slide bullets (paused)
- [ ] K3 Graph-based ranking and narrative arcs (paused; replaced by curated plays)
- [ ] K4 Pitch log and learning weights (paused; replaced by outcomes from Salesforce)

## Smaller ideas noticed during Phase 1
- [ ] Pitch kits: slide thumbnails in the builder (needs a PPTX renderer; today it shows titles and text)
- [x] Pitch kits: mix slides from more than one source deck in one pitch
- [x] Pitch kits: label decks and slides (general messaging, technical product info, competitive info) and recommend slides in a step-by-step builder

- [ ] Assumption history: keep prior values per row with dates, show drift since the last snapshot
- [ ] Scenario notes and a decision log per scenario for the CEO review
- [ ] Export the full register and a scenario's monthly rows to XLSX
