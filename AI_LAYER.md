# AI layer (Claude API) spec

How the Portal uses the Anthropic Claude API server-side: the competitor discovery → verify → learn loop, plus the other AI functions worth building. Companion to `BUILD_PLAN.md` and `KEEPA_INTEGRATION.md`.

## 1. Posture

- **SDK:** `@anthropic-ai/sdk` (TypeScript), **server-side only** (Next.js route handlers / Netlify functions). Key in Netlify env `ANTHROPIC_API_KEY` — never shipped to the browser.
- **Cached, not live-on-render.** Every AI result is written to our DB (with a timestamp). The UI reads our tables; Claude runs on import, on a schedule, or on an explicit "re-run" click — not on every page view.
- **Model choices** (starting points; all current as of 2026):

| Job | Model | Why |
|---|---|---|
| Match **verification** (high-volume structured judge) | `claude-haiku-4-5` ($1/$5 per MTok) | Cheap, fast, supports structured outputs. ~hundreds of calls/refresh = cents. |
| Finder **query construction** + **identical-item** web search | `claude-sonnet-4-6` ($3/$15) | Sonnet builds the Keepa Finder selection from specs and runs the `web_search_20260209` identical-item pass (web search needs Sonnet 4.6 / Opus 4.x). Primary discovery itself is Keepa Product Finder — no Claude tokens. |
| Spec/copy **cleanup**, taxonomy, RFQ narrative | `claude-sonnet-4-6` | Quality matters, volume is low (one pass per product). |
| Hardest reasoning (negotiation strategy, ambiguous calls) | `claude-opus-4-8` ($5/$25) | Only where depth pays off. |

**Cost at our scale is negligible** — ~152 products, a few hundred calls per refresh, mostly Haiku/Sonnet → low single-digit dollars per month.

## 2. The competitor pipeline: discover → verify → enrich → learn

This is the loop Zach asked for — verify the matches *before* they hit the UI, then let a human reject with a reason that **improves the next search**. **Design principle: get ASINs and metrics from Keepa's structured Amazon catalog (authoritative, real, rankable by actual sales); use Claude only where judgment beats data (query construction, category choice, fit verification). Reserve web search for the one thing Keepa can't do — finding the *identical* factory item already listed elsewhere, and brand-new items not yet indexed.**

```
[0] RESOLVE CATEGORY  Keepa search_for_categories(keywords) → real category-node options
                      → Claude picks the best-fit node (from real options, never invents)   [cached per product]
[1] BUILD QUERY       Claude (Sonnet): specs + learned exclude_terms → a Keepa Finder selection
                      (category node, title keywords, price band, SORT BY monthlySold desc), versioned
[2] DISCOVER — grounded, two sources:
     • PRIMARY   Keepa Product Finder (POST /query, asinsOnly:true) → ~20-30 real TOP-SELLING ASINs in-niche
     • SECONDARY Claude web_search → the IDENTICAL item (search by model# + standout spec) if a competitor
                 already lists the same factory product; also catches viral-new items Keepa hasn't indexed
[3] VERIFY            Claude judge (Haiku, structured): { is_match, confidence, reason, flags[] }
                      drop accessories/bundles/wrong-size BEFORE the UI; (+ vision: compare images for identical-item)
[4] ENRICH           Keepa /product (batched 100/call) → price, rating, reviews, BSR, monthlySold, image
[5] SURFACE          competitor mini-pages (status: candidate / approved)
[6] LEARN            human "not a fit" + reason → competitor_feedback → append exclude_terms to the
                     product's Finder query (version++) → re-run [2]
```

- **Why Keepa Finder is primary, not web search:** Finder queries Amazon's *real* catalog by category + sales rank + `monthlySold` + price simultaneously and returns the genuine top sellers — a true competitive set, not whatever a keyword search surfaces. ASINs are real and current; Claude never invents one (it picks a real node, builds a query, or reads a live page).
- **Step [0] kills the category-mapping risk:** `search_for_categories` returns real node ids by keyword; Claude only *chooses* among them. Cached per product → one-time cost.
- **Step [1] uses past feedback** — accumulated `exclude_terms` from prior rejections make each round smarter ("exclude accessories, exclude <1L, exclude travel mugs").
- **Step [3] is the "verify on the first go" gate** — nothing reaches the UI as "approved" unless the judge clears it; borderline → "needs review."
- **Step [6] closes the loop** — a reject isn't just a delete; the structured reason feeds [1].
- **Caveats handled:** Keepa coverage is broad but not 100% → web-search pass + manual-add cover the tail; `monthlySold` null for many ASINs → fall back to a BSR-derived volume signal; Finder costs tokens only on a fresh collection → cache + refresh the Pursue set on a schedule.

### Schema additions (added to `BUILD_PLAN.md` §6)

- **`search_profiles`** — `id, product_id (unique), query text, include_terms text[], exclude_terms text[], category_hint text, version int, updated_by, updated_at`. The versioned, learning search recipe per product.
- **`competitor_feedback`** — `id, competitor_id, product_id, user_id, verdict ('good_fit'|'not_a_fit'), reason_code text, reason_text text, created_at`. Feeds the loop.
- **`competitors` gains** — `status ('candidate'|'approved'|'rejected'), match_confidence numeric, match_reason text, source ('claude'|'manual'|'keepa')`.

### Code sketch — the verification judge (structured output)

`lib/ai/verifyCompetitor.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const Verdict = z.object({
  is_match: z.boolean(),
  confidence: z.number(),                 // 0..1
  reason: z.string(),
  flags: z.array(z.string()),             // e.g. ["accessory", "wrong_capacity", "bundle"]
});

export async function verifyCompetitor(ourProduct: string, candidate: string) {
  const res = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content:
        `OUR PRODUCT:\n${ourProduct}\n\nCANDIDATE COMPETITOR (from Amazon):\n${candidate}\n\n` +
        `Is the candidate a true like-for-like competitor a buyer would cross-shop? ` +
        `Reject accessories, bundles, wrong size/capacity, or different use. Be strict.`,
    }],
    output_config: { format: zodOutputFormat(Verdict) },
  });
  return res.parsed_output!; // { is_match, confidence, reason, flags }
}
```

### Code sketch — primary discovery (Keepa Product Finder)

`lib/keepa/productFinder.ts` — the authoritative source for the competitive set:

```ts
const KEEPA_BASE = "https://api.keepa.com";

/** POST /query — search Keepa's tracked Amazon catalog by structured filters; returns real ASINs. */
export async function keepaFinder(selection: {
  categories_include?: number[];   // category node ids from search_for_categories
  title?: string;                  // keyword(s)
  current_AMAZON_gte?: number;     // price band in cents
  current_AMAZON_lte?: number;
  monthlySold_gte?: number;
  sort?: [string, "asc" | "desc"][]; // e.g. [["monthlySold","desc"]]
  perPage?: number; page?: number;
}): Promise<string[]> {
  const url = new URL(`${KEEPA_BASE}/query`);
  url.searchParams.set("key", process.env.KEEPA_API_KEY!);
  url.searchParams.set("domain", "1");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...selection, asinsOnly: true }), // asinsOnly → cheap, just the ASINs
  });
  if (!res.ok) throw new Error(`Keepa finder ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { asinList: string[] };
  return data.asinList ?? [];
}
```

> Claude (Sonnet) builds the `selection` object from specs (step [1]); the ASINs it returns are **real Keepa catalog entries**, ranked by `monthlySold`. They then go straight to verify (step [3]) and enrich (step [4]).

### Code sketch — secondary discovery (identical-item via web search)

Only for finding the *exact same* factory product if it's already on Amazon (and the brand-new tail):

```ts
// Claude (Sonnet) with web_search_20260209, prompted to search by MODEL NUMBER + standout spec,
// return only the ASIN(s) of a genuinely identical product seen on a live /dp/ page — or none.
// Same web_search call shape as before; scoped to identical-item, not the whole competitive set.
```

## 3. AI functions worth building (the "what are we overlooking" answer)

| # | Function | What it does | Recommendation |
|---|---|---|---|
| 1 | **Search-profile generation** | specs → Amazon query + include/exclude terms | **Phase 1** (core — part of the loop) |
| 2 | **Grounded competitor discovery** | web-search tool → real candidate ASINs | **Phase 1** (core) |
| 3 | **Match verification** | structured judge gates candidates before the UI | **Phase 1** (core — Zach's ask) |
| 4 | **Feedback learning loop** | reject-with-reason → improved profile | **Phase 1** (core) |
| 5 | **Spec & copy cleanup** | rewrite machine-translated/Chinese-text selling points into crisp US English; flag 220V; normalize spec labels/units | **Phase 1–2** (recommended — directly fixes the data-quality landmines) |
| 6 | **Taxonomy normalization** | consistent categories; map to Amazon browse nodes for better discovery | **Phase 2** (recommended) |
| 7 | **Vision image QA** | Claude vision auto-detects wrong-product / foreign-text / lifestyle images on new uploads, sets `export_ok` | **Phase 2** (optional) |
| 8 | **RFQ narrative + negotiation summary** | drafts the factory cover note; per-product "market sits $25–45, target $40 is at the high end — justify with X" | **Phase 2** (optional) |
| 9 | **Natural-language catalog search** | ⌘K: "kettles under $30 target landed with a quote" → filter state | **Phase 3** (nice-to-have) |

**FINAL SCOPE (confirmed 2026-06-25):** IN — 1–4 (competitor loop), 5 (spec & copy cleanup), 6 (taxonomy
normalization), 7 (vision image QA). DEFERRED — 8 (RFQ narrative/negotiation summary; the RFQ export
still ships, just without auto-drafted market blurbs — can add later), 9 (NL catalog search; Phase-3
nice-to-have).

## 4. Notes

- **Verification is the cheapest insurance.** A Haiku judge over a few hundred candidates costs cents and stops a hallucinated or accessory ASIN from ever reaching a factory-facing RFQ.
- **Everything structured uses `output_config.format` (Zod)** so we get validated objects, not parsed strings.
- **Keep prompts cached** where prefixes are stable (the verification system instruction is identical every call) to cut cost further.
- **Server-tool errors don't throw** — a `web_search_tool_result` can carry an error object; handle it before reading results.
