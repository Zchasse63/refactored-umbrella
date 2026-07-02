# Testing strategy — layered, because DOM testing has blind spots

Playwright DOM testing proves *"the element exists, loaded 200, and is clickable."* It is
**blind to whether things are correct or look right** — a bad image still "renders," a wrong
number still "displays." So the suite is layered; each layer catches what the one above can't.

| Layer | Catches | Tooling | Runs in CI |
|---|---|---|---|
| **L1 — Unit** | pure logic & math: calculator, importer, spec-cleaning, board sort, RFQ row, pipeline transitions, dashboard stats | Vitest (`npm test`) | ✅ yes |
| **L2 — Functional E2E** | navigation, auth/role gating, save/persist, drag-and-drop, **0 console errors** | Playwright (MCP-driven QA per page) | manual per-deploy |
| **L3 — Visual** | framing, crop quality, layout, overflow — *what the DOM can't see* | screenshots + reviewer vision | manual per-deploy |
| **L4 — Data / semantic** | orphaned rows, image paths that 404, photo↔path mismatch, copy gaps, dup slugs, junk specs, image framing | `scripts/audit-data.mjs`, `scripts/audit-images.py` | manual / pre-deploy |

## L1 — Unit (Vitest)
`npm test` — 90+ tests across (count grows; run `npm test` for the live total):
- `lib/calc/economics.test.ts` — the calculator (gross≠net trap, guards, verdict).
- `lib/calc/fba.test.ts`, `lib/calc/fob.test.ts` — FBA fee tiers + FOB extrapolation (validated against real Greenway quote anchors).
- `lib/auth/capabilities.rls.test.ts` — exhaustive capability + pipeline-transition matrix drift guard (the RLS/UI intent, unit-asserted).
- `lib/import/mappers.test.ts`, `lib/import/yuno-mappers.test.ts` — importers (220V count, namespaced refs, photo states, neutral brand, has_photo).
- `lib/data/clean.test.ts` — junk-spec filtering (the marketing-sentence-as-label trap).
- `lib/data/stats.test.ts` — dashboard aggregation invariants (tier counts sum to total).
- `lib/data/board-sort.test.ts` — sort with all-unquoted rows (the −Infinity/NaN guard).
- `lib/auth/capabilities.test.ts` — `canTransition` mirrors the SQL `can_transition` trigger exactly.
- `lib/data/rfq.test.ts` — **RFQ SAFETY**: prints target landed (DDP) only, never gross margin / net%.

## L2 — Functional E2E (Playwright)
Per-page, per-deploy: navigate as owner/partner → assert render, role gating, persistence, 0 console
errors. Pipeline verified end-to-end (legal move persists; illegal move blocked + reverted; decision
sub-state persists). RFQ verified end-to-end (the xlsx downloads, has the right columns, embeds real images).

## L3 — Visual
Screenshots reviewed for framing/quality/layout — the layer that caught the low-res, edge-cramped
product crops that L2 reported as "rendered fine."

## L4 — Data / semantic auditors (the DOM blind spot, scripted)
- **`node scripts/audit-data.mjs`** — invariants over the live DB + filesystem: no orphaned
  selections/quotes/pipeline rows, every `primary_image_path` exists on disk, `photo_state` ↔ path
  consistency, AI-copy coverage, no duplicate slugs, no junk specs, US-voltage sanity. Exits non-zero
  on a hard failure (CI-gateable). **Run before every deploy.**
- **`python3 scripts/audit-images.py <dir> --sheet`** — flags clipped / off-center / blank / cramped /
  non-square product images and emits a contact sheet. Run after any image extraction.

## Known gaps / deferred
- A persistent `@playwright/test` spec suite (the L2 work is currently MCP-driven, not committed specs).
- HTML5 drag-and-drop is hard to automate; the pipeline move is proven via unit tests + the DB trigger +
  a scripted synthetic-drag E2E, not a committed Playwright drag spec.
- L4 auditors need DB credentials, so they run pre-deploy locally rather than in the GitHub Action.
