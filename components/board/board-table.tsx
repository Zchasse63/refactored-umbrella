"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn, money, pct, EMDASH } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ProductView } from "@/lib/data/view";
import type { Role, Tier } from "@/lib/types";

const LINE_SHORT: Record<string, string> = { appliance: "Appl", beauty: "Beauty", foodservice: "Food" };
const TIER_VARIANT: Record<Tier, "pass" | "warn" | "neutral"> = { pursue: "pass", maybe: "warn", pass: "neutral" };
const TIER_RANK: Record<Tier, number> = { pursue: 0, maybe: 1, pass: 2 };

type SortKey = "headroom" | "net" | "targetSell" | "landed" | "tier" | "name";

/** Dense comparison cockpit — rank every SKU by the negotiation numbers. Read-only. */
export function BoardTable({ views }: { views: ProductView[]; role: Role }) {
  const [sortKey, setSortKey] = useState<SortKey>("headroom");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [tier, setTier] = useState<Tier | "all">("all");

  const rows = useMemo(() => {
    const filtered = tier === "all" ? views : views.filter((v) => v.selection.tier === tier);
    const key = (v: ProductView): number | string => {
      switch (sortKey) {
        case "headroom": return v.economics.verdict?.headroom ?? Number.NEGATIVE_INFINITY;
        case "net": return v.economics.liveNetPct ?? Number.NEGATIVE_INFINITY;
        case "targetSell": return v.selection.target_sell_price ?? Number.NEGATIVE_INFINITY;
        case "landed": return v.economics.targetLanded ?? Number.NEGATIVE_INFINITY;
        case "tier": return v.selection.tier ? TIER_RANK[v.selection.tier] : 99;
        case "name": return v.product.name.toLowerCase();
      }
    };
    return [...filtered].sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (typeof ka === "string" && typeof kb === "string") {
        return dir === "asc" ? ka.localeCompare(kb) : kb.localeCompare(ka);
      }
      const d = (ka as number) - (kb as number);
      return dir === "asc" ? d : -d;
    });
  }, [views, sortKey, dir, tier]);

  function toggle(key: SortKey) {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setDir(key === "name" ? "asc" : "desc"); }
  }

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => toggle(k)}
      className={cn("cursor-pointer select-none px-2 py-2 font-semibold hover:text-foreground", right && "text-right")}
      aria-sort={sortKey === k ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      <span className="ml-0.5 text-foreground/40">{sortKey === k ? (dir === "asc" ? "↑" : "↓") : ""}</span>
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
                      <Badge variant={TIER_VARIANT[v.selection.tier]} className="capitalize">{v.selection.tier}</Badge>
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
