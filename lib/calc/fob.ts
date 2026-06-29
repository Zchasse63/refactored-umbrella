/**
 * Estimated Greenway FOB cost for foodservice items we don't have a real quote on yet.
 *
 * HONEST FRAMING: this is an EXTRAPOLATION from the validated cost model (anchored to real
 * Greenway DDP/FOB-Houston quotes), NOT a quote. It nails the cost driver per category:
 *   • Straws (PP): cost/ea ≈ K · bore_mm² · length_in  (poly wrap +$0.0008)
 *   • Liners / produce bags: priced BY THE POUND — resin weight × $/lb
 *       weight_lb = 2 · W · H · (mil/1000) · 0.0332 lb/in³   (reproduces the Greenway liner to the gram)
 *   • Thank-you / t-shirt bags: anchored to the Greenway T-sack at $0.012/bag, scaled by size×gauge
 * Use it as a starting our_cost until a factory quote replaces it.
 */
import type { Spec } from "@/lib/types";

const STRAW_K = 1.05e-5; // fits the 4 Greenway straw quotes within ±8%
const DENSITY_LB_IN3 = 0.0332; // PE ~0.92 g/cc
const LB_LDPE = 0.95; // Greenway can-liner anchor
const LB_HDPE = 1.05;
const TY_REF = 11.5 * 21 * 0.472; // 1/6 t-shirt reference: W × H × mil
const TY_ANCHOR = 0.012; // $/bag at the reference size

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FobEstimate {
  fobPerPack: number; // estimated FOB cost for this product's sellable pack (USD)
  perUnit: number; // per straw / per bag
  method: string;
  confidence: "low" | "medium" | "high";
}

const get = (specs: Spec[], re: RegExp): string | null => specs.find((s) => re.test(s.label))?.value ?? null;
const firstNum = (s: string | null): number | null => {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const gaugeMil = (s: string | null): number | null => {
  if (!s) return null;
  const mil = s.match(/([\d.]+)\s*mil/i);
  if (mil) return parseFloat(mil[1]);
  const mic = s.match(/([\d.]+)\s*micron/i);
  return mic ? parseFloat(mic[1]) / 25.4 : null;
};
const dims = (s: string | null): number[] => (s ? (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number) : []);

/** Extrapolate the Greenway FOB cost from a product's category (group_name) + specs. */
export function estimateFobCost(groupName: string | null, specs: Spec[]): FobEstimate | null {
  if (!groupName || !specs?.length) return null;
  const pack = firstNum(get(specs, /pack|count/i));
  const g = groupName.toLowerCase();

  if (g.includes("straw")) {
    const bore = firstNum(get(specs, /bore/i));
    const length = firstNum(get(specs, /length/i));
    if (!bore || !length || !pack) return null;
    let perUnit = STRAW_K * bore * bore * length;
    if (/poly/i.test(get(specs, /wrap/i) ?? "")) perUnit += 0.0008;
    return { fobPerPack: round2(perUnit * pack), perUnit, method: "straw model (bore²·length, Greenway-anchored)", confidence: "medium" };
  }

  if (g.includes("liner") || g.includes("produce")) {
    const d = dims(get(specs, /size|dimension/i));
    const mil = gaugeMil(get(specs, /gauge|mil|micron/i));
    if (d.length < 2 || !mil || !pack) return null;
    const [w, h] = d;
    const weightPerBag = 2 * w * h * (mil / 1000) * DENSITY_LB_IN3;
    const rate = /hdpe/i.test(get(specs, /material/i) ?? "") ? LB_HDPE : LB_LDPE;
    const perUnit = weightPerBag * rate;
    return { fobPerPack: round2(perUnit * pack), perUnit, method: `by-the-pound (${weightPerBag.toFixed(3)} lb × $${rate}/lb)`, confidence: "high" };
  }

  if (g.includes("carryout") || g.includes("t-shirt") || g.includes("thank")) {
    const d = dims(get(specs, /size|dimension/i)); // W × gusset × H → use W and H
    const mil = gaugeMil(get(specs, /gauge|mil|micron/i));
    if (d.length < 2 || !mil || !pack) return null;
    const w = d[0], h = d[d.length - 1];
    const perUnit = TY_ANCHOR * (w * h * mil) / TY_REF;
    return { fobPerPack: round2(perUnit * pack), perUnit, method: "t-shirt anchor ($0.012/bag scaled by size×gauge)", confidence: "high" };
  }

  return null;
}
