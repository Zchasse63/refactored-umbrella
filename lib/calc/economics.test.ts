import { describe, it, expect } from "vitest";
import {
  DEFAULT_ASSUMPTIONS,
  LINE_OPEX_APPLIES,
  compute,
  netPerUnit,
  opexPct,
  quoteCheck,
  resolveAssumptions,
  targetLanded,
} from "./economics";

describe("cost stack", () => {
  it("default opex is 30% — known fees only (referral 15 + FBA 15 placeholder); ads/returns are the partner's to add", () => {
    expect(opexPct(DEFAULT_ASSUMPTIONS.costStack)).toBeCloseTo(0.3, 10);
  });
});

describe("the headline math", () => {
  it("target landed = (1 − gross) × sell = 35% of price at the 65% ceiling", () => {
    expect(targetLanded(40, 0.65)).toBe(14);
  });

  it("net at the ceiling is SEPARATE from the 65% gross margin (the terminology trap)", () => {
    const net = netPerUnit(40, 14, 0.3); // default opex 30% (known fees)
    expect(net).toBeCloseTo(14, 10); // 40 − 14 − 12
    expect(net / 40).toBeCloseTo(0.35, 10);
    expect(net / 40).not.toBeCloseTo(0.65, 2);
  });

  it("a >2-decimal quote is rounded ONCE so the verdict matches the displayed number", () => {
    const eco = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40, quotedLanded: 14.005, applyOpex: true });
    expect(eco.quotedLanded).toBe(14.01); // displayed value (round2)
    // headroom evaluates the SAME rounded 14.01, not the raw 14.005
    expect(eco.verdict!.headroom).toBe(-0.01);
    expect(eco.quotedGross).toBeCloseTo((40 - 14.01) / 40, 10);
  });
});

describe("quote check", () => {
  it("PASS with headroom when the quote clears the ceiling", () => {
    const v = quoteCheck(40, 12.5, 14, 0.65);
    expect(v.gross).toBeCloseTo(0.6875, 10);
    expect(v.pass).toBe(true);
    expect(v.headroom).toBe(1.5);
  });
  it("FAIL with negative headroom when the quote is over the ceiling", () => {
    const v = quoteCheck(40, 15, 14, 0.65);
    expect(v.pass).toBe(false);
    expect(v.headroom).toBe(-1);
  });
  it("PASSES a quote exactly at the PRINTED ceiling when the raw target rounds UP", () => {
    // sell 40.10 @ 65%: raw target 14.035 → the RFQ sheet prints $14.04. A factory
    // quoting exactly $14.04 hit the published ceiling — raw gross 0.64988 < 0.65
    // must NOT flunk it. The verdict judges rounded cents, not the raw ratio.
    const t = targetLanded(40.1, 0.65);
    expect(t).toBe(14.04); // what the sheet prints
    const v = quoteCheck(40.1, 14.04, t, 0.65);
    expect(v.pass).toBe(true);
    expect(v.headroom).toBe(0);
    expect(v.gross).toBeCloseTo((40.1 - 14.04) / 40.1, 10); // display keeps the true gross
  });
  it("FAILS one cent over the printed ceiling with headroom −0.01", () => {
    const v = quoteCheck(40.1, 14.05, targetLanded(40.1, 0.65), 0.65);
    expect(v.pass).toBe(false);
    expect(v.headroom).toBe(-0.01);
  });
  it("end to end through compute(): the at-ceiling quote passes and headroom is 0", () => {
    const e = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40.1, quotedLanded: 14.04 });
    expect(e.targetLanded).toBe(14.04);
    expect(e.verdict?.pass).toBe(true);
    expect(e.verdict?.headroom).toBe(0);
  });
});

describe("LINE_OPEX_APPLIES", () => {
  it("every line carries the Amazon opex stack — pinned", () => {
    // foodservice: false was a REAL past bug — the Amazon-first launch line rendered
    // with 0% Amazon fees, showing the partner inflated margins on exactly those SKUs.
    expect(LINE_OPEX_APPLIES).toEqual({ appliance: true, beauty: true, foodservice: true });
  });
});

describe("compute()", () => {
  it("guards an empty/zero/blank sell price → em-dash, never NaN/$0", () => {
    for (const bad of [0, -5, NaN, null, undefined]) {
      const e = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: bad as number });
      expect(e.guarded).toBe(true);
      expect(e.targetLanded).toBeNull();
      expect(e.liveNet).toBeNull();
    }
  });

  it("live-column precedence is quoted > actual > target", () => {
    const base = { assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40 };
    expect(compute(base).liveColumn).toBe("target");
    expect(compute({ ...base, actualLanded: 13 }).liveColumn).toBe("actual");
    expect(compute({ ...base, actualLanded: 13, quotedLanded: 12.5 }).liveColumn).toBe("quoted");
  });

  it("produces the canonical $40 example end to end", () => {
    const e = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40, quotedLanded: 12.5 });
    expect(e.opex).toBe(12); // 0.30 × 40 (known fees only)
    expect(e.targetLanded).toBe(14);
    expect(e.targetNet).toBeCloseTo(14, 10); // 40 − 14 − 12
    expect(e.quotedNet).toBeCloseTo(15.5, 10); // 40 − 12.5 − 12 (quote un-buffered)
    expect(e.verdict?.pass).toBe(true);
    expect(e.verdict?.headroom).toBe(1.5);
    expect(e.liveColumn).toBe("quoted");
  });

  it("pads OUR booked (actual) cost by the 7% buffer; quoted/target stay raw", () => {
    const e = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40, actualLanded: 10, quotedLanded: 12 });
    expect(e.actualLanded).toBeCloseTo(10.7, 10); // 10 × 1.07 — buffered, rounded once
    expect(e.quotedLanded).toBe(12); // raw factory number
    expect(e.targetLanded).toBe(14); // price-derived ceiling
  });

  it("foodservice skips Amazon opex but still pads our booked cost by the 7% buffer", () => {
    const e = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 18, actualLanded: 4.1, applyOpex: false });
    expect(e.opexPct).toBe(0);
    expect(e.actualLanded).toBeCloseTo(4.39, 10); // 4.1 × 1.07, rounded once
    expect(e.actualNet).toBeCloseTo(18 - 4.39, 10);
  });
});

describe("resolveAssumptions", () => {
  it("merges a per-product override field-wise", () => {
    const r = resolveAssumptions(DEFAULT_ASSUMPTIONS, { grossMargin: 0.6, overridden: true });
    expect(r.grossMargin).toBe(0.6);
    expect(r.costStack).toBe(DEFAULT_ASSUMPTIONS.costStack);
  });
  it("ignores a non-override bag", () => {
    expect(resolveAssumptions(DEFAULT_ASSUMPTIONS, { overridden: false })).toBe(DEFAULT_ASSUMPTIONS);
    expect(resolveAssumptions(DEFAULT_ASSUMPTIONS, null)).toBe(DEFAULT_ASSUMPTIONS);
  });
});
