"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn, money, pct, EMDASH } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TierBadge } from "@/components/ui/tier-badge";
import { sortBoardViews, type BoardSortKey } from "@/lib/data/board-sort";
import type { ProductView } from "@/lib/data/view";
import type { Role, Tier } from "@/lib/types";

const LINE_SHORT: Record<string, string> = { appliance: "Appl", beauty: "Beauty", foodservice: "Food" };

type SortKey = BoardSortKey;

/** Dense comparison cockpit — rank every SKU by the negotiation numbers. Read-only. */
export function BoardTable({ views }: { views: ProductView[]; role: Role }) {
  const [sortKey, setSortKey] = useState<SortKey>("headroom");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [tier, setTier] = useState<Tier | "all">("all");

  const rows = useMemo(() => sortBoardViews(views, sortKey, dir, tier), [views, sortKey, dir, tier]);

  function toggle(key: SortKey) {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setDir(key === "name" ? "asc" : "desc"); }
  }

  // Sortable header: the trigger is a real <button> (focusable + Enter/Space) inside the
  // th; aria-sort stays on the th. A persistent ↕ marks every sortable column; the active
  // one shows a stronger ↑/↓ — so sortable vs. plain headers read differently at a glance.
  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      scope="col"
      className={cn("px-2 py-2 font-semibold", right && "text-right")}
      aria-sort={sortKey === k ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => toggle(k)}
        className="inline-flex select-none items-center gap-0.5 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <span aria-hidden className={cn(sortKey === k ? "text-foreground/70" : "text-foreground/30")}>
          {sortKey === k ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );

  const chips: { id: Tier | "all"; label: string }[] = [
    { id: "all", label: "All" }, { id: "pursue", label: "Pursue" }, { id: "maybe", label: "Maybe" }, { id: "pass", label: "Pass" },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => setTier(c.id)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] capitalize transition",
              tier === c.id ? "border-foreground/20 bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {c.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">{rows.length} products · sorted by {sortKey}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[860px] text-[12px]">
          <thead>
            <tr className="border-b border-border-strong bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <Th k="name" label="Product" />
              <th className="px-2 py-2 font-semibold">Line</th>
              <Th k="tier" label="Tier" />
              <Th k="targetSell" label="Target sell" right />
              <Th k="landed" label="Landed (DDP)" right />
              <th className="px-2 py-2 text-right font-semibold">Quote</th>
              <Th k="headroom" label="Headroom" right />
              <Th k="net" label="Net %" right />
              <th className="px-2 py-2 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v, i) => {
              const eco = v.economics;
              const hr = eco.verdict?.headroom ?? null;
              return (
                <tr key={v.product.external_ref} className={cn("border-b border-border last:border-0", i % 2 && "bg-muted/20")}>
                  <td className="px-2 py-1.5">
                    <Link href={`/p/${v.slug}`} className="font-medium hover:text-target">{v.product.name}</Link>
                    {v.product.model && <span className="numeric ml-1.5 text-[10px] text-muted-foreground">{v.product.model}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{LINE_SHORT[v.product.line]}</td>
                  <td className="px-2 py-1.5">
                    {v.selection.tier ? (
                      <TierBadge tier={v.selection.tier} />
                    ) : <span className="text-muted-foreground/50">{EMDASH}</span>}
                  </td>
                  <td className="numeric px-2 py-1.5 text-right">{money(v.selection.target_sell_price)}</td>
                  <td className="numeric px-2 py-1.5 text-right text-target">{eco.targetLanded == null ? EMDASH : money(eco.targetLanded)}</td>
                  <td className="numeric px-2 py-1.5 text-right text-quoted">{v.quotedLanded == null ? EMDASH : money(v.quotedLanded)}</td>
                  <td className={cn("numeric px-2 py-1.5 text-right", hr == null ? "text-muted-foreground/50" : hr >= 0 ? "text-pass" : "text-fail")}>
                    {hr == null ? EMDASH : money(hr)}
                  </td>
                  <td className="numeric px-2 py-1.5 text-right">{eco.liveNetPct == null ? EMDASH : pct(eco.liveNetPct)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {eco.verdict ? (
                      <Badge variant={eco.verdict.pass ? "pass" : "fail"}>{eco.verdict.pass ? "PASS" : "FAIL"}</Badge>
                    ) : <span className="text-muted-foreground/50">{EMDASH}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
