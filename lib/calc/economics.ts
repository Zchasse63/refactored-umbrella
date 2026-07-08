/**
 * The Portal economics engine — a clean rewrite of fba_calc.py (NOT a port).
 * The old script's agency lines (3% commission + $100/SKU flat fee) and FOB/freight
 * math are intentionally absent. Pure, deterministic, no I/O. See BUILD_PLAN §8.
 *
 * Cost stack = KNOWN Amazon fees only: referral 15% + the real FBA fee (per-unit, swapped
 * in from competitor data) + an "Other fees" line the partner fills in (ads/returns/etc).
 * We never bake in fees we can't source — this mirrors the partner Excel backup so the site
 * and the workbook speak with one voice. OUR booked cost is padded by COST_BUFFER (7%) for
 * freight/prep/variance, exactly like the workbook's 1.07 pad.
 * Target gross margin 65% → target landed ≤ 35% of sell (DDP, duty-paid, no FOB).
 *
 * TERMINOLOGY SAFEGUARD: "gross margin" is COGS-vs-price (landed ≤ 35%); variable opex is
 * SEPARATE — never conflate the two. Labels below enforce it.
 */
import type { Assumptions, CalcInputs, CostLine, Line } from "@/lib/types";

// KNOWN fees only. "fba" is a placeholder % that gets swapped for the real per-unit FBA fee
// whenever competitor data supplies one; "other" starts at 0 for the partner to fill in the
// fees we can't know up front (ads, returns, etc). Ads/returns are intentionally NOT defaulted.
export const DEFAULT_COST_STACK: CostLine[] = [
  { key: "referral", label: "Referral", pct: 0.15 },
  { key: "fba", label: "FBA logistics", pct: 0.15 },
  { key: "other", label: "Other fees", pct: 0 },
];

export const DEFAULT_GROSS_MARGIN = 0.65;

/** Buffer padded onto OUR booked cost for freight/prep/variance — mirrors the 1.07 pad in
 *  the partner Excel backup so the site's "our cost" and the workbook's agree to the cent. */
export const COST_BUFFER = 0.07;

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  grossMargin: DEFAULT_GROSS_MARGIN,
  costStack: DEFAULT_COST_STACK,
};

/** Amazon FBA opex applies to every line we retail on Amazon. Foodservice was
 *  originally B2B-only (cost display, no Amazon stack) — that changed 2026-07:
 *  foodservice is the Amazon-FIRST line (thank-you bags, straws, liners), so its
 *  economics must carry the full referral/ads/returns stack + real FBA fee, or the
 *  partner sees inflated margins on exactly the launch SKUs. */
export const LINE_OPEX_APPLIES: Record<Line, boolean> = {
  appliance: true,
  beauty: true,
  foodservice: true,
};

/** Structurally-safe labels so the UI can never misread gross (65%) as net (~16%). */
export const LABELS = {
  grossMargin: "Gross margin (COGS vs price)",
  targetLandedCaption:
    "= (1 − gross margin) × sell price (DDP, duty-paid, no freight breakout)",
  net: "Net margin (after known Amazon fees · opex is separate)",
  opex: "Amazon variable opex — separate from gross margin",
} as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function opexPct(stack: CostLine[]): number {
  return stack.reduce((s, l) => s + (Number.isFinite(l.pct) ? l.pct : 0), 0);
}

/** The single negotiation number (DDP). */
export function targetLanded(sell: number, grossMargin: number): number {
  return round2((1 - grossMargin) * sell);
}

export function netPerUnit(sell: number, landed: number, opex: number): number {
  return round2(sell - landed - opex * sell);
}

export interface QuoteVerdict {
  gross: number; // actual gross margin at the quote (display only — NOT the verdict)
  pass: boolean; // quoted ≤ printed (rounded) target, i.e. headroom ≥ 0
  headroom: number; // targetLanded − quotedLanded (positive = under the ceiling)
  target: number; // gross-margin target it was checked against
}

export function quoteCheck(
  sell: number,
  quotedLanded: number,
  target: number,
  grossMarginTarget: number,
): QuoteVerdict {
  // Pass/fail is judged on the ROUNDED cents the factory actually sees: the RFQ sheet
  // and UI print round2 targets, so a quote AT the printed ceiling must PASS even when
  // the raw target rounded UP (sell 40.10 @ 65% → raw 14.035 → printed 14.04; raw gross
  // at 14.04 is 0.64988 < 0.65). compute() already passes round2'd numbers — round
  // defensively here so pass and the displayed headroom can never disagree.
  const q = round2(quotedLanded);
  const t = round2(target);
  const gross = (sell - q) / sell; // kept for display; NOT the verdict
  return {
    gross,
    pass: q <= t,
    headroom: round2(t - q),
    target: grossMarginTarget,
  };
}

/** Effective assumptions = global, with any per-product override applied field-wise. */
export function resolveAssumptions(
  global: Assumptions,
  overrides?: CalcInputs | null,
): Assumptions {
  if (!overrides || overrides.overridden === false) return global;
  return {
    grossMargin: overrides.grossMargin ?? global.grossMargin,
    costStack: overrides.costStack ?? global.costStack,
  };
}

export type LiveColumn = "quoted" | "actual" | "target";

export interface Economics {
  guarded: boolean; // true → sell ≤ 0; render EMDASH everywhere
  sellPrice: number | null;
  opexPct: number;
  opex: number | null;
  grossMarginTarget: number;

  targetLanded: number | null;
  targetNet: number | null;
  targetNetPct: number | null;

  quotedLanded?: number;
  quotedNet?: number;
  quotedNetPct?: number;
  quotedGross?: number;

  actualLanded?: number;
  actualNet?: number;
  actualNetPct?: number;

  liveColumn: LiveColumn;
  liveNet: number | null;
  liveNetPct: number | null;

  fbaPerUnit?: number | null; // the estimated FBA fee applied to opex (if any)
  verdict?: QuoteVerdict; // present only when a quote exists
}

export interface ComputeInput {
  assumptions: Assumptions;
  sellPrice: number | null | undefined;
  quotedLanded?: number | null;
  actualLanded?: number | null;
  /** false → skip the Amazon fee stack entirely (opex = 0). No line sets this today —
   *  every line carries opex per LINE_OPEX_APPLIES (foodservice was the false case
   *  until 2026-07). Kept for cost-only displays and callers outside the line map. */
  applyOpex?: boolean;
  /** Estimated FBA fulfillment fee (USD/unit). When set, replaces the flat FBA % line. */
  fbaPerUnit?: number | null;
}

/** The one entry point the UI calls. */
export function compute({
  assumptions,
  sellPrice,
  quotedLanded,
  actualLanded,
  applyOpex = true,
  fbaPerUnit,
}: ComputeInput): Economics {
  const gm = assumptions.grossMargin;
  const opx = applyOpex ? opexPct(assumptions.costStack) : 0;

  // Guard: empty / zero / non-finite sell price → everything em-dash, never NaN/$0.
  if (sellPrice == null || !Number.isFinite(sellPrice) || sellPrice <= 0) {
    return {
      guarded: true,
      sellPrice: null,
      opexPct: opx,
      opex: null,
      grossMarginTarget: gm,
      targetLanded: null,
      targetNet: null,
      targetNetPct: null,
      liveColumn: "target",
      liveNet: null,
      liveNetPct: null,
    };
  }

  const sell = sellPrice;
  // When a competitor-derived FBA $/unit is supplied, swap the flat FBA % line for it.
  let effOpx = opx;
  const fbaApplied = applyOpex && fbaPerUnit != null && Number.isFinite(fbaPerUnit) && fbaPerUnit >= 0;
  if (fbaApplied) {
    const fbaLinePct = assumptions.costStack.find((l) => l.key === "fba")?.pct ?? 0;
    effOpx = opx - fbaLinePct + (fbaPerUnit as number) / sell;
  }
  const opex = round2(effOpx * sell);
  const tLanded = targetLanded(sell, gm);
  const tNet = netPerUnit(sell, tLanded, effOpx);

  const eco: Economics = {
    guarded: false,
    sellPrice: sell,
    opexPct: effOpx,
    opex,
    grossMarginTarget: gm,
    targetLanded: tLanded,
    targetNet: tNet,
    targetNetPct: tNet / sell,
    liveColumn: "target",
    liveNet: tNet,
    liveNetPct: tNet / sell,
    fbaPerUnit: fbaApplied ? (fbaPerUnit as number) : null,
  };

  if (actualLanded != null && Number.isFinite(actualLanded)) {
    // Pad OUR booked cost by COST_BUFFER (freight/prep/variance), then round ONCE so net/pct
    // and the displayed figure agree exactly. The quoted/target columns stay UN-buffered —
    // those are the raw factory number and the price-derived RFQ ceiling, not our cost.
    const a = round2(actualLanded * (1 + COST_BUFFER));
    const net = netPerUnit(sell, a, effOpx);
    eco.actualLanded = a;
    eco.actualNet = net;
    eco.actualNetPct = net / sell;
    eco.liveColumn = "actual";
    eco.liveNet = net;
    eco.liveNetPct = net / sell;
  }

  if (quotedLanded != null && Number.isFinite(quotedLanded)) {
    // round ONCE; verdict/gross/net must evaluate the same number the UI shows,
    // else a >2-decimal quote can display at-ceiling yet pass/fail off the raw value
    const q = round2(quotedLanded);
    const net = netPerUnit(sell, q, effOpx);
    eco.quotedLanded = q;
    eco.quotedNet = net;
    eco.quotedNetPct = net / sell;
    eco.quotedGross = (sell - q) / sell;
    eco.verdict = quoteCheck(sell, q, tLanded, gm);
    // Quoted is the live column whenever a quote exists (precedence: quoted > actual > target).
    eco.liveColumn = "quoted";
    eco.liveNet = net;
    eco.liveNetPct = net / sell;
  }

  return eco;
}
