import { describe, it, expect } from "vitest";
import { compute, DEFAULT_ASSUMPTIONS } from "./economics";

describe("compute — fbaPerUnit override", () => {
  it("swaps the flat 15% FBA line for the per-unit estimate", () => {
    const sell = 40;
    const base = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: sell });
    // default opex 30% (referral 15 + FBA 15 placeholder) → opex $12, target net = 40 − 14 − 12 = 14
    expect(base.opexPct).toBeCloseTo(0.3, 5);
    expect(base.targetNet).toBeCloseTo(14, 5);

    // FBA estimated at $4/unit (vs flat 15% = $6 on a $40 price) → opex drops to 25%
    const est = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: sell, fbaPerUnit: 4 });
    expect(est.opexPct).toBeCloseTo(0.25, 5); // 0.30 − 0.15 + 4/40
    expect(est.opex).toBeCloseTo(10, 5);
    expect(est.targetNet).toBeCloseTo(16, 5); // 40 − 14 − 10
    expect(est.fbaPerUnit).toBe(4);
  });

  it("a higher estimated fee than the flat line lowers net", () => {
    const est = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40, fbaPerUnit: 9 });
    // 0.30 − 0.15 + 9/40 = 0.375 → opex 15.00 → net = 40 − 14 − 15 = 11.00
    expect(est.targetNet).toBeCloseTo(11, 5);
  });

  it("ignores the FBA estimate when applyOpex is false", () => {
    // (foodservice used to be the applyOpex:false line; it carries the full stack since 2026-07)
    const est = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40, applyOpex: false, fbaPerUnit: 4 });
    expect(est.opexPct).toBe(0);
    expect(est.fbaPerUnit ?? null).toBeNull();
  });

  it("verdict/quote math uses the estimate-adjusted opex", () => {
    const est = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40, quotedLanded: 12, fbaPerUnit: 4 });
    // opex 25% → $10; quoted net = 40 − 12 − 10 = 18 (quote un-buffered)
    expect(est.quotedNet).toBeCloseTo(18, 5);
  });
});
