import { describe, it, expect } from "vitest";
import { estimateFbaFee } from "./fba";

const d = (l: number, w: number, h: number, g: number) => ({ length_mm: l, width_mm: w, height_mm: h, weight_g: g });

describe("estimateFbaFee", () => {
  it("returns null when no usable dims", () => {
    expect(estimateFbaFee([])).toBeNull();
    expect(estimateFbaFee([{ length_mm: null, width_mm: null, height_mm: null, weight_g: null }])).toBeNull();
  });

  it("classifies a ~1 lb item as large standard with the right fee", () => {
    // 250×180×120 mm (9.8×7.1×4.7 in), 500 g (~1.1 lb) → large standard
    const est = estimateFbaFee([d(250, 180, 120, 500)])!;
    expect(est).not.toBeNull();
    expect(est.tier).toBe("large-standard");
    expect(est.fee).toBeCloseTo(4.99, 2); // 1–1.5 lb large standard
    expect(est.source).toBe("dims-estimate");
    expect(est.n).toBe(1);
    expect(est.confidence).toBe("low");
  });

  it("PREFERS the median of real competitor fees over the dims-table estimate (Low-Price FBA)", () => {
    // same ~1 lb box (table would say $4.99) but real Keepa fees say $4.28 (sub-$10 low-price)
    const est = estimateFbaFee([d(250, 180, 120, 500)], [4.28, 4.28, null, 4.82])!;
    expect(est.source).toBe("amazon-actual");
    expect(est.fee).toBeCloseTo(4.28, 2); // median of [4.28,4.28,4.82], nulls dropped
    expect(est.n).toBe(3);
    expect(est.tier).toBe("large-standard"); // dims still shown for context
  });

  it("falls back to dims when real fees are all null/invalid", () => {
    const est = estimateFbaFee([d(250, 180, 120, 500)], [null, -1, 0])!;
    expect(est.source).toBe("dims-estimate");
    expect(est.fee).toBeCloseTo(4.99, 2);
  });

  it("uses the MEDIAN across competitors and raises confidence", () => {
    const est = estimateFbaFee([
      d(250, 180, 120, 500),
      d(255, 185, 122, 520),
      d(248, 178, 119, 495),
      d(252, 182, 121, 510),
    ])!;
    expect(est.n).toBe(4);
    expect(est.confidence).toBe("high");
    expect(est.tier).toBe("large-standard");
  });

  it("prices a 3.3 lb large-standard item per 4-oz increments above 3 lb", () => {
    // 300×200×150 mm (11.8×7.9×5.9 in), 1500 g (~3.3 lb) → large standard
    const est = estimateFbaFee([{ length_mm: 300, width_mm: 200, height_mm: 150, weight_g: 1500 }])!;
    expect(est.tier).toBe("large-standard");
    // 6.92 + ceil((3.307−3)/0.25)*0.08 = 6.92 + 2*0.08 = 7.08
    expect(est.fee).toBeCloseTo(7.08, 2);
  });

  it("classifies a large heavy item as large-bulky", () => {
    // 600×500×450 mm (~23.6×19.7×17.7 in), 18 kg → large bulky
    const est = estimateFbaFee([d(600, 500, 450, 18000)])!;
    expect(est.tier).toBe("large-bulky");
    expect(est.fee).toBeGreaterThan(9.61);
  });

  it("ignores rows with missing dims when others are present", () => {
    const est = estimateFbaFee([
      d(250, 180, 120, 500),
      { length_mm: null, width_mm: 180, height_mm: 120, weight_g: 500 }, // incomplete → ignored
    ])!;
    expect(est.n).toBe(1);
  });

  it("(a) bills a bulky-light large-standard item on DIMENSIONAL weight, not scale weight", () => {
    // Air-fryer-ish box: 430×350×200 mm (16.93×13.78×7.87 in) = 1837 in³ (>1 cu ft), only 2000 g (~4.4 lb).
    // Dim weight = 1837/139 ≈ 13.2 lb > 4.4 lb actual → fee billed on 13.2 lb.
    // Dim fee: 6.92 + ceil((13.21−3)/0.25)*0.08 = 6.92 + 41*0.08 = 10.20; scale-weight fee would be only 7.40.
    const est = estimateFbaFee([d(430, 350, 200, 2000)])!;
    expect(est.tier).toBe("large-standard");
    expect(est.weightLb).toBeCloseTo(4.41, 2); // display keeps PHYSICAL weight
    expect(est.fee).toBeCloseTo(10.2, 2); // billed on dim weight
    expect(est.fee).toBeGreaterThan(7.4); // strictly above the naive scale-weight estimate
  });

  it("small dense box stays on unit weight (dim weight NOT applied under 1 cu ft)", () => {
    // 391 in³ box, 1.5 lb — under 1 cubic foot, so unit weight governs (no over-charge).
    const est = estimateFbaFee([d(260, 190, 130, 680)])!;
    expect(est.tier).toBe("large-standard");
    expect(est.weightLb).toBeCloseTo(1.5, 2);
    expect(est.fee).toBeCloseTo(5.37, 2); // unit-weight band, not a dim-inflated fee
  });

  it("(b) prices a ~1.5 lb large-standard item in the corrected 1.25–1.5 lb band ($5.37)", () => {
    // 260×190×130 mm, 680 g → exactly ~1.499 lb. The corrected 2024 table puts 1.25–1.5 lb at
    // $5.37 (the prior coarser table skewed this low at $4.99).
    const est = estimateFbaFee([d(260, 190, 130, 680)])!;
    expect(est.tier).toBe("large-standard");
    expect(est.weightLb).toBeCloseTo(1.5, 2);
    expect(est.fee).toBeCloseTo(5.37, 2);
  });

  it("prices a beauty item in a finer small-standard oz band (14–16 oz → $3.65)", () => {
    // 200×140×18 mm (7.87×5.51×0.71 in, thin enough for small standard), 410 g (~14.5 oz).
    // Corrected 2-oz bands land this at $3.65 (the prior 4-oz table lumped it at $3.43).
    const est = estimateFbaFee([d(200, 140, 18, 410)])!;
    expect(est.tier).toBe("small-standard");
    expect(est.fee).toBeCloseTo(3.65, 2);
  });

  it("applies Low-Price FBA (−$0.77) when a ≤$10 competitor price is present on the dims", () => {
    // Same 1.5 lb large-standard box (standard band $5.37) but priced at $9 → Low-Price FBA table.
    const est = estimateFbaFee([{ length_mm: 260, width_mm: 190, height_mm: 130, weight_g: 680, price_usd: 9 }])!;
    expect(est.source).toBe("dims-estimate");
    expect(est.fee).toBeCloseTo(4.6, 2); // 5.37 − 0.77
  });

  it("keeps the STANDARD table when the competitor price is above $10", () => {
    const est = estimateFbaFee([{ length_mm: 260, width_mm: 190, height_mm: 130, weight_g: 680, price_usd: 24.99 }])!;
    expect(est.fee).toBeCloseTo(5.37, 2); // no Low-Price discount
  });

  it("(c) real-competitor-median fee still OVERRIDES the (now dim-weight-aware) dims estimate", () => {
    // The bulky-light air fryer's dims estimate is $10.20 (dim-weight billed), but real Keepa
    // fees exist → the median of the real fees wins, and dims are still returned for context.
    const est = estimateFbaFee([d(430, 350, 200, 2000)], [8.9, 9.1, null, 8.9])!;
    expect(est.source).toBe("amazon-actual");
    expect(est.fee).toBeCloseTo(8.9, 2); // median of [8.9, 8.9, 9.1]
    expect(est.n).toBe(3);
    expect(est.tier).toBe("large-standard"); // dims/tier still shown, but did NOT set the fee
  });
});
