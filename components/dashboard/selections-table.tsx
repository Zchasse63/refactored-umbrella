"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn, money, pct, EMDASH } from "@/lib/utils";
import { TierBadge } from "@/components/ui/tier-badge";
import type { ProductView } from "@/lib/data/view";
import type { Role } from "@/lib/types";

const LINE_SHORT: Record<string, string> = { appliance: "Appl", beauty: "Beauty", foodservice: "Food" };
const STAGE_LABEL: Record<string, string> = {
  new: "New", shortlisted: "Shortlisted", costing: "Costing", quoted: "Quoted", decision: "Decision",
};

type Filter = "active" | "pursue" | "quoted" | "all";

export function SelectionsTable({
  views,
  pipeline,
  role,
}: {
  views: ProductView[];
  pipeline: Record<string, { status: string; decision: string | null }>;
  role: Role;
}) {
  const [filter, setFilter] = useState<Filter>("active");

  const rows = useMemo(() => {
    const has = (v: ProductView) => v.selection.target_sell_price != null || v.selection.tier != null;
    return views.filter((v) => {
      if (filter === "all") return true;
      if (filter === "pursue") return v.selection.tier === "pursue";
      if (filter === "quoted") return v.quotedLanded != null;
      return has(v); // active = any tier or target set
    });
  }, [views, filter]);

  const chips: { id: Filter; label: string }[] = [
    { id: "active", label: "Active" },
    { id: "pursue", label: "Pursue" },
    { id: "quoted", label: "Quoted" },
    { id: "all", label: "All" },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] transition",
              filter === c.id ? "border-foreground/20 bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {c.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">{rows.length} items</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-[12px]">
          <thead>
            <tr className="border-b border-border-strong bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Product</th>
              <th className="px-2 py-2 font-semibold">Line</th>
              <th className="px-2 py-2 font-semibold">Tier</th>
              <th className="px-2 py-2 font-semibold">Stage</th>
              <th className="px-2 py-2 text-right font-semibold">Target sell</th>
              <th className="px-2 py-2 text-right font-semibold">Landed</th>
              <th className="px-2 py-2 text-right font-semibold">Quote</th>
              <th className="px-2 py-2 text-right font-semibold">Net / status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No selections yet — the partner hasn’t set targets or tiers.
                </td>
              </tr>
            ) : (
              rows.map((v, i) => {
                const eco = v.economics;
                const stage = pipeline[v.product.external_ref]?.status ?? "new";
                return (
                  <tr key={v.product.external_ref} className={cn("border-b border-border last:border-0", i % 2 && "bg-muted/20")}>
                    <td className="px-3 py-1.5">
                      <Link href={`/p/${v.slug}`} className="font-medium hover:text-target">{v.product.name}</Link>
                      <div className="text-[10px] text-muted-foreground">{v.product.subsection ?? v.product.group_name}</div>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{LINE_SHORT[v.product.line]}</td>
                    <td className="px-2 py-1.5">
                      {v.selection.tier ? (
                        <TierBadge tier={v.selection.tier} />
                      ) : (
                        <span className="text-muted-foreground/50">{EMDASH}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{STAGE_LABEL[stage] ?? stage}</td>
                    <td className="numeric px-2 py-1.5 text-right">{money(v.selection.target_sell_price)}</td>
                    <td className="numeric px-2 py-1.5 text-right text-target">{eco.targetLanded == null ? EMDASH : money(eco.targetLanded)}</td>
                    <td className="numeric px-2 py-1.5 text-right text-quoted">{v.quotedLanded == null ? EMDASH : money(v.quotedLanded)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {eco.verdict ? (
                        <span className={cn("numeric font-semibold", eco.verdict.pass ? "text-pass" : "text-fail")}>
                          {pct(eco.quotedNetPct)} · {eco.verdict.pass ? "PASS" : "FAIL"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">{EMDASH}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
