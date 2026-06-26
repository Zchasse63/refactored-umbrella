# The Portal — Build Plan & Spec

> Consolidated, build-ready plan for the two-sided sourcing-collaboration app described in
> `Viral_Collab_Portal_BRIEF.md`. Grounded in the real, verified data (see "Data inventory"),
> the architecture exploration, and the decisions confirmed with Zach on 2026-06-25.
> This is the architect artifact — review and approve before Phase 0 code begins.

---

## 1. Summary

A private, invite-only web app where **two equal partners** collaborate to pick and price products
for an Amazon/retail launch. The owner sources factory-direct and enters factory quotes; the partner
sets a **target sell price** and, via a live calculator, a **target landed cost (DDP)** — the single
number we take to the factory to negotiate. Both sides see everything, including true costs and quotes;
roles gate **who edits what**, not visibility.

**The headline deliverable** is the **Factory RFQ export**: filter to the "Pursue" set → one-click
Excel + PDF with target landed costs, MOQ asks, competitor reference prices, and specs → send to the
factory for quotes → import quotes back → live PASS/FAIL margin for both partners.

**Design direction:** *Storefront with a broker-grade Deal Panel.* A light, public-grade marketplace
storefront (catalog + a rich product page for **every** item) is the home; a dense deal-terminal
cockpit (editable list, comparison board, dashboard) is where the two operators work. Neutral branding —
no Yuno or Viral marks anywhere.

**Scale:** ~152 products at launch (70 RoyalStar appliances + 57 beauty + 25 Greenway foodservice),
2 users now, modeled so more partners/lines can be added later.

---

## 2. Tech stack & deployment

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Styling | Tailwind + shadcn/ui |
| Backend | **Dedicated new Supabase project** (Postgres + Auth + Storage + Realtime). Do **not** reuse the Servous project. |
| Auth | Supabase Auth, **email magic-link, invite-only**, no public signup |
| Hosting | **Netlify** on a real subdomain (e.g. `portal.<domain>`) — magic links from a bare platform subdomain land in spam; use a custom auth-email sender |
| Competitor data | **Keepa API** (~€49/mo), enriched by ASIN |
| Calculator | Pure TypeScript module, unit-tested (`lib/calc/economics.ts`) |

---

## 3. Users, roles & transparency

- **Owner** (Zach): writes products, specs, images, competitors, factory quotes, global assumptions,
  pipeline advances (Costing→Quoted); runs imports/exports.
- **Partner** (Viral): writes their own selections — prospect tier, target sell price, target landed
  cost, per-product calculator overrides, priority, notes; moves New↔Shortlisted; runs the calculator
  and exports.
- **Both read everything.** Every editable number carries a quiet authorship caption ("set by … · 2d
  ago") and a lock glyph when you're the other role. Identical layout for both; only which controls are
  *live* differs. Owner has a "Preview as Partner" client-only mode.

The two blocks on the product page are labeled **"Targets"** (the market side) and **"Factory quote"**
(the cost side) — not "Partner sets"/"Owner enters".

---

## 4. Information architecture (routes)

```
(auth)/login                      magic-link, invite-only, neutral brand
(app)/                            authenticated shell: top bar, ⌘K palette, role badge
  /catalog                        faceted storefront browse (grid ↔ table), all state in URL
    (.)p/[slug]                   intercepting "peek" — PDP as a right-side sheet (↑/↓/Esc)
  /p/[slug]                       full product detail page (PDP)
  /products                       editable list — adjust tier/target sell/quote inline
  /board                          dense comparison cockpit (sort by headroom/net%) + Kanban toggle
  /pipeline                       shared Kanban: New → Shortlisted → Costing → Quoted → Decision
  /dashboard                      owner cockpit: KPIs, selections table, Build RFQ
  /exports                        RFQ builder, filtered CSV/Excel, quote-import dropzone
  /settings/assumptions           global cost-stack + target margin editor
  /settings/members               owner-only invite/role management
  /import                         owner-only idempotent importer with dry-run diff
api/
  /rfq                            POST ids+columns → Excel + PDF (image-embedded)
  /export                         filtered CSV/Excel of any view
  /import/quotes                  quote CSV → upsert factory_quotes → recompute
  /import/products                idempotent product upsert by external_ref
  /import/greenway                one-way pull from Servous → products/competitors
  /enrich/keepa                   ASIN → Keepa enrichment → competitors
```

---

## 5. Visual design system

- **Two registers.** *Storefront* (light, roomy, imagery-forward) for `/catalog`, `/p/[slug]`,
  `/login`. *Cockpit* (dense, hairline dividers, virtualized tables) for `/products`, `/board`,
  `/pipeline`, `/dashboard`. Dark-capable cockpit is a Phase-3 token-driven follow-on.
- **Type:** Inter/Geist for UI; a mono (Geist Mono/IBM Plex Mono) for **all money, %, spec values, SKU,
  ASIN, external_ref**, with `tnum` tabular figures so columns align on the decimal.
- **Semantic color (meaning only, never decoration):** indigo = Target · amber = Quoted / factory-edit ·
  slate = Actual · emerald = PASS · rose = FAIL · violet = market/targets side & per-product override.
  Every color state carries a redundant glyph/label (colorblind-safe).
- **Components:** shadcn Card, Table, Tabs, Accordion (facets), Sheet/Drawer (calculator, RFQ, peek),
  Dialog (lightbox), Command (⌘K), Badge, Slider+Input, Tooltip, Sonner toasts, Skeleton. Plus two
  custom: `<EconomicsWaterfall>` and `<CostStackEditor>`.

---

## 6. Data model

`specs` and `calc_inputs` are `jsonb`. `external_ref` is the idempotency key, **namespaced by line**
(`appliance:<slug>`, `beauty:<id>`, `greenway:<vendor_product_id>`).

- **memberships** — `user_id` (unique, → auth.users), `role ('owner'|'partner')`, `display_name`.
  One row per user; seed Zach=owner, Viral=partner. `app_role()` SECURITY DEFINER helper for RLS.
- **products** — `id, external_ref (unique), line ('appliance'|'beauty'|'foodservice'), brand, source
  ('RoyalStar'|'MKS'|'Greenway'), name, model, group_name, subsection, categories text[], specs jsonb,
  features text[], source_url, msrp, our_cost, our_cost_source, needs_photo, img_tier, image_has_chinese,
  voltage_flag, primary_image_path, timestamps`. `our_cost` is NULL for appliance/beauty (the core "no
  cost" state), populated for Greenway. GIN index on `specs`; btree on `(line, subsection)`,
  `(line, group_name)`, `external_ref`.
- **product_images** — `product_id, storage_path, is_primary, sort, img_tier, image_has_chinese,
  export_ok (bool), alt`. One `is_primary` per product (partial unique index). `export_ok=false` for
  images flagged Chinese-text / text-overlay / wrong-product so they're excluded from factory exports.
- **competitors** — `product_id, external_ref, title, brand, marketplace, retail_url, asin, price,
  currency, rating, review_count, bsr, est_monthly_sales, monthly_sales_source, image_url, notes,
  enriched_at`. Owner-managed + Keepa-enriched. (No price-range bar — mini-cards only.)
- **selections** — `product_id, partner_user_id, tier ('pursue'|'maybe'|'pass'), priority,
  target_sell_price, target_landed_cost (derived+persisted), calc_inputs jsonb, notes, timestamps`.
  Unique `(product_id, partner_user_id)`. `calc_inputs` = per-product override bag
  `{ sellPrice?, grossMargin?, costStack?, overridden }`.
- **factory_quotes** — `product_id, landed_cost_ddp, moq, lead_time_days, quote_date, supplier,
  is_selected, notes`. Owner-only. Multiple per product; `is_selected` drives live margin. DDP only.
- **assumptions** — single row (`id=1`): `gross_margin (0.650)`, `cost_stack jsonb`
  `[referral .15, ads .15, fba .15, returns .04, partner_split .00]`. Plus **per-line profiles** so
  foodservice can zero out FBA opex (see §8). Owner-governed.
- **pipeline_status** — `product_id (unique), status, decision ('go'|'hold'|'pass')`, auto-seeded 'new'.
- **comments** — `product_id, user_id, body, created_at`. Realtime.
- **activity** — append-only audit log (`actor_id, verb, payload {field,from,to}`) for the per-field
  authorship captions; written via SECURITY DEFINER triggers so logging can't be skipped.

---

## 7. RLS & capability map

- **Reads:** every table — `USING (app_role() in ('owner','partner'))`. Full transparency.
- **Writes:** gated. products/product_images/competitors/factory_quotes/assumptions →
  `is_owner()`. selections → `is_partner() AND partner_user_id = auth.uid()`. pipeline_status →
  a `can_transition(old,new,role)` function (partner New↔Shortlisted; owner Costing→Quoted; either
  →Decision). comments/activity → own rows only; activity append-only.
- **One shared role-capability map** (`lib/auth/capabilities.ts`) drives **both** the UI `useCanEdit()`
  hook (disabled state + lock glyph) **and** a generated RLS assertion test, so UI and DB can never
  drift. Storage `product-images` bucket: public read, owner write.

---

## 8. The calculator (core value — a rewrite, not a port)

`lib/calc/economics.ts` — pure, no React, no I/O, fully unit-tested. The on-disk `fba_calc.py` ships the
**old** stack (52% opex incl. a 3% agency line + a $100/SKU flat fee + FOB math); **all of that is
removed**. Clean math:

- `opexPct = Σ cost_stack.pct` → **0.49** (referral .15 + ads .15 + fba .15 + returns .04; partner_split .00)
- `targetLanded = (1 − grossMargin) × sell` → **35% of sell at 0.65 = the RFQ number (DDP)**
- `netPerUnit = sell − landed − opexPct×sell` → **≈16% of price** at the ceiling
- `quoteCheck`: `gross = (sell − quotedLanded)/sell`; **PASS if ≥ target**; `headroom = targetLanded − quotedLanded`
- **Live column rule:** headline margin uses **Quoted if present, else Actual, else Target**. Missing
  columns render an em-dash, **never $0**.

**Per-line cost-stack profiles.** Appliance/beauty use the 49% FBA stack. **Foodservice (Greenway)** gets
a profile with FBA-style opex marked N/A — it shows its **real Actual cost** without forcing meaningless
Amazon "net %" math.

**Two surfaces, one engine:** global assumptions (`/settings/assumptions`) recompute every non-overridden
product's target landed on save (the "change once → everything updates" ripple); per-product overrides
live in `selections.calc_inputs` (violet "Overriding global" chip + reset). Live recompute on every
keystroke/slider; autosave on settle.

**Terminology safeguards (the highest-stakes bug).** "65% gross" = COGS ≤ 35% of price; the 49% opex is
separate, so **net ≈ 16%, not 65%**. Gross and net are never adjacent, never share a color, always
suffixed ("gross"/"net"). The gross-margin control reads "Gross margin (COGS vs price) ⇒ landed ≤ 35% =
$X target landed (DDP)". Guard `sell > 0` (render "—", never NaN). **Unit tests assert**
`targetLanded(40,0.65)=14`, `net≈16%` (not 65%), `quoteCheck(40,12.5,…)` PASS with $1.50 headroom,
`quoteCheck(40,15,…)` FAIL, live-column precedence, divide-by-zero → "—".

---

## 9. Screens

### Catalog (`/catalog`)
Faceted storefront. Left rail (Line → Group/Section → Subsection, Brand, Prospect tier, Pipeline status,
Has-quote, Photo state, Price band) with live counts; all filter state in the URL (saved view = shareable
link). Grid (storefront cards with an economics ribbon + a 3-dot Target/Quoted/Actual completeness
indicator + camera-slash badge on missing photos) ↔ Table toggle. Instant in-memory fuzzy search over
name/model/spec labels.

### Product detail page (`/p/[slug]`)
The centerpiece — every item gets one. Server shell + a single client "economics island" (the Deal
Panel). Opens as a slide-over peek from any list (↑/↓ to walk products, Esc to dismiss).
- **Left:** image gallery (object-contain on a neutral tile; lightbox; honest photo-state chip; "studio
  photo pending" only when genuinely missing) · at-a-glance chips parsed from specs · features /
  selling-points · **specs table** (mono values; "— needed for tier fee" stubs for missing carton
  dims/weight) · **competitor mini-pages** (§10) · activity & comments (Realtime).
- **Right — the Deal Panel ("buy box" as a negotiation):** three-number market header (Target | Quoted |
  Actual + PASS/FAIL pill) · the **live P&L waterfall** (sell → −opex → 3-column landed → net/unit, the
  live column ring-highlighted) · PASS/headroom lamp · **"Targets"** block (tier, target sell, derived
  target landed, notes) · **"Factory quote"** block (quoted DDP, MOQ, lead time, supplier) · pipeline
  selector · "Open calculator" + "Add to RFQ".

### Editable Products list (`/products`)
The "don't make me open every page" view Zach asked for. A scrollable table of all products showing the
key data, with **inline-editable** tier, target sell, and factory quote per row; derived landed, live
net %, PASS/FAIL, and pipeline stage update in place. Footer rollups (# Pursue, # quoted, # PASS/FAIL) +
"Build RFQ from Pursue".

### Board (`/board`), Pipeline (`/pipeline`), Dashboard (`/dashboard`)
Dense comparison cockpit (rank by headroom/net%) with a Kanban toggle · shared Linear-style pipeline with
Realtime moves · owner dashboard with KPI cards, the selections table, multi-select → **Build Factory
RFQ**, and inline "Enter quote".

### Settings & Import
Global assumptions editor (`<CostStackEditor>`: addable/removable %-line sliders, live "= 49% opex"
total, the "landed ≤ 35%" helper) · owner-only members · owner-only importer with **dry-run diff**.

---

## 10. Competitor mini-pages + Keepa enrichment

Each product's competitor section is a row of **mini-product cards** (no price-range bar — removed per
feedback): image, title, **Amazon marketplace badge + ASIN**, price, ★rating (review count),
**estimated monthly sales**, **BSR**, and an outbound link. Owner can add/edit/remove manually.

**Sourcing flow (Keepa):**
1. **Discovery (Claude):** build a search profile from the product's specs → propose a few candidate
   competitor **ASINs** for the owner/partner to confirm.
2. **Enrichment (Keepa, by ASIN):** `/api/enrich/keepa` pulls price, rating, review count, sales rank →
   **BSR**, and Keepa's `monthlySold` (the **real** "bought in past month" count), plus image. Stored on
   `competitors` with `enriched_at`. Full wiring spec: **`KEEPA_INTEGRATION.md`**.

> Note on the "bought last month" figure: Keepa's `monthlySold` is the **real** Amazon "bought in past
> month" number — **not** a rank estimate — but it is `null` for ASINs where Amazon doesn't display it
> (most). So the mini-card shows the real figure when present (`monthly_sales_source = keepa:monthlySold`)
> and falls back to a BSR-based signal otherwise (`keepa:bsr-estimate`). The schema holds both, so a
> source swap (e.g. to Rainforest/ScraperAPI for the literal on-page string) is zero rework.

Keepa is token-based (~1 token/ASIN, 20 tokens/min on the ~€49 tier; `stats` is free, no `offers`) — our
~500 candidate ASINs (batched 100/call) refresh in minutes, well within plan. See `KEEPA_INTEGRATION.md`
for the request, the `stats.current` CsvType index mapping, the `competitors` field map, and a drop-in
`lib/keepa/client.ts`.

---

## 11. Import pipeline + data cleaning

Idempotent, owner-only, server-side, keyed on `external_ref`.

- **Appliances** (70, `website_catalog_final.json`) and **beauty** (57, `beauty_catalog_final.json`):
  pure per-line mappers (unit-tested against the real fixtures) → upsert `products` on conflict; upload
  the one curated image each to Storage as `<external_ref>.jpg`; seed `pipeline_status='new'`.
  `our_cost`/`msrp` left NULL.
- **Greenway** (25, one-way from Servous via the `servous-database` skill): map vendor_products +
  `vendor_true_cost` (divide by per-row `markup_factor`) → `our_cost` (the **Actual** column);
  competitor_prices → competitors. Never reuse the Servous project.
- **Data-cleaning pass (correctness, not cosmetic):**
  - Flag the **46 appliances listing "220 V"** (`voltage_flag`) — annotate, don't silently present as
    US-ready (US is 110–120V).
  - Mark images flagged Chinese-text (**45 beauty**), text-overlay (**6 appliances**), or
    **wrong-product (1 appliance)** as `export_ok=false` so they never reach a factory-facing export;
    the wrong-product SKU is gated until reviewed.
  - Three honest image states (good / clean-photo-needed / reshoot) surfaced as an owner to-do count —
    **not** the brief's mistaken "127 missing photos" framing (only 1 is actually missing).
- **Fix the brief's asset paths** — real files live under `beauty/catalog/...` and
  `beauty/assets/{final_opt,web_final_opt}/...`.

---

## 12. Export pipeline

- **Factory RFQ export (its own milestone):** filter/select → previewable `<RfqBuilderDrawer>` (validate
  columns + editable MOQ-ask) → `/api/rfq` builds **Excel** (exceljs, branded header, image-embedded,
  tabular money formats) **and PDF** (React-PDF or Netlify-friendly print-to-PDF). Pulls the
  structurally-protected `targetLanded` so it can never print the 16% net or a bare 65%.
  **Snapshots `calc_inputs` at export time** so a later global-assumption change doesn't diverge from a
  sent RFQ. Excludes `export_ok=false` images.
- **Factory quote import:** `/exports` CSV dropzone → map by `external_ref` → upsert `factory_quotes` →
  margins/PASS-FAIL recompute live app-wide. Import report (matched/unmatched) before commit.
- **General export:** filtered CSV/Excel of any view, same URL params as the UI.

---

## 13. Correctness & testing (the must-not-break list)

1. Calculator unit tests (target landed, net≈16% not 65%, PASS/headroom signs, divide-by-zero, live
   column) — written **before** the UI.
2. Importer mapper unit tests against the real on-disk fixtures; line-namespaced `external_ref`.
3. RLS ↔ UI capability integration tests — each role against each editable field.
4. RFQ export: no flagged images, `calc_inputs` snapshot, target-landed (not net) on the sheet.
5. Data-quality gates: 220V annotated, wrong-product image blocked from export.

---

## 14. Phased delivery

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Correctness spine** | Calculator TS module + tests; idempotent importer + data-cleaning + path fix; dedicated Supabase project; schema + RLS from the capability map; magic-link auth + 2 memberships. | Calc tests green; both roles log in; importer dry-run diff correct; RLS write-gate tests pass. |
| **1 — Storefront + economics** | Import all 152 products + images; `/catalog` (grid+table, URL state); rich PDP + peek; Deal Panel + waterfall + PASS lamp; calculator (global + per-product); editable `/products` list; dashboard; shared `/pipeline`; Keepa enrichment (discovery + by-ASIN). | Every product has a rich PDP w/ graceful photo states; partner sets target sell → target landed computes live; owner enters quote → PASS/FAIL flips in real time on PDP, list, and dashboard; global cost-stack change ripples; competitor mini-pages populate. |
| **2 — RFQ + cockpit** | Factory RFQ Excel+PDF export (previewable, snapshotted, image-embedded); quote-import round-trip; comparison `/board`; ⌘K palette + saved views; Realtime as additive sync. | RFQ round-trip verified (export Pursue set → import returned quotes → live margins); board triages all SKUs by the number. |
| **3 — Polish & scale** | Dark cockpit (token-driven); tier-based FBA-fee toggle (needs carton dims/weight); per-product spec-sheet PDF; multi-partner/org scaling; daily-digest email; competitor source swap option (Rainforest/ScraperAPI) if the literal "bought last month" is wanted. | Dark mode ships without touching storefront; tier-FBA unit-tested; org scaling proven by adding a 2nd partner in a test project. |

---

## 15. Open items

- Confirm the production subdomain/domain for Netlify + the Supabase auth redirect URL and custom email
  sender (needed before invites work).
- Confirm Keepa account/API key provisioning when we reach the enrichment step.
- Decide whether foodservice (Greenway) should appear in the Amazon-style competitor flow at all
  (recommend: no — it's B2B; show its Actual cost, skip Amazon competitors).
- Per-export "send quotes to" header text for the RFQ (kept neutral/blank by default).

---

## 16. AI layer (Claude API)

Full spec in **`AI_LAYER.md`**. Summary: the Anthropic API runs server-side (`ANTHROPIC_API_KEY` in
Netlify env), results cached in our DB. The competitor pipeline is **discover (Claude + web-search tool,
grounded real ASINs) → verify (Haiku structured judge, gates candidates before the UI) → enrich (Keepa) →
human reject-with-reason → learns into the search profile**. Adds three tables/columns to §6:
`search_profiles` (versioned per-product search recipe), `competitor_feedback` (reject reasons that feed
the loop), and `competitors.{status, match_confidence, match_reason, source}`. Models: Haiku 4.5 for
verification, Sonnet 4.6 for discovery/copy, Opus 4.8 where reasoning is hard. Other AI functions
(spec/copy cleanup, taxonomy, vision image QA, RFQ narrative, NL catalog search) are menu items in
`AI_LAYER.md` §3 — to be scoped.
