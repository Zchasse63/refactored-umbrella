"use client";

import { useState, useTransition } from "react";
import { PackageSearch, Sparkles, Loader2, Check, X, ExternalLink } from "lucide-react";
import { cn, money } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { CompetitorRollup } from "@/components/competitor/competitor-rollup";
import { CompetitorTable } from "@/components/competitor/competitor-table";
import { approveCompetitor, rejectCompetitor } from "@/app/actions";
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
  const candidates = competitors.filter((c) => c.status === "candidate");

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

      {role === "owner" && candidates.length > 0 && <ReviewQueue productRef={productRef} candidates={candidates} />}

      {approved.length > 0 ? (
        <div className="space-y-3">
          <CompetitorRollup competitors={approved} fbaEstimate={fbaEstimate} targetSellPrice={targetSellPrice} />
          <CompetitorTable competitors={approved} />
          <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
            {candidates.length > 0 && role !== "owner" && <span>+{candidates.length} candidate{candidates.length === 1 ? "" : "s"} pending owner review</span>}
            {msg && <span>{msg}</span>}
          </div>
        </div>
      ) : candidates.length > 0 && role === "owner" ? (
        <p className="text-[11px] text-muted-foreground">{msg ?? "Review the candidates above to build the market read."}</p>
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

/** Owner-only review gate: borderline discovery matches (0.5–0.75 confidence) confirm or
 *  reject here. A reject writes competitor_feedback → learned excludes for next discovery. */
function ReviewQueue({ productRef, candidates }: { productRef: string; candidates: Competitor[] }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const act = (id: string, fn: () => Promise<unknown>) =>
    start(async () => { setBusy(id); await fn(); setBusy(null); });

  return (
    <div className="mb-3 rounded-lg border border-warn/40 bg-warn-muted/30 p-2.5">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-warn-muted-foreground">
        {candidates.length} candidate{candidates.length === 1 ? "" : "s"} to review
        <span className="ml-1 font-normal normal-case text-muted-foreground">— borderline matches; confirm or reject before they count</span>
      </div>
      <div className="space-y-1.5">
        {candidates.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-md bg-card px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="line-clamp-1 text-[12px] font-medium">{c.title}</span>
                {c.retail_url && <a href={c.retail_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-target" aria-label="Open on Amazon"><ExternalLink className="size-3" /></a>}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="numeric">{money(c.price)}</span>
                {c.match_confidence != null && <span>· {Math.round(c.match_confidence * 100)}% match</span>}
                {c.match_reason && <span className="line-clamp-1">· {c.match_reason}</span>}
              </div>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => act(c.id, () => approveCompetitor(productRef, c.id))}
              className={cn("inline-flex items-center gap-1 rounded-md bg-pass-muted px-2 py-1 text-[11px] font-semibold text-pass-muted-foreground disabled:opacity-50")}
            >
              {busy === c.id && pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Keep
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => act(c.id, () => rejectCompetitor(productRef, c.id, `${c.title}`.slice(0, 80)))}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <X className="size-3" /> Reject
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
