/**
 * Keepa Product Finder — PRIMARY competitor discovery (KEEPA_INTEGRATION §6).
 * Queries Keepa's real Amazon catalog by structured filters and returns real ASINs
 * ranked by actual sales. `asinsOnly` keeps it cheap (tokens charged only when a
 * fresh collection triggers). Server-only.
 */
const KEEPA_BASE = "https://api.keepa.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Token-aware retry (mirrors lib/keepa/client): wait out Keepa's `refillIn` on 429.
 *  6 tries (not 3) so a deeply-overdrawn bucket (tokensLeft can go negative under a
 *  sustained batch) gets enough refill ticks to recover instead of throwing. */
async function keepaFetch(url: URL, init?: RequestInit, tries = 6): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || i >= tries - 1) return res;
    let waitMs = 3000;
    try {
      const body = await res.clone().json();
      if (typeof body?.refillIn === "number" && body.refillIn > 0) waitMs = body.refillIn;
    } catch {
      /* default wait */
    }
    await sleep(Math.min(waitMs, 65_000) + 250);
  }
}

export interface FinderSelection {
  categories_include?: number[];
  title?: string;
  current_AMAZON_gte?: number; // cents
  current_AMAZON_lte?: number;
  monthlySold_gte?: number;
  sort?: [string, "asc" | "desc"][];
  perPage?: number;
  page?: number;
}

/** Resolve a category keyword → real Keepa category node ids (Claude then picks one). */
export async function searchCategories(term: string): Promise<Record<string, unknown>> {
  const key = process.env.KEEPA_API_KEY;
  if (!key) throw new Error("KEEPA_API_KEY is not set");
  const url = new URL(`${KEEPA_BASE}/search`);
  url.searchParams.set("key", key);
  url.searchParams.set("domain", "1");
  url.searchParams.set("type", "category");
  url.searchParams.set("term", term);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Keepa category search ${res.status}: ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>;
}

/** POST /query — returns real ASINs matching the selection (asinsOnly). */
export async function keepaFinder(selection: FinderSelection): Promise<string[]> {
  const key = process.env.KEEPA_API_KEY;
  if (!key) throw new Error("KEEPA_API_KEY is not set");
  const url = new URL(`${KEEPA_BASE}/query`);
  url.searchParams.set("key", key);
  url.searchParams.set("domain", "1");
  // Keepa Product Finder requires a full page size (min 50); we slice the result
  // down to a handful of candidates for enrichment in the caller.
  const { perPage, page, ...rest } = selection;
  const res = await keepaFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asinsOnly: true, page: page ?? 0, perPage: perPage ?? 50, ...rest }),
  });
  if (!res.ok) throw new Error(`Keepa finder ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { asinList?: string[] };
  return data.asinList ?? [];
}
