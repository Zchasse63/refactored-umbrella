"use client";

import { useState, useTransition } from "react";
import { PackageSearch, Sparkles, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CompetitorRollup } from "@/components/competitor/competitor-rollup";
import { CompetitorTable } from "@/components/competitor/competitor-table";
import type { Competitor, Role } from "@/lib/types";
import type { FbaEstimate } from "@/lib/calc/fba";

export function CompetitorSection({
  productRef,
  role,
  competitors,
  fbaEstimate,
  targetSellPrice,
}: {
  productRef: string;
  role: Role;
  competitors: Competitor[];
  fbaEstimate: FbaEstimate | null;
  targetSellPrice: number | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const approved = competitors.filter((c) => c.status === "approved");
  const candidates = competitors.length - approved.length;

  const run = () =>
    start(async () => {
      const { discoverCompetitors } = await import("@/app/actions");
      setMsg(null);
      const r = await discoverCompetitors(productRef);
      setMsg("error" in r ? r.error : `Found ${r.found} candidates, kept ${r.kept} verified matches.`);
    });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-section-label">Competitors · real Amazon data via Keepa</div>
        {role === "owner" && (
          <button
            onClick={run}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-card px-2.5 py-1 text-[11px] font-medium transition hover:bg-muted disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-partner" />}
            {pending ? "Finding…" : approved.length ? "Re-run discovery" : "Find competitors"}
          </button>
        )}
      </div>

      {approved.length > 0 ? (
        <div className="space-y-3">
          <CompetitorRollup competitors={approved} fbaEstimate={fbaEstimate} targetSellPrice={targetSellPrice} />
          <CompetitorTable competitors={approved} />
          <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
            {candidates > 0 && <span>+{candidates} candidate{candidates === 1 ? "" : "s"} pending review</span>}
            {msg && <span>{msg}</span>}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={PackageSearch}
          title={pending ? "Searching Amazon via Keepa…" : "No competitors attached yet"}
          hint="Claude builds a search profile from these specs → Keepa returns real top-selling ASINs → a Claude judge verifies fit → Keepa enriches price, BSR, reviews, package dims & the real FBA fee."
          action={msg ? <span className="text-[11px] text-fail-muted-foreground">{msg}</span> : undefined}
        />
      )}
    </div>
  );
}
