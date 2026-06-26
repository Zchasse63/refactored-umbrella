import { describe, it, expect } from "vitest";
import { isRealSpec, cleanSpecs } from "./clean";

describe("cleanSpecs — junk marketing-sentence specs", () => {
  it("keeps real short-label specs with a value", () => {
    expect(isRealSpec({ label: "Rated Power", value: "220V 80W" })).toBe(true);
    expect(isRealSpec({ label: "Capacity", value: "1.0L" })).toBe(true);
  });

  it("drops a whole translated sentence stored as a spec label", () => {
    const junk = {
      label:
        "With a rated power of 80W and a Low-Power Design, the Heating Process is gentle, suitable for Home and Office",
      value: "",
    };
    expect(isRealSpec(junk)).toBe(false);
  });

  it("drops empty-value and empty-label specs", () => {
    expect(isRealSpec({ label: "Voltage", value: "" })).toBe(false);
    expect(isRealSpec({ label: "  ", value: "x" })).toBe(false);
    expect(isRealSpec(null)).toBe(false);
    expect(isRealSpec(undefined)).toBe(false);
  });

  it("filters a mixed spec list down to the real ones", () => {
    const specs = [
      { label: "Rated Power", value: "220V 80W" },
      { label: "A very long machine-translated marketing sentence that is not a spec at all here", value: "" },
      { label: "Material", value: "SUS 304 + PP" },
    ];
    const cleaned = cleanSpecs(specs);
    expect(cleaned).toHaveLength(2);
    expect(cleaned.map((s) => s.label)).toEqual(["Rated Power", "Material"]);
  });

  it("the 40-char boundary keeps a real spec and drops a sentence", () => {
    expect(isRealSpec({ label: "Refrigerant / Climate Class (T)", value: "R600a" })).toBe(true); // 31 chars
    expect(cleanSpecs(null)).toEqual([]);
    expect(cleanSpecs(undefined)).toEqual([]);
  });
});
