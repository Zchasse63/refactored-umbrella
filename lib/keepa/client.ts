/**
 * Keepa client — competitor metrics by ASIN. Server-only (uses KEEPA_API_KEY).
 * Full spec: KEEPA_INTEGRATION.md. Authoritative response schema = keepacom/api_backend
 * (Product.java / Stats.java). We read current values off `stats.current` (CsvType-indexed)
 * so we never decode raw price history.
 */
const KEEPA_BASE = "https://api.keepa.com";
const DOMAIN_US = 1;

/** CsvType indices we depend on (prices in cents; -1 = no value). */
const CsvType = { AMAZON: 0, NEW: 1, SALES: 3, RATING: 16, COUNT_REVIEWS: 17, BUY_BOX: 18 } as const;

export interface KeepaStats {
  current: number[];
  avg90?: number[]; // flat, CsvType-indexed
  min?: [number, number][]; // each = [keepaTimeMin, value]
  max?: [number, number][];
  totalOfferCount?: number;
  buyBoxIsFBA?: boolean;
  buyBoxPrice?: number; // cents
}
export interface KeepaProduct {
  asin: string;
  title: string | null;
  brand: string | null;
  imagesCSV: string | null; // legacy — Keepa now returns null here
  images?: { l?: string; m?: string }[] | null; // current image field (large/medium filenames)
  monthlySold: number | null; // real "bought past month"; null when Amazon doesn't show it
  salesRankReference: number;
  salesRanks?: Record<string, number[]>;
  stats?: KeepaStats;
  csv?: (number[] | null)[]; // history arrays (flat [ktm,val,...]) by CsvType; needs history=1
  fbaFees?: { pickAndPackFee: number } | null; // Amazon's REAL per-unit fee (cents)
  referralFeePercent?: number | null; // raw percent (e.g. 15)
  variations?: { asin: string }[] | null;
  listedSince?: number; // Keepa-time minutes the listing first appeared
  // static package attributes (Keepa: mm + grams; -1 = unknown) — feed the FBA-tier estimate
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  packageWeight?: number;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with token-aware backoff. Keepa's plan refills ~20 tokens/min; when depleted it
 * answers 429 with `refillIn` (ms until the next refill tick). Historically that 429 just
 * threw and killed batch runs — now we wait out `refillIn` (capped) and retry a couple of
 * times before giving up. Non-429 errors still throw immediately.
 */
async function keepaFetch(url: URL, tries = 3): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status !== 429 || i >= tries - 1) return res;
    let waitMs = 3000;
    try {
      const body = await res.clone().json();
      if (typeof body?.refillIn === "number" && body.refillIn > 0) waitMs = body.refillIn;
    } catch {
      /* no JSON body — fall back to the default wait */
    }
    await sleep(Math.min(waitMs, 65_000) + 250); // cap so we never hang a request forever
  }
}

/** Fetch up to 100 ASINs in one call. Rich pull for competitor intel: stats=90 (90d
 *  avg/min/max), history=1 (review-velocity csv), buybox=1 (buy-box FBA + price), rating=1.
 *  fbaFees + referralFeePercent come by default. NO `offers` param (the only expensive one):
 *  ~+3 tokens/ASIN over the basic pull. */
export async function getKeepaProducts(asins: string[]): Promise<KeepaResponse> {
  if (asins.length === 0)
    return { products: [], tokensLeft: 0, refillIn: 0, refillRate: 0, tokensConsumed: 0 };
  if (asins.length > 100) throw new Error("Keepa /product accepts max 100 ASINs per request");
  const url = new URL(`${KEEPA_BASE}/product`);
  url.searchParams.set("key", keyOrThrow());
  url.searchParams.set("domain", String(DOMAIN_US));
  url.searchParams.set("asin", asins.join(","));
  url.searchParams.set("stats", "90");
  url.searchParams.set("rating", "1");
  url.searchParams.set("history", "1");
  url.searchParams.set("buybox", "1");
  const res = await keepaFetch(url);
  if (!res.ok) throw new Error(`Keepa ${res.status}: ${await res.text()}`);
  return (await res.json()) as KeepaResponse;
}

const cents = (v?: number) => (v != null && v >= 0 ? v / 100 : null);

/** Keepa-time minutes → ISO string. Keepa epoch = 2011-01-01 UTC (offset 21,564,000 min). */
export function ktmToISO(ktm?: number): string | null {
  if (!ktm || ktm <= 0) return null;
  return new Date((ktm + 21564000) * 60000).toISOString();
}

/** Reviews added in the last ~90 days, from the FLAT COUNT_REVIEWS history
 *  ([ktm,val,ktm,val,...]). A velocity proxy (current − value-at-90d-ago); null if unknown. */
export function reviewsAdded90d(csv17?: number[] | null): number | null {
  if (!csv17 || csv17.length < 2 || csv17.length % 2 !== 0) return null; // expect even-length [ktm,val,...]
  const latest = csv17[csv17.length - 1];
  if (latest == null || latest < 0) return null;
  const cutoff = Math.floor((Date.now() - 90 * 86400000) / 60000) - 21564000;
  let baseline: number | null = null;
  for (let i = 0; i + 1 < csv17.length; i += 2) {
    const ktm = csv17[i], val = csv17[i + 1];
    if (val < 0) continue;
    if (ktm <= cutoff) baseline = val; // last known value at/before the cutoff
    else if (baseline == null) baseline = val; // nothing old enough → earliest known value
  }
  return baseline == null ? null : Math.max(0, latest - baseline);
}

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
  package_length_mm: number | null;
  package_width_mm: number | null;
  package_height_mm: number | null;
  package_weight_g: number | null;
  // competitor-intel fields
  price_avg90: number | null;
  price_min90: number | null;
  price_max90: number | null;
  bsr_avg90: number | null;
  bsr_best: number | null;
  reviews_added_90d: number | null;
  variations_count: number | null;
  buy_box_is_fba: boolean | null;
  buy_box_price: number | null;
  offer_count: number | null;
  listed_since: string | null;
  fba_pick_pack_fee: number | null;
  referral_pct: number | null;
}

const dim = (v?: number) => (v != null && v > 0 ? v : null); // Keepa uses -1/0 for unknown
const nn = (v?: number) => (v != null && v >= 0 ? v : null); // non-negative int or null

export function mapKeepaToCompetitor(p: KeepaProduct): CompetitorUpsert {
  const st = p.stats;
  const cur = st?.current ?? [];
  const av = st?.avg90;
  const mn = st?.min;
  const mx = st?.max;
  const flat = (a: number[] | undefined, i: number) => (a && a[i] != null && a[i] >= 0 ? a[i] : null);
  const pair = (a: [number, number][] | undefined, i: number) => (a && a[i] && a[i][1] >= 0 ? a[i][1] : null);
  const flatCents = (a: number[] | undefined, i: number) => { const v = flat(a, i); return v == null ? null : v / 100; };
  const pairCents = (a: [number, number][] | undefined, i: number) => { const v = pair(a, i); return v == null ? null : v / 100; };

  const price = cents(cur[CsvType.AMAZON]) ?? cents(cur[CsvType.NEW]);
  const rating = cur[CsvType.RATING] >= 0 ? cur[CsvType.RATING] / 10 : null;
  const reviews = cur[CsvType.COUNT_REVIEWS] >= 0 ? cur[CsvType.COUNT_REVIEWS] : null;
  const bsr = cur[CsvType.SALES] >= 0 ? cur[CsvType.SALES] : null;
  // Keepa replaced imagesCSV with an images[] array of {l,m} filenames — prefer it, keep the legacy fallback
  const imgFile = p.images?.[0]?.l ?? p.images?.[0]?.m ?? (p.imagesCSV ? p.imagesCSV.split(",")[0] : null);
  const image = imgFile ? `https://m.media-amazon.com/images/I/${imgFile}` : null;
  const fbaFee = p.fbaFees?.pickAndPackFee;
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
    package_length_mm: dim(p.packageLength),
    package_width_mm: dim(p.packageWidth),
    package_height_mm: dim(p.packageHeight),
    package_weight_g: dim(p.packageWeight),
    price_avg90: flatCents(av, CsvType.NEW),
    price_min90: pairCents(mn, CsvType.NEW),
    price_max90: pairCents(mx, CsvType.NEW),
    bsr_avg90: flat(av, CsvType.SALES),
    bsr_best: pair(mn, CsvType.SALES), // min rank = best
    reviews_added_90d: reviewsAdded90d(p.csv?.[CsvType.COUNT_REVIEWS]),
    variations_count: p.variations?.length ?? null,
    buy_box_is_fba: typeof st?.buyBoxIsFBA === "boolean" ? st.buyBoxIsFBA : null, // NULL when no buy box, never false
    buy_box_price: st?.buyBoxPrice != null && st.buyBoxPrice >= 0 ? st.buyBoxPrice / 100 : null, // no buy box → null (never the shipping-incl csv[18])
    offer_count: nn(st?.totalOfferCount),
    listed_since: ktmToISO(p.listedSince),
    fba_pick_pack_fee: fbaFee != null && fbaFee >= 0 ? fbaFee / 100 : null,
    referral_pct: p.referralFeePercent != null && p.referralFeePercent >= 0 ? p.referralFeePercent / 100 : null,
  };
}
