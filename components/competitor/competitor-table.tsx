"use client";

import { useState } from "react";
import { ExternalLink, ShoppingBag } from "lucide-react";
import { cn, money, int, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Competitor } from "@/lib/types";

type SortKey = "price" | "bsr" | "est_monthly_sales" | "review_count" | "listed_since";

const sortVal = (c: Competitor, k: SortKey): number | null => {
  if (k === "listed_since") return c.listed_since ? new Date(c.listed_since).getTime() : null;
  const v = c[k];
  return typeof v === "number" ? v : null;
};
const g2lb = (g: number | null) => (g != null && g > 0 ? `${(g / 453.6).toFixed(1)} lb` : "—");
const age = (iso: string | null) => (iso ? relativeTime(iso).replace(" ago", "") : "—");

/** Dense competitor-intel table — real Amazon data per listing, sortable. */
export function CompetitorTable({ competitors }: { competitors: Competitor[] }) {
  const [sort, setSort] = useState<SortKey>("est_monthly_sales");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function toggle(k: SortKey) {
    if (sort === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(k); setDir(k === "bsr" ? "asc" : "desc"); } // BSR: lower is better
  }
  const rows = [...competitors].sort((a, b) => {
    const av = sortVal(a, sort), bv = sortVal(b, sort);
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return dir === "asc" ? av - bv : bv - av;
  });

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th scope="col" aria-sort={sort === k ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-2 py-2 font-semibold", right && "text-right")}>
      <button type="button" onClick={() => toggle(k)} className="inline-flex select-none items-center gap-0.5 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
        <span aria-hidden className={sort === k ? "text-foreground/70" : "text-foreground/30"}>{sort === k ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[820px] text-[12px]">
        <thead>
          <tr className="border-b border-border-strong bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Listing</th>
            <Th k="price" label="Price" right />
            <Th k="bsr" label="BSR" right />
            <Th k="est_monthly_sales" label="Sold/mo" right />
            <Th k="review_count" label="Reviews" right />
            <th className="px-2 py-2 text-right font-semibold">Var</th>
            <th className="px-2 py-2 text-right font-semibold">FBA</th>
            <th className="px-2 py-2 text-right font-semibold">Wt</th>
            <Th k="listed_since" label="Age" right />
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const drop = c.price != null && c.price_avg90 != null && c.price_avg90 > 0 ? (c.price - c.price_avg90) / c.price_avg90 : 0;
            return (
              <tr key={c.id} className={cn("border-b border-border last:border-0 align-top", i % 2 && "bg-muted/20")}>
                <td className="px-3 py-1.5">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center overflow-hidden rounded border border-border bg-muted/30">
                      {c.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.image_url} alt="" className="h-full w-full object-contain" loading="lazy" />
                      ) : <ShoppingBag className="size-3.5 text-muted-foreground" aria-hidden />}
                    </span>
                    <div className="min-w-0">
                      {c.retail_url ? (
                        <a href={c.retail_url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 font-medium hover:text-target">{c.title}</a>
                      ) : <span className="line-clamp-1 font-medium">{c.title}</span>}
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-quoted-muted px-1 py-0.5 text-[9px] font-semibold text-quoted-muted-foreground">Amazon</span>
                        {c.asin && <a href={c.retail_url ?? "#"} target="_blank" rel="noopener noreferrer" className="numeric inline-flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-target">{c.asin}<ExternalLink className="size-2.5" aria-hidden /></a>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="numeric px-2 py-1.5 text-right">
                  <div className="font-semibold">{money(c.price)}</div>
                  {c.price_avg90 != null && (
                    <div className="text-[10px] text-muted-foreground">
                      90d {money(c.price_avg90)}{Math.abs(drop) > 0.05 && <span className={drop < 0 ? "text-pass" : "text-fail"}> {drop < 0 ? "▼" : "▲"}</span>}
                    </div>
                  )}
                </td>
                <td className="numeric px-2 py-1.5 text-right">
                  {c.bsr != null ? `#${int(c.bsr)}` : "—"}
                  {c.bsr_best != null && <div className="text-[10px] text-muted-foreground">best #{int(c.bsr_best)}</div>}
                </td>
                <td className="numeric px-2 py-1.5 text-right">{c.est_monthly_sales ? int(c.est_monthly_sales) : "—"}</td>
                <td className="numeric px-2 py-1.5 text-right">
                  {c.review_count != null ? int(c.review_count) : "—"}
                  {c.reviews_added_90d ? <div className="text-[10px] text-pass">+{int(c.reviews_added_90d)}/90d</div> : null}
                </td>
                <td className="numeric px-2 py-1.5 text-right">
                  {c.variations_count != null ? <span className={c.variations_count > 1 ? "" : "text-muted-foreground/60"}>{c.variations_count}</span> : "—"}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <div className="numeric">{money(c.fba_pick_pack_fee)}</div>
                  {c.buy_box_is_fba != null && (
                    <Badge variant={c.buy_box_is_fba ? "pass" : "neutral"}>{c.buy_box_is_fba ? "FBA" : "FBM"}</Badge>
                  )}
                </td>
                <td className="numeric px-2 py-1.5 text-right text-muted-foreground">{g2lb(c.package_weight_g)}</td>
                <td className="numeric px-2 py-1.5 text-right text-muted-foreground">{age(c.listed_since)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
