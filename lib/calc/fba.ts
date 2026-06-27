/**
 * Estimated Amazon US FBA fulfillment fee from competitor package dimensions.
 *
 * HONEST FRAMING: this is an ESTIMATE, not Amazon's invoice. We don't have the factory's
 * carton specs, so we approximate this product's size tier from the MEDIAN of its verified
 * competitors' Keepa package dims (a 5-cup coffee maker ships in ~the same box as its rivals).
 * It nails the fulfillment fee's main driver (size tier + weight); storage fees are excluded.
 * Tiers + fees use Amazon's US 2024 fulfillment-fee table (non-apparel, standard).
 */

export interface PackageDims {
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  weight_g: number | null;
}

export type FbaTier = "small-standard" | "large-standard" | "large-bulky" | "extra-large";

export interface FbaEstimate {
  fee: number; // estimated per-unit fulfillment fee (USD)
  tier: FbaTier;
  tierLabel: string;
  n: number; // competitors the estimate is based on
  confidence: "low" | "medium" | "high";
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLb: number;
}

const MM_PER_IN = 25.4;
const G_PER_LB = 453.592;
const G_PER_OZ = 28.3495;

const median = (xs: number[]): number | null => {
  const v = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** Amazon US 2024 standard fulfillment fee for a (tier, weight) — non-apparel. */
function feeFor(tier: FbaTier, weightLb: number, weightOz: number): number {
  if (tier === "small-standard") {
    if (weightOz <= 4) return 3.06;
    if (weightOz <= 8) return 3.15;
    if (weightOz <= 12) return 3.24;
    return 3.43; // 12–16 oz
  }
  if (tier === "large-standard") {
    if (weightOz <= 4) return 3.68;
    if (weightOz <= 8) return 3.9;
    if (weightOz <= 12) return 4.15;
    if (weightOz <= 16) return 4.55;
    if (weightLb <= 1.5) return 4.99;
    if (weightLb <= 2) return 5.37;
    if (weightLb <= 2.5) return 5.52;
    if (weightLb <= 3) return 5.77;
    // 3–20 lb: 6.92 + 0.08 per half-lb above 3 lb
    return 6.92 + Math.ceil((weightLb - 3) / 0.5) * 0.08;
  }
  if (tier === "large-bulky") {
    // 9.61 + 0.38 per lb above the first lb
    return 9.61 + Math.max(0, Math.ceil(weightLb - 1)) * 0.38;
  }
  // extra-large (coarse): 26.33 + 0.38 per lb above first lb
  return 26.33 + Math.max(0, Math.ceil(weightLb - 1)) * 0.38;
}

function tierFor(lengthIn: number, widthIn: number, heightIn: number, weightLb: number): FbaTier {
  const sides = [lengthIn, widthIn, heightIn].sort((a, b) => b - a); // longest → shortest
  const [longest, median_, shortest] = sides;
  const oz = weightLb * 16;
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

/** Median competitor dims → estimated FBA fulfillment fee, or null if no usable dims. */
export function estimateFbaFee(dims: PackageDims[]): FbaEstimate | null {
  const usable = dims.filter((d) => d.length_mm && d.width_mm && d.height_mm && d.weight_g);
  if (usable.length === 0) return null;

  const lengthIn = (median(usable.map((d) => d.length_mm!)) ?? 0) / MM_PER_IN;
  const widthIn = (median(usable.map((d) => d.width_mm!)) ?? 0) / MM_PER_IN;
  const heightIn = (median(usable.map((d) => d.height_mm!)) ?? 0) / MM_PER_IN;
  const weightG = median(usable.map((d) => d.weight_g!)) ?? 0;
  const weightLb = weightG / G_PER_LB;
  const weightOz = weightG / G_PER_OZ;
  if (weightLb <= 0 || lengthIn <= 0) return null;

  const tier = tierFor(lengthIn, widthIn, heightIn, weightLb);
  const fee = Math.round(feeFor(tier, weightLb, weightOz) * 100) / 100;
  const confidence = usable.length >= 4 ? "high" : usable.length >= 2 ? "medium" : "low";

  return {
    fee,
    tier,
    tierLabel: TIER_LABEL[tier],
    n: usable.length,
    confidence,
    lengthIn: Math.round(lengthIn * 10) / 10,
    widthIn: Math.round(widthIn * 10) / 10,
    heightIn: Math.round(heightIn * 10) / 10,
    weightLb: Math.round(weightLb * 100) / 100,
  };
}
