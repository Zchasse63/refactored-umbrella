import Link from "next/link";
import { Zap } from "lucide-react";
import { cn, money, pct } from "@/lib/utils";
import { PhotoFrame, PhotoCornerBadge } from "@/components/product/product-image";
import type { ProductView } from "@/lib/data/fixtures";

const SOURCE_LABEL: Record<string, string> = {
  RoyalStar: "Appliance",
  MKS: "Beauty",
  Greenway: "Foodservice",
};

function PresenceDots({ target, quoted, actual }: { target: boolean; quoted: boolean; actual: boolean }) {
  const dot = (on: boolean, cls: string) => (
    <span className={cn("size-1.5 rounded-full", on ? cls : "bg-border-strong")} aria-hidden />
  );
  return (
    <span className="flex items-center gap-0.5" title="Costing completeness: Target · Quoted · Actual">
      {dot(target, "bg-target")}
      {dot(quoted, "bg-quoted")}
      {dot(actual, "bg-actual")}
    </span>
  );
}

export function ProductCard({ view }: { view: ProductView }) {
  const { product: p, slug, economics: eco, selection } = view;
  const hasTarget = !eco.guarded;
  const hasQuote = eco.quotedLanded != null;
  const hasActual = eco.actualLanded != null;

  const pill = !hasTarget
    ? { label: "No target", cls: "bg-muted text-muted-foreground" }
    : eco.verdict
      ? eco.verdict.pass
        ? { label: `PASS ${pct(eco.quotedNetPct)}`, cls: "bg-pass-muted text-pass-muted-foreground" }
        : { label: "FAIL", cls: "bg-fail-muted text-fail-muted-foreground" }
      : { label: `${pct(eco.targetNetPct)} net`, cls: "bg-target-muted text-target-muted-foreground" };

  return (
    <Link
      href={`/p/${slug}`}
      className="group flex flex-col rounded-lg border border-border bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative p-2">
        <PhotoFrame product={p} aspect="aspect-square" className="border-0 bg-muted/20" />
        <div className="absolute right-3 top-3">
          <PhotoCornerBadge product={p} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3 pt-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {SOURCE_LABEL[p.source] ?? p.line} · {p.subsection ?? p.group_name ?? "—"}
        </div>
        <div className="line-clamp-2 text-[13px] font-medium leading-snug">{p.name}</div>

        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="flex items-baseline gap-1.5">
            {hasTarget ? (
              <>
                <span className="numeric text-[13px] font-semibold">{money(selection.target_sell_price)}</span>
                <span className="numeric text-[11px] text-muted-foreground">
                  → {money(eco.targetLanded)}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">No target yet</span>
            )}
          </div>
          <PresenceDots target={hasTarget} quoted={hasQuote} actual={hasActual} />
        </div>

        <div className="flex items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", pill.cls)}>{pill.label}</span>
          {hasQuote && <Zap className="size-3 text-quoted" aria-hidden />}
          {p.voltage_flag && (
            <span className="numeric ml-auto rounded bg-fail-muted px-1 py-0.5 text-[9px] font-semibold text-fail-muted-foreground" title="Lists 220V — verify for US">
              220V
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
