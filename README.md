# The Portal

Private, invite-only, two-sided sourcing-collaboration app. Neutral / unbranded. Two equal partners:
the **owner** sources factory-direct and enters quotes; the **partner** sets a target sell price and,
via a live calculator, a **target landed cost (DDP)** — the number taken to the factory to negotiate.

**🌐 Live:** https://the-portal-sourcing.netlify.app
**Repo:** https://github.com/Zchasse63/refactored-umbrella (push to `main` → auto-deploys via GitHub Actions → Netlify)

Built to the plan in `BUILD_PLAN.md`, `DESIGN_GUIDE.md`, `KEEPA_INTEGRATION.md`, `AI_LAYER.md`.

## What works (deployed + tested)

- **Auth** — Supabase email/password + magic-link, invite-only (two seeded accounts), middleware-gated,
  membership-checked, role badge + sign-out.
- **Catalog** (`/catalog`) — 127 real products from Supabase; faceted search, line tabs, photo-state
  filter, sort; real images + honest photo-state badges.
- **Product page** (`/p/[slug]`) — gallery, specs, at-a-glance, the docked **Deal Panel** with the live
  3-column economics waterfall + PASS/headroom lamp + cost-stack calculator. **Role-gated persistence:**
  the partner saves targets, the owner saves the factory quote — enforced by Postgres RLS.
- **Live AI competitor discovery** — owner clicks "Find competitors": Claude builds a search profile →
  Keepa Product Finder returns real top-selling ASINs → Keepa enriches price/rating/reviews/monthly-sales
  → a Claude judge verifies fit → verified matches render as competitor mini-cards.
- **Editable list** (`/products`) — adjust target sell / quote inline, recompute + save on blur.

Verified end-to-end via Playwright on production: auth gating, both-role login, role-gated editing,
RLS-enforced persistence (confirmed in DB), live calculator, search, **0 console errors**, and a live
competitor discovery run returning real Cosori/OVENTE kettle data.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in (the real values are already in .env.local on this machine)
npm run dev                  # http://localhost:3000
npm test                     # 18 unit tests (calculator + importer)
npm run build                # type-checks + builds
```

## Architecture

```
app/                  App Router — (auth) login/no-access, (app) catalog/products/p/[slug], api/admin/seed, auth/callback, actions.ts (server actions)
middleware.ts         Supabase session + route guard (Netlify Edge)
components/           ui · economics (waterfall + live calculator) · catalog · product · competitor · shell · auth
lib/
  calc/economics.ts   calculator — clean rewrite of fba_calc.py (agency fees removed), unit-tested
  import/mappers.ts   real-JSON → Product + data-cleaning (220V, photo-state, namespaced refs), unit-tested
  data/queries.ts     Supabase reads (RLS-enforced); fixtures.ts = importer seed source
  supabase/           browser · server · admin · client wiring (@supabase/ssr)
  keepa/              client + Product Finder
  ai/                 Claude verify-judge, search-profile builder, identical-item discovery
  auth/capabilities.ts  the one role-capability map (UI locks + RLS both derive from it)
supabase/migrations/  0001_schema · 0002_rls · 0003_harden  (applied to the project)
.github/workflows/    deploy.yml — test + build + deploy to Netlify on push to main
```

## Seeded accounts (private workspace)

Two accounts exist (owner + partner). Credentials are in `.env.local` (`QA_OWNER_*` / `QA_PARTNER_*`) and
in the Netlify site env — not committed. Rotate them after handoff.

## Handoff notes

- **Magic-link** needs the production URL added to Supabase → Authentication → URL Configuration
  (Site URL + Redirect URLs: `https://the-portal-sourcing.netlify.app/**`). Password login works today
  without it.
- **Re-seed** (idempotent): `POST /api/admin/seed` with header `x-seed-secret: <service-role key>`.
- Enable **Leaked Password Protection** in Supabase Auth (a flagged WARN; one toggle).
- Competitor discovery respects the 20-tokens/min Keepa plan (capped to a few candidates per run);
  near-duplicate variation ASINs can be deduped by parent ASIN in a later pass.
