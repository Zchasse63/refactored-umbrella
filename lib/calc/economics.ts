/**
 * The Portal economics engine — a clean rewrite of fba_calc.py (NOT a port).
 * The old script's agency lines (3% commission + $100/SKU flat fee) and FOB/freight
 * math are intentionally absent. Pure, deterministic, no I/O. See BUILD_PLAN §8.
 *
 * Cost stack: referral 15 + ads 15 + FBA 15 + returns 4 (+ partner-split 0) = 49% opex.
 * Target gross margin 65% → target landed ≤ 35% of sell (DDP, duty-paid, no FOB).
 *
 * TERMINOLOGY SAFEGUARD: "gross margin" is COGS-vs-price (landed ≤ 35%); the 49% opex
 * is SEPARATE, so NET ≈ 16% of price — never conflate the two. Labels below enforce it.
 */
import type { Assumptions, CalcInputs, CostLine, Line } from "@/lib/types";

export const DEFAULT_COST_STACK: CostLine[] = [
  { key: "referral", label: "Referral", pct: 0.15 },
  { key: "ads", label: "Ads", pct: 0.15 },
  { key: "fba", label: "FBA logistics", pct: 0.15 },
  { key: "returns", label: "Returns", pct: 0.04 },
  { key: "partner_split", label: "Partner split", pct: 0 },
];

export const DEFAULT_GROSS_MARGIN = 0.65;

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  grossMargin: DEFAULT_GROSS_MARGIN,
  costStack: DEFAULT_COST_STACK,
};

/** Amazon FBA opex applies to appliance/beauty; foodservice (B2B) is cost-only. */
export const LINE_OPEX_APPLIES: Record<Line, boolean> = {
  appliance: true,
  beauty: true,
  foodservice: false,
};

/** Structurally-safe labels so the UI can never misread gross (65%) as net (~16%). */
export const LABELS = {
  grossMargin: "Gross margin (COGS vs price)",
  targetLandedCaption:
    "= (1 − gross margin) × sell price (DDP, duty-paid, no freight breakout)",
  net: "Net margin (~16% of price · opex is separate)",
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
  gross: number; // actual gross margin at the quote
  pass: boolean;
  headroom: number; // targetLanded − quotedLanded (positive = under the ceiling)
  target: number; // gross-margin target it was checked against
}

export function quoteCheck(
  sell: number,
  quotedLanded: number,
  target: number,
  grossMarginTarget: number,
): QuoteVerdict {
  const gross = (sell - quotedLanded) / sell;
  return {
    gross,
    pass: gross >= grossMarginTarget,
    headroom: round2(target - quotedLanded),
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

  verdict?: QuoteVerdict; // present only when a quote exists
}

export interface ComputeInput {
  assumptions: Assumptions;
  sellPrice: number | null | undefined;
  quotedLanded?: number | null;
  actualLanded?: number | null;
  /** false for foodservice (no Amazon-FBA opex). */
  applyOpex?: boolean;
}

/** The one entry point the UI calls. */
export function compute({
  assumptions,
  sellPrice,
  quotedLanded,
  actualLanded,
  applyOpex = true,
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
  const opex = round2(opx * sell);
  const tLanded = targetLanded(sell, gm);
  const tNet = netPerUnit(sell, tLanded, opx);

  const eco: Economics = {
    guarded: false,
    sellPrice: sell,
    opexPct: opx,
    opex,
    grossMarginTarget: gm,
    targetLanded: tLanded,
    targetNet: tNet,
    targetNetPct: tNet / sell,
    liveColumn: "target",
    liveNet: tNet,
    liveNetPct: tNet / sell,
  };

  if (actualLanded != null && Number.isFinite(actualLanded)) {
    const net = netPerUnit(sell, actualLanded, opx);
    eco.actualLanded = round2(actualLanded);
    eco.actualNet = net;
    eco.actualNetPct = net / sell;
    eco.liveColumn = "actual";
    eco.liveNet = net;
    eco.liveNetPct = net / sell;
  }

  if (quotedLanded != null && Number.isFinite(quotedLanded)) {
    const net = netPerUnit(sell, quotedLanded, opx);
    eco.quotedLanded = round2(quotedLanded);
    eco.quotedNet = net;
    eco.quotedNetPct = net / sell;
    eco.quotedGross = (sell - quotedLanded) / sell;
    eco.verdict = quoteCheck(sell, quotedLanded, tLanded, gm);
    // Quoted is the live column whenever a quote exists (precedence: quoted > actual > target).
    eco.liveColumn = "quoted";
    eco.liveNet = net;
    eco.liveNetPct = net / sell;
  }

  return eco;
}
