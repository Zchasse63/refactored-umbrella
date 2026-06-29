import { cn, money, int } from "@/lib/utils";
import type { Competitor } from "@/lib/types";
import type { FbaEstimate } from "@/lib/calc/fba";

const median = (xs: number[]): number | null => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const nums = (cs: Competitor[], k: keyof Competitor): number[] =>
  cs.map((c) => c[k]).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function Stat({ label, value, sub, hue }: { label: string; value: React.ReactNode; sub?: React.ReactNode; hue?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("numeric text-[15px] font-semibold leading-tight", hue)}>{value}</div>
      {sub != null && <div className="numeric text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Aggregate "market read" across the verified Amazon competitors for this product. */
export function CompetitorRollup({
  competitors,
  fbaEstimate,
  targetSellPrice,
}: {
  competitors: Competitor[];
  fbaEstimate: FbaEstimate | null;
  targetSellPrice: number | null;
}) {
  if (!competitors.length) return null;

  const prices = nums(competitors, "price");
  const medPrice = median(prices);
  const loArr = nums(competitors, "price_min90").concat(prices);
  const hiArr = nums(competitors, "price_max90").concat(prices);
  const lo = loArr.length ? Math.min(...loArr) : null;
  const hi = hiArr.length ? Math.max(...hiArr) : null;

  const bsrs = competitors.map((c) => c.bsr_best ?? c.bsr).filter((x): x is number => typeof x === "number");
  const bestBsr = bsrs.length ? Math.min(...bsrs) : null;
  const totalSold = sum(nums(competitors, "est_monthly_sales"));
  const momentum = sum(nums(competitors, "reviews_added_90d"));

  const targetDelta = targetSellPrice != null && medPrice != null ? targetSellPrice - medPrice : null;

  return (
    <div className="rounded-lg border border-border-strong bg-card p-3 shadow-card">
      <div className="mb-2 text-section-label">Market read · {competitors.length} listing{competitors.length === 1 ? "" : "s"}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="Median price"
          value={money(medPrice)}
          sub={lo != null && hi != null ? `${money(lo)}–${money(hi)} band` : undefined}
        />
        <Stat
          label="Your target"
          value={targetSellPrice != null ? money(targetSellPrice) : "—"}
          sub={
            targetDelta == null ? undefined : (
              <span className={targetDelta <= 0 ? "text-pass" : "text-fail"}>
                {targetDelta <= 0 ? "" : "+"}{money(targetDelta)} vs median
              </span>
            )
          }
          hue="text-target"
        />
        <Stat label="Best BSR" value={bestBsr != null ? `#${int(bestBsr)}` : "—"} sub="lower = hotter" />
        <Stat label="Bought / mo" value={totalSold ? int(totalSold) : "—"} sub="across listings" />
        <Stat
          label="Review momentum"
          value={momentum ? `+${int(momentum)}` : "—"}
          sub="added · 90d"
          hue={momentum ? "text-pass" : undefined}
        />
        {fbaEstimate && (
          <Stat
            label="FBA fee"
            value={`${money(fbaEstimate.fee)}/u`}
            sub={fbaEstimate.source === "amazon-actual" ? `median of ${fbaEstimate.n} comps` : "est. from box size"}
            hue="text-quoted"
          />
        )}
      </div>
    </div>
  );
}
