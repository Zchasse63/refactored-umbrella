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
    expect(est.n).toBe(1);
    expect(est.confidence).toBe("low");
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
});
