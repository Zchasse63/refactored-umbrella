/** Pure Board sort/filter — extracted so the −Infinity/NaN edge cases are unit-tested. */
import type { ProductView } from "@/lib/data/view";
import type { Tier } from "@/lib/types";

export type BoardSortKey = "headroom" | "net" | "targetSell" | "landed" | "tier" | "name";

const TIER_RANK: Record<Tier, number> = { pursue: 0, maybe: 1, pass: 2 };

export function boardSortValue(v: ProductView, key: BoardSortKey): number | string {
  switch (key) {
    case "headroom": return v.economics.verdict?.headroom ?? Number.NEGATIVE_INFINITY;
    case "net": return v.economics.liveNetPct ?? Number.NEGATIVE_INFINITY;
    case "targetSell": return v.selection.target_sell_price ?? Number.NEGATIVE_INFINITY;
    case "landed": return v.economics.targetLanded ?? Number.NEGATIVE_INFINITY;
    case "tier": return v.selection.tier ? TIER_RANK[v.selection.tier] : 99;
    case "name": return v.product.name.toLowerCase();
  }
}

export function sortBoardViews(
  views: ProductView[],
  key: BoardSortKey,
  dir: "asc" | "desc",
  tier: Tier | "all",
): ProductView[] {
  const filtered = tier === "all" ? views : views.filter((v) => v.selection.tier === tier);
  return [...filtered].sort((a, b) => {
    const ka = boardSortValue(a, key), kb = boardSortValue(b, key);
    if (ka === kb) return 0; // guards −Infinity − −Infinity = NaN (all unquoted rows)
    if (typeof ka === "string" && typeof kb === "string") {
      return dir === "asc" ? ka.localeCompare(kb) : kb.localeCompare(ka);
    }
    const d = (ka as number) - (kb as number);
    return dir === "asc" ? d : -d;
  });
}
