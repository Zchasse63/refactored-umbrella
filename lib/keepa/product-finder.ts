/**
 * Keepa Product Finder — PRIMARY competitor discovery (KEEPA_INTEGRATION §6).
 * Queries Keepa's real Amazon catalog by structured filters and returns real ASINs
 * ranked by actual sales. `asinsOnly` keeps it cheap (tokens charged only when a
 * fresh collection triggers). Server-only.
 */
const KEEPA_BASE = "https://api.keepa.com";

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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asinsOnly: true, perPage: 30, page: 0, ...selection }),
  });
  if (!res.ok) throw new Error(`Keepa finder ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { asinList?: string[] };
  return data.asinList ?? [];
}
