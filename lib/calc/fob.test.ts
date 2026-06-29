import { describe, it, expect } from "vitest";
import { estimateFobCost } from "./fob";
import type { Spec } from "@/lib/types";

const S = (o: Record<string, string>): Spec[] => Object.entries(o).map(([label, value]) => ({ label, value }));

describe("estimateFobCost — validated against real Greenway quotes", () => {
  it("can liner (by the pound) reproduces the actual $18.05 quote", () => {
    // Greenway: 38x58, 1.3 mil LDPE, 100 ct → $18.05 (case weight 19 lb @ $0.95/lb)
    const e = estimateFobCost("Can Liners", S({ Material: "LDPE", Size: '38" x 58"', Gauge: "1.3 mil", Pack: "100 ct" }))!;
    expect(e).not.toBeNull();
    expect(e.fobPerPack).toBeGreaterThan(17.5);
    expect(e.fobPerPack).toBeLessThan(18.6); // ~$18.08
    expect(e.confidence).toBe("high");
  });

  it("thank-you bag reproduces the anchor: $12 @ 1000ct, scales to 100/350", () => {
    const ty = (pack: string) => estimateFobCost("Carryout Bags", S({ Material: "HDPE", Size: '11.5" x 6.5" x 21"', Gauge: "12 micron", Pack: pack }))!;
    expect(ty("1000 ct").fobPerPack).toBeCloseTo(12.0, 1);
    expect(ty("100 ct").fobPerPack).toBeCloseTo(1.2, 1);
    expect(ty("350 ct").fobPerPack).toBeCloseTo(4.2, 1);
  });

  it("straws (bore²·length model) land within ~10% of the Greenway quotes", () => {
    const straw = (bore: string, len: string, pack: string, wrap = "Paper") =>
      estimateFobCost("Straws", S({ Material: "PP", Length: len, Bore: bore, Wrap: wrap, Pack: pack }))!.fobPerPack;
    expect(straw("Jumbo (~6 mm)", '7.75"', "2000 ct")).toBeGreaterThan(5.3); // real $5.95
    expect(straw("Jumbo (~6 mm)", '7.75"', "2000 ct")).toBeLessThan(6.6);
    expect(straw("Giant (~8 mm)", '8.5"', "1200 ct")).toBeGreaterThan(5.9); // real $6.50
    expect(straw("Giant (~8 mm)", '8.5"', "1200 ct")).toBeLessThan(7.2);
    // poly wrap costs a touch more than paper
    expect(straw("Giant (~8 mm)", '10.25"', "1200 ct", "Poly")).toBeGreaterThan(straw("Giant (~8 mm)", '10.25"', "1200 ct", "Paper"));
  });

  it("returns null when the category or specs can't be modeled", () => {
    expect(estimateFobCost(null, S({ Pack: "100 ct" }))).toBeNull();
    expect(estimateFobCost("Straws", S({ Pack: "100 ct" }))).toBeNull(); // no bore/length
    expect(estimateFobCost("Mystery", S({ Pack: "100 ct" }))).toBeNull();
  });
});
