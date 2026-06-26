# Keepa integration spec

How the Portal wires competitor enrichment to Keepa. Source-of-truth references, the exact request we
make, the field mapping to our `competitors` table, token/cost behavior, and a drop-in TypeScript client.

## 1. Reference docs (there is no official OpenAPI)

Keepa does **not** publish an OpenAPI/Swagger file. The authoritative sources:

- **Official REST docs:** https://keepa.com/#!api (the "Request Products", "Product Object", and token
  sections — single-page app, read in browser).
- **Official schema (the real contract):** https://github.com/keepacom/api_backend —
  `src/main/java/com/keepa/api/backend/structs/Product.java`, `Stats.java`, and the `Product.CsvType`
  enum. These define every field and the `csv`/`stats.current` index order.
- **Python wrapper docs (params map 1:1 to REST query params):**
  https://keepaapi.readthedocs.io/en/stable/api_methods.html

## 2. Auth, base URL, endpoints

- **Base URL:** `https://api.keepa.com`
- **Auth:** `?key=YOUR_API_KEY` on every request. **Server-side only** — never expose the key to the
  browser. Store as a Netlify env var `KEEPA_API_KEY`; all calls go through our `/api/enrich/keepa`
  route (or a server action).
- **Domain:** `domain=1` = Amazon US (`.com`). (1 US, 2 UK, 3 DE, 4 FR, 5 JP, 6 CA, 8 IT, 9 ES, 10 IN,
  11 MX …). We use **1**.

| Endpoint | Use |
|---|---|
| `GET /product` | Enrich by ASIN(s). Up to **100 ASINs** comma-separated per call. This is our main call. |
| `POST /query` | **Product Finder** — search by criteria (title, category, `monthlySold_gte`, sales rank…) → returns matching ASINs. Optional discovery path (§6). |
| `GET /search` | Keyword product search → ASINs. Alternative discovery path. |
| `GET /token` | Check `tokensLeft`, `refillIn` (ms), `refillRate` before a batch. |

## 3. The request we make (enrich by ASIN)

```
GET https://api.keepa.com/product
    ?key=YOUR_API_KEY
    &domain=1
    &asin=B07XL2K8QP,B09MQ4F1RT      # 1..100 comma-separated
    &stats=30                         # adds the stats object (current/min/max/avg). NO extra token cost.
    &rating=1                         # include RATING + COUNT_REVIEWS so we get stars + review count
    &history=0                        # skip the full price-history arrays — smaller response, we only need "current"
```

- **`stats=30`** is the key flag: it returns a `stats.current[]` array of *current* values indexed by
  `CsvType`, so we never decode raw price history. It costs **no extra tokens**.
- **`rating=1`** is required to populate the rating/review-count slots.
- Do **not** pass `offers` or `buybox` (they add token cost); we don't need offer lists.

### Token cost
- ~**1 token per ASIN** for a `/product` call without offers. `stats` is free; `rating` adds no
  meaningful cost.
- `update=0` (force live refresh) can cost **+1 token/ASIN** — only use it when deliberately refreshing
  stale data; otherwise Keepa returns its cached value (fresh enough for competitor reference).
- Our ~500 candidate ASINs ≈ **~500 tokens** per full refresh. On the ~€49 tier (20 tokens/min) that's
  ~25 minutes if run flat-out; batch 100 ASINs/call = 5 HTTP calls. Check `/token` and respect
  `refillIn` between batches.

## 4. Reading the fields (from `stats.current`, indexed by `CsvType`)

`stats.current` is an array; the index is the `CsvType` enum. Prices are **integers in cents**; **`-1`
means "no value"**. The indices we read:

| Field we want | `CsvType` index | Notes |
|---|---|---|
| Amazon price | `current[0]` (AMAZON) | cents; `-1` if none |
| New / marketplace price | `current[1]` (NEW) | cents; fallback when Amazon price is `-1` |
| Sales rank (BSR) | `current[3]` (SALES) | integer rank; category from `salesRankReference` / `salesRanks` |
| Rating | `current[16]` (RATING) | value is stars ×10 → **divide by 10** (45 → 4.5). Needs `rating=1` |
| Review count | `current[17]` (COUNT_REVIEWS) | integer. Needs `rating=1` |

> Full index list is the `Product.CsvType` enum in the official repo — treat that file as the source of
> truth if we ever need more slots. We only depend on 0, 1, 3, 16, 17.

Top-level product fields we use:
- `asin`, `title`, `brand` — direct.
- `monthlySold` — the **real** "bought in past month" count; **`null` for most ASINs** (only set when
  Amazon shows it). Use it when present; otherwise fall back to a BSR-based signal.
- `imagesCSV` — comma-separated image names; first name → image URL (§5).

## 5. Derived values

- **Image URL:** `https://m.media-amazon.com/images/I/${imagesCSV.split(',')[0]}`
- **Listing URL:** `https://www.amazon.com/dp/${asin}`
- **Price (USD):** `(current[0] >= 0 ? current[0] : current[1]) / 100` (null if both `-1`).
- **Rating:** `current[16] >= 0 ? current[16] / 10 : null`
- **Keepa time** (only if we ever read history): `unixMs = (keepaMinutes + 21564000) * 60000`.

## 6. Discovery (finding the competitor ASINs)

**Keepa Product Finder is the PRIMARY discovery mechanism** — it's the most accurate and efficient path
(see `AI_LAYER.md` §2 for the full pipeline). Order of operations:

1. **Resolve category (once, cached):** `search_for_categories(keyword)` → real category-node ids;
   Claude picks the best-fit node from the returned options (never invents one).
2. **Build the selection (Claude/Sonnet):** specs + learned exclude-terms → a Finder `selection`.
3. **Keepa Product Finder (`POST /query`, `asinsOnly: true`):** returns real, current ASINs ranked by
   actual sales. Example selection body:
   ```json
   {
     "title": "electric kettle gooseneck",
     "categories_include": [284507],
     "monthlySold_gte": 100,
     "current_AMAZON_gte": 1500,
     "current_AMAZON_lte": 6000,
     "sort": [["monthlySold", "desc"]],
     "asinsOnly": true,
     "perPage": 30,
     "page": 0
   }
   ```
   Returns `{ asinList: [...] }` (asinsOnly keeps it cheap/small; tokens charged only when a fresh
   collection triggers). Pages are 0-9, up to ~10 each.
4. **Identical-item pass (Claude web_search, secondary):** search by model# + standout spec to find the
   *exact same* factory product if a competitor already lists it (the direct price signal), and to catch
   brand-new items Keepa hasn't indexed. ASINs must come from a live `/dp/` page Claude actually read —
   never model memory.
5. **Verify → enrich:** every candidate (Finder + identical-item) passes the Haiku fit-judge, then the
   survivors go to `/product` (§3) for the authoritative metrics.

This keeps discovery and metrics in one authoritative system (Keepa's real catalog, ranked by sales),
uses Claude only for query construction / category choice / fit verification, and never enriches a
hallucinated ASIN.

## 7. Mapping to our `competitors` table

| `competitors` column | Keepa source |
|---|---|
| `asin` | `product.asin` |
| `title` | `product.title` |
| `brand` | `product.brand` |
| `marketplace` | `'amazon'` |
| `retail_url` | `https://www.amazon.com/dp/${asin}` |
| `price` | derived USD (§5) |
| `currency` | `'USD'` |
| `rating` | `current[16]/10` |
| `review_count` | `current[17]` |
| `bsr` | `current[3]` |
| `est_monthly_sales` | `product.monthlySold` (real) or null |
| `monthly_sales_source` | `'keepa:monthlySold'` or `'keepa:bsr-estimate'` |
| `image_url` | from `imagesCSV` (§5) |
| `enriched_at` | now |

## 8. Drop-in TypeScript client (Phase 1)

`lib/keepa/client.ts`:

```ts
const KEEPA_BASE = "https://api.keepa.com";
const DOMAIN_US = 1;

export interface KeepaStats { current: number[]; } // indexed by CsvType; -1 = none, prices in cents
export interface KeepaProduct {
  asin: string;
  title: string | null;
  brand: string | null;
  imagesCSV: string | null;
  monthlySold: number | null;          // real "bought past month"; null if Amazon doesn't show it
  salesRankReference: number;          // category node id of the main rank (-1 if n/a)
  salesRanks?: Record<string, number[]>;
  stats?: KeepaStats;
}
export interface KeepaResponse {
  products: KeepaProduct[];
  tokensLeft: number;
  refillIn: number;     // ms until next refill
  refillRate: number;   // tokens per minute
  tokensConsumed: number;
}

const CsvType = { AMAZON: 0, NEW: 1, SALES: 3, RATING: 16, COUNT_REVIEWS: 17 } as const;

/** Fetch up to 100 ASINs in one call. Server-side only (uses KEEPA_API_KEY). */
export async function getKeepaProducts(asins: string[]): Promise<KeepaResponse> {
  if (asins.length === 0) return { products: [], tokensLeft: 0, refillIn: 0, refillRate: 0, tokensConsumed: 0 };
  if (asins.length > 100) throw new Error("Keepa /product accepts max 100 ASINs per request");
  const url = new URL(`${KEEPA_BASE}/product`);
  url.searchParams.set("key", process.env.KEEPA_API_KEY!);
  url.searchParams.set("domain", String(DOMAIN_US));
  url.searchParams.set("asin", asins.join(","));
  url.searchParams.set("stats", "30");
  url.searchParams.set("rating", "1");
  url.searchParams.set("history", "0");
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Keepa ${res.status}: ${await res.text()}`);
  return res.json() as Promise<KeepaResponse>;
}

const cents = (v?: number) => (v != null && v >= 0 ? v / 100 : null);

export interface CompetitorUpsert {
  asin: string; title: string | null; brand: string | null;
  marketplace: "amazon"; retail_url: string;
  price: number | null; currency: "USD";
  rating: number | null; review_count: number | null; bsr: number | null;
  est_monthly_sales: number | null; monthly_sales_source: string;
  image_url: string | null;
}

export function mapKeepaToCompetitor(p: KeepaProduct): CompetitorUpsert {
  const cur = p.stats?.current ?? [];
  const price = cents(cur[CsvType.AMAZON]) ?? cents(cur[CsvType.NEW]);
  const rating = cur[CsvType.RATING] >= 0 ? cur[CsvType.RATING] / 10 : null;
  const reviews = cur[CsvType.COUNT_REVIEWS] >= 0 ? cur[CsvType.COUNT_REVIEWS] : null;
  const bsr = cur[CsvType.SALES] >= 0 ? cur[CsvType.SALES] : null;
  const image = p.imagesCSV ? `https://m.media-amazon.com/images/I/${p.imagesCSV.split(",")[0]}` : null;
  return {
    asin: p.asin, title: p.title, brand: p.brand,
    marketplace: "amazon", retail_url: `https://www.amazon.com/dp/${p.asin}`,
    price, currency: "USD", rating, review_count: reviews, bsr,
    est_monthly_sales: p.monthlySold ?? null,
    monthly_sales_source: p.monthlySold != null ? "keepa:monthlySold" : "keepa:bsr-estimate",
    image_url: image,
  };
}
```

## 9. Operational notes

- **Provisioning:** subscribe at https://keepa.com/#!api, copy the API key → Netlify env `KEEPA_API_KEY`.
- **Rate limiting:** before a batch, optionally `GET /token`; if `tokensLeft < asins.length`, wait
  `refillIn` ms or process in chunks of `refillRate`.
- **Refresh cadence:** re-enrich the Pursue set weekly/monthly (a scheduled job); `enriched_at` drives a
  "stale" badge. Don't pass `update=0` unless intentionally forcing live data (extra token).
- **Field availability:** `monthlySold`, `rating`, and `review_count` can be null per ASIN — the UI must
  render "—" gracefully (consistent with the Deal Panel's em-dash rule).
```
