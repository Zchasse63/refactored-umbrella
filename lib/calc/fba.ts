/**
 * Estimated Amazon US FBA fulfillment fee from competitor package dimensions.
 *
 * HONEST FRAMING: this is an ESTIMATE, not Amazon's invoice. We don't have the factory's
 * carton specs, so we approximate this product's size tier from the MEDIAN of its verified
 * competitors' Keepa package dims (a 5-cup coffee maker ships in ~the same box as its rivals).
 * It nails the fulfillment fee's main driver (size tier + weight); storage fees are excluded.
 * Tiers + fees use Amazon's US 2024 fulfillment-fee table (non-apparel, standard). The fee
 * weight is max(unit weight, dimensional weight = L×W×H/139) once a box exceeds 1 cubic foot,
 * so light-but-bulky items (air fryers) aren't underestimated; and if a competitor price is
 * available the ≤$10 Low-Price FBA table is used. Real competitor fees still win when present.
 */

export interface PackageDims {
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  weight_g: number | null;
  /**
   * OPTIONAL competitor sale price (USD). When present on the median row, it lets the
   * dims-estimate fallback pick Amazon's Low-Price FBA table (≤$10 items) instead of the
   * standard table. Absent for current callers → standard table (behavior unchanged).
   * This is an additive optional field; it does NOT change estimateFbaFee's signature.
   */
  price_usd?: number | null;
}

export type FbaTier = "small-standard" | "large-standard" | "large-bulky" | "extra-large";

export interface FbaEstimate {
  fee: number; // per-unit fulfillment fee (USD)
  source: "amazon-actual" | "dims-estimate"; // median of competitors' real Keepa fees vs dims-table estimate
  tier: FbaTier | null; // null when source=amazon-actual and dims unusable
  tierLabel: string;
  n: number; // data points the estimate is based on
  confidence: "low" | "medium" | "high";
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLb: number;
}

const MM_PER_IN = 25.4;
const G_PER_LB = 453.592;
const G_PER_OZ = 28.3495;

/**
 * Amazon's dimensional-weight divisor for US FBA (2024): (L × W × H in inches) / 139.
 * For large-standard and larger tiers Amazon bills on the GREATER of unit weight and dim
 * weight, so a light-but-bulky box (e.g. an air fryer) is charged on its cubic volume, not
 * its scale weight — BUT only once the package exceeds 1 cubic foot (1,728 cu in). Below
 * that, unit weight is used, so a small dense box isn't over-charged. Source: Amazon Seller
 * Central "Product size tiers" / "FBA fulfillment fee" — dimensional weight (>1 cu ft gate).
 */
const DIM_DIVISOR = 139;
const CUBIC_FOOT_IN3 = 1728;
const dimWeightLb = (lengthIn: number, widthIn: number, heightIn: number): number =>
  (lengthIn * widthIn * heightIn) / DIM_DIVISOR;

/**
 * Low-Price FBA (2024): items with a total sales price of $10 or less are charged the
 * Low-Price FBA fulfillment rate, which runs a flat $0.77 below the equivalent standard
 * rate for standard-size tiers. We apply the same discount to the standard band lookup.
 * Sources: myamazonguy.com / envisionhorizons.com 2024 FBA fee write-ups ("$0.77 less than
 * standard FBA rates" for items under $10).
 */
const LOW_PRICE_THRESHOLD_USD = 10;
const LOW_PRICE_DISCOUNT = 0.77;

const median = (xs: number[]): number | null => {
  const v = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Amazon US 2024 STANDARD fulfillment fee for a (tier, weight) — non-apparel, standard rate
 * card effective April 15, 2024. Fee is a per-band lookup; large-standard/bulky/XL bill on
 * max(unit, dimensional) weight (handled by the caller).
 *
 * Small standard-size (billed on unit weight, 2-oz intervals up to 16 oz):
 *   0–2 oz $3.06 · 2–4 $3.15 · 4–6 $3.24 · 6–8 $3.33 · 8–10 $3.43 · 10–12 $3.53 ·
 *   12–14 $3.60 · 14–16 $3.65
 * Large standard-size (billed on greater of unit/dim weight):
 *   4-oz steps to 1 lb → 0–4 oz $3.68 · 4–8 $3.90 · 8–12 $4.15 · 12–16 $4.55, then
 *   1–1.25 lb $4.99 · 1.25–1.5 $5.37 · 1.5–1.75 $5.52 · 1.75–2.25 $5.77 · 2.25–2.75 $5.83 ·
 *   2.75–3 $6.05, and 3+ lb → $6.92 + $0.08 per 4-oz increment above 3 lb (to 20 lb).
 * Source: Amazon Seller Central "FBA fulfillment fee" 2024 US rate card (standard size,
 * non-apparel); figures corroborated by junglescout.com / envisionhorizons.com 2024 tables.
 */
function feeFor(tier: FbaTier, weightLb: number, weightOz: number, lowPrice: boolean): number {
  const disc = (fee: number) => (lowPrice ? fee - LOW_PRICE_DISCOUNT : fee);
  if (tier === "small-standard") {
    let fee: number;
    if (weightOz <= 2) fee = 3.06;
    else if (weightOz <= 4) fee = 3.15;
    else if (weightOz <= 6) fee = 3.24;
    else if (weightOz <= 8) fee = 3.33;
    else if (weightOz <= 10) fee = 3.43;
    else if (weightOz <= 12) fee = 3.53;
    else if (weightOz <= 14) fee = 3.6;
    else fee = 3.65; // 14–16 oz
    return disc(fee);
  }
  if (tier === "large-standard") {
    let fee: number;
    if (weightOz <= 4) fee = 3.68;
    else if (weightOz <= 8) fee = 3.9;
    else if (weightOz <= 12) fee = 4.15;
    else if (weightOz <= 16) fee = 4.55;
    else if (weightLb <= 1.25) fee = 4.99;
    else if (weightLb <= 1.5) fee = 5.37;
    else if (weightLb <= 1.75) fee = 5.52;
    else if (weightLb <= 2.25) fee = 5.77;
    else if (weightLb <= 2.75) fee = 5.83;
    else if (weightLb <= 3) fee = 6.05;
    // 3–20 lb: 6.92 + 0.08 per 4-oz (0.25 lb) increment above 3 lb
    else fee = 6.92 + Math.ceil((weightLb - 3) / 0.25) * 0.08;
    return disc(fee);
  }
  if (tier === "large-bulky") {
    // 9.61 + 0.38 per lb above the first lb (Low-Price FBA does not apply to bulky/XL)
    return 9.61 + Math.max(0, Math.ceil(weightLb - 1)) * 0.38;
  }
  // extra-large (coarse): 26.33 + 0.38 per lb above first lb
  return 26.33 + Math.max(0, Math.ceil(weightLb - 1)) * 0.38;
}

function tierFor(lengthIn: number, widthIn: number, heightIn: number, weightLb: number): FbaTier {
  const sides = [lengthIn, widthIn, heightIn].sort((a, b) => b - a); // longest → shortest
  const [longest, median_, shortest] = sides;
  const oz = weightLb * 16;
  // shortest <= 0.75in is INTENTIONAL: Amazon's small-standard envelope thickness cap,
  // not a unit bug. Appliances are thicker than 0.75in so they never qualify here.
  if (oz <= 16 && longest <= 15 && median_ <= 12 && shortest <= 0.75) return "small-standard";
  if (weightLb <= 20 && longest <= 18 && median_ <= 14 && shortest <= 8) return "large-standard";
  if (weightLb <= 50 && longest <= 59 && median_ <= 33 && longest + 2 * (median_ + shortest) <= 130) return "large-bulky";
  return "extra-large";
}

const TIER_LABEL: Record<FbaTier, string> = {
  "small-standard": "Small standard",
  "large-standard": "Large standard",
  "large-bulky": "Large bulky",
  "extra-large": "Extra-large",
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Per-unit FBA fulfillment fee. PRECEDENCE: the median of competitors' REAL Keepa
 * pick&pack fees beats the dims-table estimate — the real fee already bakes in Amazon's
 * Low-Price-FBA rate (≤$10 items) and the exact tier, which the table can't. Falls back to
 * the dims→tier→table path when no real fees are available. Returns null if neither works.
 */
export function estimateFbaFee(dims: PackageDims[], realFees: (number | null)[] = []): FbaEstimate | null {
  const fees = realFees.filter((f): f is number => f != null && Number.isFinite(f) && f > 0);
  const medianReal = median(fees);

  // Dims-derived measurements/tier (for display, and as the fallback fee source).
  const usable = dims.filter((d) => d.length_mm && d.width_mm && d.height_mm && d.weight_g);
  let d:
    | { tier: FbaTier; lengthIn: number; widthIn: number; heightIn: number; weightLb: number; feeWeightLb: number; feeWeightOz: number; lowPrice: boolean }
    | null = null;
  if (usable.length) {
    const lengthIn = (median(usable.map((x) => x.length_mm!)) ?? 0) / MM_PER_IN;
    const widthIn = (median(usable.map((x) => x.width_mm!)) ?? 0) / MM_PER_IN;
    const heightIn = (median(usable.map((x) => x.height_mm!)) ?? 0) / MM_PER_IN;
    const weightG = median(usable.map((x) => x.weight_g!)) ?? 0;
    const weightLb = weightG / G_PER_LB; // physical weight — drives tier classification & display
    if (weightLb > 0 && lengthIn > 0) {
      // Tier is set by physical dims/weight; the FEE is then billed on the greater of unit
      // weight and dimensional weight ((L×W×H)/139) for large-standard and larger tiers,
      // but only once the box exceeds 1 cubic foot. Small standard bills on unit weight only.
      // A light-but-bulky box (air fryer) in large-standard is now charged on its cube,
      // fixing the prior underestimate; a small dense box stays on unit weight (no over-charge).
      const tier = tierFor(lengthIn, widthIn, heightIn, weightLb);
      const volumeIn3 = lengthIn * widthIn * heightIn;
      const dimApplies = tier !== "small-standard" && volumeIn3 > CUBIC_FOOT_IN3;
      const feeWeightLb = dimApplies ? Math.max(weightLb, dimWeightLb(lengthIn, widthIn, heightIn)) : weightLb;
      // Low-Price FBA (≤$10) selection from the median competitor price, when a price is
      // available on the dims rows. Absent → undefined median → standard table (unchanged).
      const priceMedian = median(usable.map((x) => (x.price_usd == null ? NaN : x.price_usd)));
      const lowPrice = priceMedian != null && priceMedian <= LOW_PRICE_THRESHOLD_USD;
      d = { tier, lengthIn, widthIn, heightIn, weightLb, feeWeightLb, feeWeightOz: feeWeightLb * 16, lowPrice };
    }
  }

  const dimsFields = {
    tier: d?.tier ?? null,
    tierLabel: d ? TIER_LABEL[d.tier] : "Unknown",
    lengthIn: d ? round1(d.lengthIn) : 0,
    widthIn: d ? round1(d.widthIn) : 0,
    heightIn: d ? round1(d.heightIn) : 0,
    weightLb: d ? round2(d.weightLb) : 0, // display keeps PHYSICAL weight, not the billed fee weight
  };
  const conf = (n: number, hi: number): "low" | "medium" | "high" => (n >= hi ? "high" : n >= 2 ? "medium" : "low");

  if (medianReal != null)
    return { fee: round2(medianReal), source: "amazon-actual", n: fees.length, confidence: conf(fees.length, 3), ...dimsFields };
  if (!d) return null;
  return {
    fee: round2(feeFor(d.tier, d.feeWeightLb, d.feeWeightOz, d.lowPrice)),
    source: "dims-estimate",
    n: usable.length,
    confidence: conf(usable.length, 4),
    ...dimsFields,
  };
}
