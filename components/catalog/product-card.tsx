import Link from "next/link";
import { cn, money } from "@/lib/utils";
import { PhotoFrame, PhotoCornerBadge } from "@/components/product/product-image";
import { TierBadge } from "@/components/ui/tier-badge";
import type { ProductView } from "@/lib/data/fixtures";
import type { Product } from "@/lib/types";

const SOURCE_LABEL: Record<string, string> = {
  RoyalStar: "Appliance",
  MKS: "Beauty",
  Greenway: "Foodservice",
};

/** A couple of genuinely useful at-a-glance specs (capacity / power) — real data, not a flag. */
function keySpecs(p: Product): string {
  const pick = (re: RegExp) => p.specs.find((s) => re.test(s.label))?.value;
  return [pick(/capacity|volume/i), pick(/power|wattage/i)].filter(Boolean).join(" · ");
}

export function ProductCard({ view }: { view: ProductView }) {
  const { product: p, slug, economics: eco, selection } = view;
  const hasTarget = !eco.guarded;
  const ks = keySpecs(p);

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
        {ks && <div className="numeric text-[11px] text-muted-foreground">{ks}</div>}

        <div className="mt-auto flex items-end justify-between pt-1.5">
          {hasTarget ? (
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Target sell</span>
              <span className="numeric text-[14px] font-semibold">{money(selection.target_sell_price)}</span>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">No target set yet</span>
          )}
          {/* Partner's prospect signal — the only chip on the card, shown only when actually set. */}
          {selection.tier && <TierBadge tier={selection.tier} className="text-[10px]" />}
        </div>

        {eco.verdict && (
          <span
            className={cn(
              "numeric inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold",
              eco.verdict.pass ? "bg-pass-muted text-pass-muted-foreground" : "bg-fail-muted text-fail-muted-foreground",
            )}
            title="Owner's factory quote vs the target landed cost"
          >
            {money(eco.quotedLanded)} quote · {eco.verdict.pass ? "clears target" : "over target"}
          </span>
        )}
      </div>
    </Link>
  );
}
