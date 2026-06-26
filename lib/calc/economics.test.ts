import { describe, it, expect } from "vitest";
import {
  DEFAULT_ASSUMPTIONS,
  compute,
  netPerUnit,
  opexPct,
  quoteCheck,
  resolveAssumptions,
  targetLanded,
} from "./economics";

describe("cost stack", () => {
  it("default opex is exactly 49% (agency lines removed)", () => {
    expect(opexPct(DEFAULT_ASSUMPTIONS.costStack)).toBeCloseTo(0.49, 10);
  });
});

describe("the headline math", () => {
  it("target landed = (1 − gross) × sell = 35% of price at the 65% ceiling", () => {
    expect(targetLanded(40, 0.65)).toBe(14);
  });

  it("net ≈ 16% of price at the ceiling — NOT 65% (the terminology trap)", () => {
    const net = netPerUnit(40, 14, 0.49);
    expect(net).toBeCloseTo(6.4, 10);
    expect(net / 40).toBeCloseTo(0.16, 10);
    expect(net / 40).not.toBeCloseTo(0.65, 2);
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
    expect(e.opex).toBe(19.6);
    expect(e.targetLanded).toBe(14);
    expect(e.targetNet).toBeCloseTo(6.4, 10);
    expect(e.quotedNet).toBeCloseTo(7.9, 10); // 40 − 12.5 − 19.6
    expect(e.verdict?.pass).toBe(true);
    expect(e.verdict?.headroom).toBe(1.5);
    expect(e.liveColumn).toBe("quoted");
  });

  it("foodservice skips Amazon opex (cost-only line)", () => {
    const e = compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 18, actualLanded: 4.1, applyOpex: false });
    expect(e.opexPct).toBe(0);
    expect(e.actualNet).toBeCloseTo(18 - 4.1, 10);
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
