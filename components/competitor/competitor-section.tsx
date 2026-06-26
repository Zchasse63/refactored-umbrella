"use client";

import { useState, useTransition } from "react";
import { Star, ExternalLink, PackageSearch, Sparkles, Loader2, ShoppingBag } from "lucide-react";
import { money, int } from "@/lib/utils";
import type { Competitor, Role } from "@/lib/types";

function salesLabel(c: Competitor): string | null {
  if (c.est_monthly_sales == null) return null;
  const n = c.est_monthly_sales;
  const compact = n >= 1000 ? `${Math.round(n / 1000)}K+` : `${n}+`;
  return `${compact} bought / mo`;
}

function CompetitorCard({ c }: { c: Competitor }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid h-24 place-items-center bg-muted/30">
        {c.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image_url} alt={c.title} className="h-full w-full object-contain p-2" loading="lazy" />
        ) : (
          <ShoppingBag className="size-6 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-quoted-muted px-1.5 py-0.5 text-[9px] font-semibold text-quoted-muted-foreground">Amazon</span>
          {c.asin && <span className="numeric text-[9px] text-muted-foreground">ASIN {c.asin}</span>}
        </div>
        <div className="line-clamp-2 text-[12px] leading-snug">{c.title}</div>
        <div className="mt-auto flex items-baseline justify-between">
          <span className="numeric text-[15px] font-semibold">{money(c.price)}</span>
          {c.rating != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-quoted">
              <Star className="size-3" aria-hidden /> <span className="numeric">{c.rating}</span>
              {c.review_count != null && <span className="numeric text-muted-foreground">({int(c.review_count)})</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {salesLabel(c) && (
            <span className="rounded bg-pass-muted px-1.5 py-0.5 text-[9px] font-semibold text-pass-muted-foreground">{salesLabel(c)}</span>
          )}
          {c.bsr != null && <span className="numeric text-[9px] text-muted-foreground">BSR #{int(c.bsr)}</span>}
        </div>
        {c.retail_url && (
          <a href={c.retail_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-target hover:underline">
            View on Amazon <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}

export function CompetitorSection({
  productRef,
  role,
  competitors,
}: {
  productRef: string;
  role: Role;
  competitors: Competitor[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      const { discoverCompetitors } = await import("@/app/actions");
      setMsg(null);
      const r = await discoverCompetitors(productRef);
      setMsg("error" in r ? r.error : `Found ${r.found} candidates, kept ${r.kept} verified matches.`);
    });

  const DiscoverButton = () =>
    role === "owner" ? (
      <button
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-card px-2.5 py-1 text-[11px] font-medium transition hover:bg-muted disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-partner" />}
        {pending ? "Finding…" : competitors.length ? "Re-run discovery" : "Find competitors"}
      </button>
    ) : null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-section-label">Competitors · found from this product&apos;s specs</div>
        <DiscoverButton />
      </div>

      {competitors.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {competitors.map((c) => (
              <CompetitorCard key={c.id} c={c} />
            ))}
          </div>
          {msg && <p className="mt-2 text-[11px] text-muted-foreground">{msg}</p>}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong py-8 text-center">
          <PackageSearch className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[13px] text-muted-foreground">{pending ? "Searching Amazon via Keepa…" : "No competitors attached yet."}</p>
          <p className="max-w-md text-[11px] text-muted-foreground">
            Claude builds a search profile from these specs → Keepa Product Finder returns real top-selling ASINs →
            a Claude judge verifies fit → Keepa enriches price, rating, reviews &amp; monthly sales.
          </p>
          {msg && <p className="text-[11px] text-fail-muted-foreground">{msg}</p>}
        </div>
      )}
    </div>
  );
}
