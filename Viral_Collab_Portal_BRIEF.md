# Build Brief — Yuno × Viral Sourcing Collaboration Portal

> **How to use this file:** Paste the "PROMPT TO START" block below into a fresh Claude Code session
> (in a new project folder for the web app). Then have it read the rest of this document as the spec.
> Written with full context of the Yuno appliance catalog work — asset paths and data shapes are real
> and ready to import.

---

## ▶ PROMPT TO START (paste this)

> I'm building a **two-sided sourcing collaboration web app** ("the Portal") that my partner and I both
> log into. I source products factory-direct (small kitchen appliances + foodservice packaging); my
> partner runs an Amazon/marketplace business and will pick the best prospects and set a **target landed
> cost** for each so I can negotiate with the factory. **We are full partners and share all data,
> including true costs — nothing is hidden between us.**
>
> Read `Viral_Collab_Portal_BRIEF.md` in full — it's the complete spec (users, workflows, the
> transparent unit-economics model, the real-time target-cost calculator, import/export reporting, data
> model, data sources with exact file paths, and a phased plan).
>
> Do **not** start coding yet. First:
> 1. Run the `feature-dev:code-architect` agent to turn this brief into an implementation blueprint.
> 2. Confirm the short "Decisions to confirm" list at the end.
> 3. Propose Phase 1 scope and build it (Next.js + Supabase, dedicated new DB), reviewing each phase
>    with `feature-dev:code-reviewer`.

---

## 1. Mission

A private, invite-only web app where **two partners collaborate to pick and price products** for an
Amazon/retail launch:

- **Owner side (Zach — Yuno / Servous):** load products with all specs/images/info, and attach
  competitor/"similar" products for reference. Enter factory quotes; run RFQ exports.
- **Partner side (Viral Distributors):** browse everything, shortlist favorites / best prospects, set a
  **target sell price** and **target landed cost** per product (with a live calculator), and add notes.

The point: **convert the partner's Amazon market knowledge into target landed costs to take to the
factory.** Appliances have *no* cost today; this is how we generate the number to negotiate against.
**This is a transparent partnership — both sides see everything, including real costs and quotes.**

## 2. Background & players

- **Zach:** runs **Yuno Group USA** (sources appliances factory-direct from **Rong Dian Group /
  RoyalStar**; beauty sub-brand **MKS**) and **Servous** (foodservice packaging; vendor **Greenway**).
  Has a full appliance catalog already built (decks, spreadsheets, structured JSON + images) and a
  **Servous Supabase database** with real pricing/cost/competitor data for Greenway.
- **Partner (Viral Distributors, viraldistributors.com):** B2B distribution + sets up/operates Amazon
  marketplace presence for brands. Positioning: "data-backed product selection guided by retail
  activity," 1,200+ vetted manufacturers; categories incl. **Home & Kitchen, Electronics, Tools,
  Patio/Lawn**. Normally they handle everything; here we're **partnering** (shared workspace), not
  vendor↔client.
- **Starting product set:** the **appliances** (already built, ~127 products) + **Greenway** foodservice
  items from Servous.

## 3. The core problem (design everything around this)

Zach has actual costs only on Servous/Greenway. The appliances have **zero costs** — and the way to get
them is to bring the factory a **target landed cost** and negotiate. The partner knows what a product can
sell for on Amazon, so the Portal captures that and turns it into a target cost (see calculator, §10).

## 4. Users & roles

- **Owner** (Zach): full CRUD on products, competitors, costs, quotes, statuses; runs imports/exports.
- **Partner** (Viral): read everything (incl. real costs); create/update selections (shortlist, prospect
  tier, target sell, target landed, notes); can run the calculator and exports.
- **No data is gated between the two roles.** Role differences are about *who edits what* (e.g., owner
  enters factory quotes; partner sets target costs), not visibility.
- Build for **2 users now**, but model roles/orgs so more partners or product lines can be added later.

## 5. Primary workflows

1. **Owner loads a product** → name, line/category, brand, specs, features, images, known pricing
   (and `our_cost` if known, e.g. Greenway) + attaches **N competitor/similar products** (prices,
   marketplace links, ratings).
2. **Partner researches** → filters catalog, opens a product, reviews competitors, sets **prospect tier**
   (Pursue / Maybe / Pass), **target sell price**, **target landed cost** (via §10 calculator), notes.
3. **Owner gets costs** → dashboard of "Pursue" items with target landed costs → **RFQ export** to send
   the factory → enters returned **factory quote(s)** → live margin (quote vs target) for both to see.
4. **Shared pipeline** → status board both see: `New → Shortlisted → Costing → Quoted → Decision
   (Go / Hold / Pass)`.

## 6. Features

**MVP (Phase 1):**
- Invite-only auth, 2 roles (owner, partner) — but all data visible to both.
- Product catalog: grid + detail; filter by line (Appliances / Beauty / Foodservice), category, brand;
  search; image gallery; specs table; feature bullets.
- Competitor/"similar products" per product (owner-managed): title, brand, price, marketplace URL,
  rating, reviews, image, optional BSR.
- Partner selection per product: prospect tier, target sell, target landed, priority, notes.
- **Transparent unit-economics panel** per product (§9) with Target / Quoted / Actual landed.
- **Real-time target-cost calculator** (§10) — global defaults + per-product overrides.
- Owner dashboard: all selections + target costs; shared status/Kanban pipeline.
- **Import / export & reporting** (§11) — incl. the **Factory RFQ export**.

**Phase 2:**
- Competitor **auto-enrichment** for appliances (Amazon via Rainforest API or Keepa — official APIs,
  ToS-compliant; no raw scraping). Each appliance carries search terms + Amazon category.
- Factory quote tracking: multiple quotes/revisions per product, MOQ + lead time, margin history.
- Accurate **size/weight-tier FBA fee** mode in the calculator (toggle).
- Activity feed / comments; notify (email/Slack) when partner shortlists something.

**Phase 3:**
- Multiple partners / product lines / "projects"; real-time presence (Supabase Realtime);
  per-product Yuno-branded spec-sheet PDF export; drag-a-file bulk import UI.

## 7. Data model (starting point — refine in architecture)

- **users / memberships** — Supabase auth users + role (`owner` | `partner`). All rows readable by both.
- **products** — `id, line (appliance|beauty|foodservice), category, subsection, name, brand,
  source (Yuno/RoyalStar/MKS/Greenway), model, specs (jsonb), features (text[]), msrp,
  our_cost, our_cost_source, status, external_ref (slug/id from source catalog)`.
- **product_images** — `product_id, url (Supabase Storage), is_primary, sort`.
- **competitors** — `product_id, title, brand, marketplace (amazon|walmart|other), retail_url, asin,
  price, currency, rating, review_count, bsr, image_url, notes` (works for Amazon listings AND B2B
  competitor SKUs; for Greenway, import from Servous `competitor_prices`).
- **selections** — `product_id, partner_user_id, tier (pursue|maybe|pass), priority,
  target_sell_price, target_landed_cost, calc_inputs (jsonb), notes, updated_at`.
- **factory_quotes** — `product_id, landed_cost_ddp, moq, lead_time_days, quote_date, supplier, notes`
  (landed/DDP only — no FOB; multiple per product; latest/selected feeds live margin).
- **assumptions** — global default cost-stack settings (one row, editable) + optional per-product
  overrides stored in `selections.calc_inputs`.
- **pipeline_status** — `product_id, status, updated_by`.
- **comments / activity** — `product_id, user_id, body, created_at`.

Use `jsonb` for `specs` and `calc_inputs`; keep `external_ref` so re-imports update rather than duplicate.

## 8. Data sources & initial load (all real, ready now)

**Appliances + beauty — already built, just import** (from `/Users/zach/Desktop/Appliances/beauty/`):
- `catalog/beauty_catalog_final.json` — **57 beauty/personal-care products** (name, model, section,
  specs[], selling_points[], image_quality, final_image path).
- `catalog/website_catalog_final.json` — **70 RoyalStar appliances** (name, group, subsection, specs[],
  features[], image, source url).
- Images: `assets/final_opt/<id>.jpg` (beauty), `assets/web_final_opt/<slug>.jpg` (appliances) → upload
  to Supabase Storage.
- Reference masters: `output/Yuno_Beauty_Personal_Care_Master.xlsx`,
  `output/Yuno_RoyalStar_Appliances_Master.xlsx`; two PDF catalogs in `output/`.
- Image-quality flags already computed ("pro photo needed") — carry them over.

**Foodservice (Greenway) — from the Servous Supabase DB:**
- Use the **`servous-database` skill** (source of truth) to pull Greenway: company, `products`,
  `vendor_costs` (→ `our_cost`, with source), `competitor_prices` (→ `competitors`). Start Greenway-only;
  design so other vendors can be added.

**Calculator logic — reuse:** `/Users/zach/Desktop/Appliances/fba_calc.py` (full logic in §10).

## 9. Transparent unit-economics model (the cost picture)

All money is shared. Each product shows a **live P&L waterfall** with three landed-cost columns so
negotiation progress is obvious:

```
Target sell price (e.g. $40.00)
  − Amazon variable opex (49% default)      −$19.60
  − Landed cost   [ Target $14.00 | Quoted $12.50 | Actual — ]
  = Net / unit    [ $6.40  16%   | $7.90  20%   |  —  ]
```

- **Target landed** = output of the calculator (the negotiation goal).
- **Quoted landed** = from `factory_quotes` (owner enters; appliances start empty).
- **Actual landed** = booked real cost (Greenway has it from Servous; appliances once sourced).
- Live margin uses **Quoted if present, else Actual if known, else Target.** Show all three.

## 10. Real-time target-cost calculator (port of `fba_calc.py`)

**Cost stack (defaults, all editable):** referral 15% + ads 15% + FBA logistics 15% + returns 4% =
**49% variable opex** of price; **target gross margin 65% → landed cost ≤ 35% of price.**
*(No agency/brokerage fees — the old 3% commission + $100/SKU/mo flat fee were from a different
brokerage we've dropped. The Yuno↔Viral partnership economics aren't defined yet, so model the cost
stack as a flexible list of line items and leave room to add a "partner split" line later.)*

**Formulas:**
- `target_landed_cost = (1 − gross_margin) × sell_price`  (default → 35% of price) — **this is a
  landed / DDP cost** (factory delivers duty-paid to the US). It is the single number we negotiate;
  there is no FOB / freight / duty breakout (we don't source on FOB terms).
- `net_per_unit = sell − landed − opex`  (≈16% of price at the ceiling, with the 49% opex default)
- **Quote-check:** `gross_margin = (sell − quoted_landed)/sell`, PASS if ≥ target; `headroom =
  target_landed − quoted_landed`

> Terminology note for the UI: "65% gross margin" = COGS-vs-price (landed ≤35%). The 49% opex is
> separate, so **net ≈16%, not 65%.** Label clearly so it's never misread.

**Adjustability (this is a requested feature — make it live):**
- **Global assumptions** Settings panel: the cost-stack line items (%s) + target margin. Change once →
  all products recompute.
- **Per-product overrides:** any product can override any assumption + its sell price; saved in
  `selections.calc_inputs`.
- **Live output:** recompute on every keystroke/slider — target landed (DDP), net $/unit, net %; if a
  quote is entered, instant PASS/FAIL + headroom.
- **Accuracy toggle (Phase 2):** replace "15% of price" FBA with a **size/weight-tier FBA fee** (needs
  product weight + dims).

## 11. Import / export & reporting (first-class)

- **Factory RFQ export (headline use case):** filter products (e.g. all "Pursue", or a category) →
  one-click **Excel + PDF** with name, model, specs, image, **target landed cost (DDP)**, MOQ ask,
  target sell price, competitor reference prices, notes → send to the factory for quotes.
- **Factory quote import:** upload/paste returned quotes (CSV) → populates `factory_quotes` → margins
  recompute live against target.
- **General export:** filtered CSV/Excel of any view (catalog, selections, pipeline) with chosen columns.
- **Bulk product import:** CSV/JSON to re-import catalogs or add new lines (idempotent via `external_ref`).
- **Per-product spec sheet:** Yuno-branded PDF export (Phase 2/3).

## 12. Tech stack, security & architecture

- **Next.js (App Router, TypeScript) + Tailwind + shadcn/ui**; **Supabase** (Postgres + Auth + Storage +
  optional Realtime). Deploy **Vercel or Netlify** on a subdomain.
- **Dedicated NEW Supabase project** for the Portal (confirmed) — do **not** reuse the Servous project.
  Import Greenway one-way from Servous via the skill. (Isolation/operational cleanliness, not secrecy.)
- **Auth:** Supabase Auth email magic-link, invite-only; no public signup.
- **RLS:** both roles can read all app data (transparent); RLS governs *writes* (e.g., only owner writes
  factory quotes; partner writes their own selections). See supabase-best-practices skill.
- Images via signed URLs or a product-images bucket; any 3rd-party API keys (Rainforest/Keepa) server-side.

## 13. Decisions to confirm with Zach

1. **Greenway scope:** all Greenway SKUs or a subset? Any other Servous vendors at launch?
2. **Calculator in MVP** (recommended — it's the core value) vs Phase 2?
3. **Competitor data for appliances:** start manual, or budget for Rainforest/Keepa in Phase 1?
4. **Branding:** Yuno, neutral, or co-branded with Viral (true partnership)?
5. **Hosting/domain:** Vercel vs Netlify; subdomain/URL?
6. **Prospect tiers:** "Pursue / Maybe / Pass" vs 1–5 score vs both?
7. **Notifications:** email/Slack when partner shortlists, or in-app only for now?
8. **Default cost-stack assumptions:** current = **49% opex** (referral 15 / ads 15 / FBA 15 / returns 4)
   + **65% gross margin**. All costs are **landed / DDP** (no FOB/freight/duty — we don't source FOB).
   Agency/brokerage fees removed; the Yuno↔Viral partnership economics are **TBD** (add a cost line once
   defined). Confirm or update these numbers.

## 14. Suggested first-session sequence

0. Confirm §13.
1. `feature-dev:code-architect` → blueprint (files, schema, RLS, routes, components, calculator module).
2. Scaffold Next.js + dedicated Supabase; auth + roles; schema + RLS migrations.
3. Importer: load the two appliance JSONs + upload images (idempotent via `external_ref`).
4. Catalog browse + detail + filters/search; competitor section.
5. Partner selection + calculator + unit-economics panel; owner dashboard; status pipeline.
6. Import/export (Factory RFQ export + quote import) — verify the RFQ round-trip.
7. Import Greenway from Servous.
8. `feature-dev:code-reviewer` each phase; then Phase 2 (competitor enrichment, quote history, tier FBA fees).

## 15. Appendix — asset inventory (paths)

```
/Users/zach/Desktop/Appliances/
├── beauty/catalog/beauty_catalog_final.json        # 57 beauty products (specs, features, image paths)
├── beauty/catalog/website_catalog_final.json       # 70 RoyalStar appliances
├── beauty/assets/final_opt/<id>.jpg                # beauty product images (optimized)
├── beauty/assets/web_final_opt/<slug>.jpg          # appliance product images (optimized)
├── beauty/output/Yuno_Beauty_Personal_Care_Master.xlsx
├── beauty/output/Yuno_RoyalStar_Appliances_Master.xlsx
├── beauty/output/*.pdf                             # the two Yuno-branded catalogs
└── fba_calc.py                                     # FBA/landed-cost math (logic detailed in §10)
# Servous/Greenway: via the `servous-database` skill (Supabase) — companies, products,
#   vendor_costs (→ our_cost), competitor_prices (→ competitors)
```
