import { describe, it, expect } from "vitest";
import { compute, DEFAULT_ASSUMPTIONS } from "./economics";

describe("compute — fbaPerUnit override", () => {
  it("swaps the flat 15% FBA line for the per-unit estimate", () => {
    const sell = 40;
    const base = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: sell });
    // default opex 49% → opex $19.60, target net = 40 - 14 - 19.60 = 6.40
    expect(base.opexPct).toBeCloseTo(0.49, 5);
    expect(base.targetNet).toBeCloseTo(6.4, 5);

    // FBA estimated at $4/unit (vs flat 15% = $6 on a $40 price) → opex drops to 44%
    const est = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: sell, fbaPerUnit: 4 });
    expect(est.opexPct).toBeCloseTo(0.44, 5); // 0.49 − 0.15 + 4/40
    expect(est.opex).toBeCloseTo(17.6, 5);
    expect(est.targetNet).toBeCloseTo(8.4, 5); // 40 − 14 − 17.60
    expect(est.fbaPerUnit).toBe(4);
  });

  it("a higher estimated fee than the flat line lowers net", () => {
    const est = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40, fbaPerUnit: 9 });
    // 0.49 − 0.15 + 9/40 = 0.565 → opex 22.60 → net = 40 − 14 − 22.60 = 3.40
    expect(est.targetNet).toBeCloseTo(3.4, 5);
  });

  it("ignores the estimate when opex doesn't apply (foodservice)", () => {
    const est = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40, applyOpex: false, fbaPerUnit: 4 });
    expect(est.opexPct).toBe(0);
    expect(est.fbaPerUnit ?? null).toBeNull();
  });

  it("verdict/quote math uses the estimate-adjusted opex", () => {
    const est = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40, quotedLanded: 12, fbaPerUnit: 4 });
    // quoted net = 40 - 12 - 17.60 = 10.40
    expect(est.quotedNet).toBeCloseTo(10.4, 5);
  });
});
