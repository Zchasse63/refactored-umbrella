import { Badge } from "@/components/ui/badge";
import type { Tier } from "@/lib/types";

/** THE canonical tier treatment — every tier chip in the Portal renders through here.
 *
 *  Tiers are the partner's market-side prospect signal, so they live in the
 *  violet / amber / slate family (DESIGN_GUIDE §3.0: violet = partner/market side).
 *  They must NEVER reuse the economics hues — emerald is reserved for PASS and rose
 *  for FAIL — otherwise tier "Pursue" reads as "clears target" and tier "Pass"
 *  (= skip this product) collides with an economics PASS. The glyph + literal text
 *  label keep the chip colorblind-safe and unambiguous next to a PASS/FAIL pill. */
const TIER: Record<Tier, { label: string; glyph: string; variant: "partner" | "warn" | "neutral" }> = {
  pursue: { label: "Pursue", glyph: "●", variant: "partner" }, // violet — partner's go signal
  maybe: { label: "Maybe", glyph: "◐", variant: "warn" }, // amber — undecided
  pass: { label: "Pass", glyph: "○", variant: "neutral" }, // slate — passed over (not economics PASS)
};

export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  const t = TIER[tier];
  return (
    <Badge variant={t.variant} className={className} title={`Tier: ${t.label}`}>
      <span aria-hidden className="text-[9px] leading-none">{t.glyph}</span>
      {t.label}
    </Badge>
  );
}
