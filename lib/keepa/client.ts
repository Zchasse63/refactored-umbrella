/**
 * Keepa client — competitor metrics by ASIN. Server-only (uses KEEPA_API_KEY).
 * Full spec: KEEPA_INTEGRATION.md. Authoritative response schema = keepacom/api_backend
 * (Product.java / Stats.java). We read current values off `stats.current` (CsvType-indexed)
 * so we never decode raw price history.
 */
const KEEPA_BASE = "https://api.keepa.com";
const DOMAIN_US = 1;

/** CsvType indices we depend on (prices in cents; -1 = no value). */
const CsvType = { AMAZON: 0, NEW: 1, SALES: 3, RATING: 16, COUNT_REVIEWS: 17 } as const;

export interface KeepaStats {
  current: number[];
}
export interface KeepaProduct {
  asin: string;
  title: string | null;
  brand: string | null;
  imagesCSV: string | null;
  monthlySold: number | null; // real "bought past month"; null when Amazon doesn't show it
  salesRankReference: number;
  salesRanks?: Record<string, number[]>;
  stats?: KeepaStats;
}
export interface KeepaResponse {
  products: KeepaProduct[];
  tokensLeft: number;
  refillIn: number;
  refillRate: number;
  tokensConsumed: number;
}

function keyOrThrow(): string {
  const k = process.env.KEEPA_API_KEY;
  if (!k) throw new Error("KEEPA_API_KEY is not set");
  return k;
}

/** Fetch up to 100 ASINs in one call. `stats` is free; no `offers` (cheapest). */
export async function getKeepaProducts(asins: string[]): Promise<KeepaResponse> {
  if (asins.length === 0)
    return { products: [], tokensLeft: 0, refillIn: 0, refillRate: 0, tokensConsumed: 0 };
  if (asins.length > 100) throw new Error("Keepa /product accepts max 100 ASINs per request");
  const url = new URL(`${KEEPA_BASE}/product`);
  url.searchParams.set("key", keyOrThrow());
  url.searchParams.set("domain", String(DOMAIN_US));
  url.searchParams.set("asin", asins.join(","));
  url.searchParams.set("stats", "30");
  url.searchParams.set("rating", "1");
  url.searchParams.set("history", "0");
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Keepa ${res.status}: ${await res.text()}`);
  return (await res.json()) as KeepaResponse;
}

const cents = (v?: number) => (v != null && v >= 0 ? v / 100 : null);

export interface CompetitorUpsert {
  asin: string;
  title: string | null;
  brand: string | null;
  marketplace: "amazon";
  retail_url: string;
  price: number | null;
  currency: "USD";
  rating: number | null;
  review_count: number | null;
  bsr: number | null;
  est_monthly_sales: number | null;
  monthly_sales_source: string;
  image_url: string | null;
  source: "keepa";
}

export function mapKeepaToCompetitor(p: KeepaProduct): CompetitorUpsert {
  const cur = p.stats?.current ?? [];
  const price = cents(cur[CsvType.AMAZON]) ?? cents(cur[CsvType.NEW]);
  const rating = cur[CsvType.RATING] >= 0 ? cur[CsvType.RATING] / 10 : null;
  const reviews = cur[CsvType.COUNT_REVIEWS] >= 0 ? cur[CsvType.COUNT_REVIEWS] : null;
  const bsr = cur[CsvType.SALES] >= 0 ? cur[CsvType.SALES] : null;
  const image = p.imagesCSV ? `https://m.media-amazon.com/images/I/${p.imagesCSV.split(",")[0]}` : null;
  return {
    asin: p.asin,
    title: p.title,
    brand: p.brand,
    marketplace: "amazon",
    retail_url: `https://www.amazon.com/dp/${p.asin}`,
    price,
    currency: "USD",
    rating,
    review_count: reviews,
    bsr,
    est_monthly_sales: p.monthlySold ?? null,
    monthly_sales_source: p.monthlySold != null ? "keepa:monthlySold" : "keepa:bsr-estimate",
    image_url: image,
    source: "keepa",
  };
}
