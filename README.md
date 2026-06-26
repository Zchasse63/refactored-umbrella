# The Portal

Private, invite-only, two-sided sourcing-collaboration app. Neutral / unbranded. Two equal partners:
the **owner** sources factory-direct and enters quotes; the **partner** sets a target sell price and,
via a live calculator, a **target landed cost (DDP)** — the number taken to the factory to negotiate.

This repo is built to the plan in `BUILD_PLAN.md`, `DESIGN_GUIDE.md`, `KEEPA_INTEGRATION.md`, and
`AI_LAYER.md`. **Phase 0 (correctness spine) + a runnable front-end are complete and run with NO
database** — the real 127-product catalog is loaded from on-disk fixtures.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000  → /catalog
npm test           # calculator + importer unit tests (18, all green)
npm run build      # type-checks + pre-renders all 127 product pages
```

No environment variables are needed for the fixture-backed UI. Copy `.env.example` → `.env.local` and
fill it in as Supabase / Keepa / Anthropic come online.

## What works today (no DB / Netlify / GitHub)

- **`/catalog`** — faceted browse of the real 70 appliances + 57 beauty products: search, line tabs with
  counts, "needs photo" filter, sort. Real images; honest photo-state badges; economics ribbons.
- **`/p/[slug]`** — a rich product page for every item: gallery, at-a-glance chips, specs, the
  competitor empty-state, and the docked **Deal Panel** with the live 3-column economics waterfall +
  PASS/headroom lamp + the cost-stack calculator (recomputes on every keystroke).
- **`/products`** — the editable cockpit list: adjust target sell / factory quote inline, watch net % and
  PASS/FAIL recompute live.

## Layout

```
app/                         Next.js App Router (storefront vs cockpit registers)
  (app)/catalog | products | p/[slug]
components/                  ui primitives + economics / catalog / product / shell
lib/
  calc/economics.ts(.test)   the calculator — a clean rewrite of fba_calc.py (agency fees removed)
  import/mappers.ts(.test)   real-JSON → Product, with the data-cleaning pass (220V, photo-state, refs)
  data/fixtures.ts           in-memory catalog (swapped for Supabase queries in Phase 1; same shape)
  keepa/                     Keepa client + Product Finder (server, needs KEEPA_API_KEY)
  ai/                        Claude verify-judge, search-profile builder, identical-item discovery
  auth/capabilities.ts       the ONE role-capability map (UI locks + RLS both derive from it)
  types.ts · utils.ts
supabase/migrations/         0001_schema.sql + 0002_rls.sql — ready to apply to the NEW project
public/products/             the 127 real product images
```

## Verified

- Calculator math (target landed, net ≈ 16% not 65%, PASS/headroom, divide-by-zero guard, live-column
  precedence, foodservice opex-skip) — unit-tested.
- Importer data-cleaning on the real fixtures — 70 + 57 mapped; **46** appliances flagged 220V; **45**
  beauty images carry Chinese text; flagged imagery quarantined from exports; line-namespaced
  external_refs unique.

## Next (needs the services you're setting up)

1. **Supabase** (dedicated NEW project): apply `supabase/migrations/*.sql`, wire magic-link auth +
   memberships, swap `lib/data/fixtures.ts` reads for queries, run the importer to seed.
2. **Keepa** (`KEEPA_API_KEY`): wire the competitor discover→verify→enrich loop.
3. **Anthropic** (`ANTHROPIC_API_KEY`): turn on the AI layer (verify judge, search-profile, spec/copy
   cleanup, vision QA).
4. **Netlify + GitHub**: connect the repo, set env vars, deploy on a subdomain.

> Note: `next@14.2.21` has a published advisory — bump to the latest patched `14.2.x` before deploying.
