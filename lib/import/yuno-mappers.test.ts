import { describe, it, expect } from "vitest";
import yunoUsJson from "@/lib/data/source/yuno_us_appliances.json";
import { mapYunoUSCatalog, type YunoUSCatalog } from "./mappers";

const us = mapYunoUSCatalog(yunoUsJson as unknown as YunoUSCatalog);

describe("Yuno US sell-sheet mapper", () => {
  it("maps the 122 US SKUs as namespaced appliances", () => {
    expect(us).toHaveLength(122);
    expect(us.every((p) => p.external_ref.startsWith("appliance:"))).toBe(true);
    expect(us.every((p) => p.line === "appliance")).toBe(true);
  });

  it("is neutral/unbranded and uses the SKU as the model", () => {
    expect(us.every((p) => p.brand === null)).toBe(true);
    expect(us.every((p) => !!p.model)).toBe(true);
  });

  it("slugs are unique and collision-free across the set", () => {
    const slugs = us.map((p) => p.external_ref.split(":")[1]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has_photo drives photo_state + image path; others stay placeholders", () => {
    const withPhoto = us.filter((p) => p.photo_state === "good");
    expect(withPhoto.length).toBeGreaterThan(80);
    expect(withPhoto.every((p) => p.primary_image_path?.startsWith("/products/appliance/"))).toBe(true);
    expect(withPhoto.every((p) => p.export_ok)).toBe(true);
    const placeholders = us.filter((p) => p.photo_state === "missing");
    expect(placeholders.every((p) => p.primary_image_path === null)).toBe(true);
  });

  it("US sell-sheet voltage: only a few commercial SKUs carry the 220V flag", () => {
    const flagged = us.filter((p) => p.voltage_flag).length;
    expect(flagged).toBeLessThan(12);
  });

  it("specs are cleaned (no junk sentence labels)", () => {
    const junk = us.flatMap((p) => p.specs).filter((s) => s.label.length > 40);
    expect(junk).toHaveLength(0);
  });
});
