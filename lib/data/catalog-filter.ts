/** Pure catalog filter + sort + facet engine. Shared by /catalog and /products. */
import type { ProductView } from "@/lib/data/view";
import type { Line, Tier } from "@/lib/types";

export type PhotoFilter = "all" | "good" | "needs";
export type VoltageFilter = "all" | "us" | "v220";
export type QuoteFilter = "all" | "quoted" | "none" | "pass" | "fail";
export type CatalogSort =
  | "relevance" | "name" | "target-desc" | "target-asc" | "net" | "headroom" | "needs-photo";

export interface CatalogFilters {
  q: string;
  line: "all" | Line;
  categories: string[]; // group_name values
  tiers: (Tier | "unset")[];
  photo: PhotoFilter;
  voltage: VoltageFilter;
  quote: QuoteFilter;
  priceMin: number | null;
  priceMax: number | null;
}

export const EMPTY_FILTERS: CatalogFilters = {
  q: "", line: "all", categories: [], tiers: [], photo: "all", voltage: "all", quote: "all", priceMin: null, priceMax: null,
};

export function isFiltered(f: CatalogFilters): boolean {
  return (
    f.q.trim() !== "" || f.line !== "all" || f.categories.length > 0 || f.tiers.length > 0 ||
    f.photo !== "all" || f.voltage !== "all" || f.quote !== "all" || f.priceMin != null || f.priceMax != null
  );
}

function haystack(v: ProductView): string {
  const p = v.product;
  return [p.name, p.model, p.subsection, p.group_name, ...p.specs.map((s) => `${s.label} ${s.value}`)]
    .filter(Boolean).join(" ").toLowerCase();
}

export function applyFilters(views: ProductView[], f: CatalogFilters): ProductView[] {
  const needle = f.q.trim().toLowerCase();
  return views.filter((v) => {
    const p = v.product;
    if (f.line !== "all" && p.line !== f.line) return false;
    if (f.categories.length && !f.categories.includes(p.group_name ?? "")) return false;
    if (f.tiers.length && !f.tiers.includes(v.selection.tier ?? "unset")) return false;
    if (f.photo === "good" && p.photo_state !== "good") return false;
    if (f.photo === "needs" && p.photo_state === "good") return false;
    if (f.voltage === "us" && p.voltage_flag) return false;
    if (f.voltage === "v220" && !p.voltage_flag) return false;
    if (f.quote !== "all") {
      const hasQuote = v.quotedLanded != null;
      const verdict = v.economics.verdict;
      if (f.quote === "quoted" && !hasQuote) return false;
      if (f.quote === "none" && hasQuote) return false;
      if (f.quote === "pass" && !verdict?.pass) return false;
      if (f.quote === "fail" && !(verdict && !verdict.pass)) return false;
    }
    const price = v.selection.target_sell_price;
    if (f.priceMin != null && (price == null || price < f.priceMin)) return false;
    if (f.priceMax != null && (price == null || price > f.priceMax)) return false;
    if (needle && !haystack(v).includes(needle)) return false;
    return true;
  });
}

function sortKey(v: ProductView, sort: CatalogSort): number | string {
  switch (sort) {
    case "name": return v.product.name.toLowerCase();
    case "target-desc":
    case "target-asc": return v.selection.target_sell_price ?? Number.NEGATIVE_INFINITY;
    case "net": return v.economics.liveNetPct ?? Number.NEGATIVE_INFINITY;
    case "headroom": return v.economics.verdict?.headroom ?? Number.NEGATIVE_INFINITY;
    case "needs-photo": return v.product.photo_state !== "good" ? 1 : 0;
    default: return 0;
  }
}

export function sortViews(views: ProductView[], sort: CatalogSort): ProductView[] {
  if (sort === "relevance") return views;
  const dir = sort === "target-asc" || sort === "name" ? 1 : -1;
  return [...views].sort((a, b) => {
    const ka = sortKey(a, sort), kb = sortKey(b, sort);
    if (ka === kb) return 0; // guards −Infinity − −Infinity = NaN
    if (typeof ka === "string" && typeof kb === "string") return dir * ka.localeCompare(kb);
    return dir * ((ka as number) - (kb as number));
  });
}

export interface Facet {
  value: string;
  label: string;
  count: number;
}

/** Category (group_name) facets with counts, for the given view set. */
export function categoryFacets(views: ProductView[]): Facet[] {
  const m = new Map<string, number>();
  for (const v of views) {
    const c = v.product.group_name;
    if (c) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const LINE_LABEL: Record<Line, string> = { appliance: "Appliances", beauty: "Beauty", foodservice: "Foodservice" };

export function lineFacets(views: ProductView[]): Facet[] {
  const m = new Map<Line, number>();
  for (const v of views) m.set(v.product.line, (m.get(v.product.line) ?? 0) + 1);
  return (["appliance", "beauty", "foodservice"] as Line[])
    .filter((l) => (m.get(l) ?? 0) > 0)
    .map((l) => ({ value: l, label: LINE_LABEL[l], count: m.get(l)! }));
}

export function tierFacets(views: ProductView[]): Facet[] {
  const m = new Map<string, number>();
  for (const v of views) {
    const t = v.selection.tier ?? "unset";
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return (["pursue", "maybe", "pass", "unset"] as const)
    .filter((t) => (m.get(t) ?? 0) > 0)
    .map((t) => ({ value: t, label: t === "unset" ? "No tier" : t, count: m.get(t)! }));
}
