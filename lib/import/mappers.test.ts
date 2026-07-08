import { describe, it, expect } from "vitest";
import appliancesJson from "@/lib/data/source/appliances.json";
import beautyJson from "@/lib/data/source/beauty.json";
import {
  mapAppliances,
  mapBeautyCatalog,
  mapFoodservice,
  type ApplianceCatalog,
  type BeautyCatalog,
} from "./mappers";
import type { PhotoState } from "@/lib/types";

const appliances = mapAppliances(appliancesJson as unknown as ApplianceCatalog);
const beauty = mapBeautyCatalog(beautyJson as unknown as BeautyCatalog);
const all = [...appliances, ...beauty];

const PHOTO_STATES: PhotoState[] = ["good", "clean-photo-needed", "reshoot", "missing"];

describe("import mappers — real fixtures", () => {
  it("maps the full catalog (70 appliances + 57 beauty = 127)", () => {
    expect(appliances).toHaveLength(70);
    expect(beauty).toHaveLength(57);
  });

  it("external_ref is line-namespaced and unique (no collision on re-import)", () => {
    expect(appliances.every((p) => p.external_ref.startsWith("appliance:"))).toBe(true);
    expect(beauty.every((p) => p.external_ref.startsWith("beauty:"))).toBe(true);
    const refs = all.map((p) => p.external_ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.every((r) => r.split(":")[1]?.length)).toBe(true);
  });

  it("every product has a name, a valid photo_state, and no NaN", () => {
    for (const p of all) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(PHOTO_STATES).toContain(p.photo_state);
      expect(p.our_cost).toBeNull(); // appliances/beauty start with NO cost
    }
  });

  it("data-cleaning: flags 46 appliances at 220V (US-sourcing landmine)", () => {
    expect(appliances.filter((p) => p.voltage_flag).length).toBe(46);
  });

  it("data-cleaning: 45 beauty images carry Chinese text", () => {
    expect(beauty.filter((p) => p.image_has_chinese).length).toBe(45);
  });

  it("quarantine: flagged imagery is excluded from exports (export_ok=false)", () => {
    // Every Chinese-text / reshoot image must be export-blocked.
    expect(beauty.filter((p) => p.image_has_chinese).every((p) => !p.export_ok)).toBe(true);
    expect(all.filter((p) => p.photo_state === "reshoot").every((p) => !p.export_ok)).toBe(true);
    // At least the one known wrong-product appliance is quarantined.
    expect(appliances.some((p) => p.photo_state === "reshoot")).toBe(true);
    // Beauty clean-photo-needed covers the 24+ needs-clean-photo set.
    expect(beauty.filter((p) => p.photo_state === "clean-photo-needed").length).toBeGreaterThanOrEqual(24);
  });

  it("images resolve to local public paths", () => {
    expect(appliances.every((p) => p.primary_image_path?.startsWith("/products/appliance/"))).toBe(true);
    expect(beauty.every((p) => p.primary_image_path?.startsWith("/products/beauty/"))).toBe(true);
  });
});

describe("mapFoodservice (committed prod fixture)", () => {
  it("reproduces the live foodservice line: 11 curated products, Greenway costs intact", async () => {
    // 2026-07-06: the line was curated to the 11 all-green launch SKUs (22 retired,
    // 6 researched market formats added) — the fixture mirrors the DB exactly.
    const json = (await import("@/lib/data/source/foodservice.json")).default as unknown[];
    const rows = mapFoodservice(json);
    expect(rows).toHaveLength(11);
    expect(rows.every((r) => r.line === "foodservice" && r.external_ref.startsWith("foodservice:"))).toBe(true);
    // the real Greenway cost anchors must survive the round-trip
    const tsack = rows.find((r) => r.external_ref === "foodservice:thank-you-tshirt-bag-350ct")!;
    expect(tsack.our_cost).toBeCloseTo(4.2, 2);
    expect(rows.filter((r) => r.our_cost != null).length).toBe(3);
  });

  it("fails loudly on a malformed fixture row", () => {
    expect(() => mapFoodservice([{ name: "no ref" }])).toThrow(/external_ref/);
  });
});
