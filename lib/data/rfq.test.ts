import { describe, it, expect } from "vitest";
import { buildRfqRow, parseReturnedRfq, toNum } from "./rfq";
import { buildView } from "./view";
import { compute, DEFAULT_ASSUMPTIONS } from "@/lib/calc/economics";
import type { Product, Selection } from "@/lib/types";

const product = (over: Partial<Product> = {}): Product => ({
  external_ref: "appliance:x", line: "appliance", brand: null, source: "RoyalStar", name: "Widget",
  model: "WX-1", group_name: "Coffee / Espresso", subsection: null, categories: [],
  specs: [{ label: "Capacity", value: "1L" }, { label: "Power", value: "1000W" }],
  features: [], summary: null, source_url: null, msrp: null, our_cost: null, our_cost_source: null,
  photo_state: "good", image_has_chinese: false, voltage_flag: false, export_ok: true,
  primary_image_path: "/products/appliance/x.jpg", ...over,
});
const sel = (over: Partial<Selection> = {}): Selection => ({
  product_external_ref: "appliance:x", tier: "pursue", priority: null, target_sell_price: 40,
  target_landed_cost: null, calc_inputs: null, notes: null, ...over,
});

describe("buildRfqRow — RFQ SAFETY", () => {
  it("prints the TARGET LANDED COST (DDP), never the gross margin or net%", () => {
    const v = buildView(product(), sel({ target_sell_price: 40 }), null);
    const row = buildRfqRow(v, 1, 1000);
    // target landed = (1 - 0.65) * 40 = 14.00
    expect(row.targetLanded).toBeCloseTo(14, 5);
    // it must NOT be the gross margin (0.65) or any net figure
    expect(row.targetLanded).not.toBe(DEFAULT_ASSUMPTIONS.grossMargin);
    expect(row.targetLanded).toBe(compute({ assumptions: DEFAULT_ASSUMPTIONS, sellPrice: 40 }).targetLanded);
    expect(row.moqAsk).toBe(1000);
    expect(row.targetSell).toBe(40);
  });

  it("flags 220V and only embeds export-ok images", () => {
    const flagged = buildRfqRow(buildView(product({ voltage_flag: true }), sel(), null), 2, null);
    expect(flagged.voltage).toMatch(/220V/);

    const noExport = buildRfqRow(buildView(product({ export_ok: false }), sel(), null), 3, null);
    expect(noExport.imagePath).toBeNull(); // dirty image excluded from a factory-facing doc
  });

  it("guards target landed to null when no sell price is set", () => {
    const v = buildView(product(), sel({ target_sell_price: null }), null);
    expect(buildRfqRow(v, 1, null).targetLanded).toBeNull();
  });

  it("joins up to 4 key specs", () => {
    const row = buildRfqRow(buildView(product(), sel(), null), 1, null);
    expect(row.keySpecs).toBe("Capacity: 1L; Power: 1000W");
  });
});

describe("parseReturnedRfq — quote-import round-trip", () => {
  it("toNum strips $ and commas", () => {
    expect(toNum("$1,234.50")).toBe(1234.5);
    expect(toNum(18)).toBe(18);
    expect(toNum("")).toBeNull();
    expect(toNum("n/a")).toBeNull();
  });

  it("finds the header row by name and extracts filled rows only", () => {
    const rows: (string | number | null)[][] = [
      ["YUNO GROUP — RFQ", null, null, null],
      ["Model / SKU", "Target Landed Cost (DDP)", "Factory Quote (DDP)", "Factory MOQ"],
      ["CM0591", 14, "$12.50", 1000],
      ["HZB-20AN", 20, 18, null],          // moq blank but quote present → included
      ["KM-C0518", 9, "", ""],             // factory left blank → skipped
      [null, null, null, null],
    ];
    const out = parseReturnedRfq(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ model: "CM0591", quote: 12.5, moq: 1000 });
    expect(out[1]).toEqual({ model: "HZB-20AN", quote: 18, moq: null });
  });

  it("returns empty when no Model/SKU header is present", () => {
    expect(parseReturnedRfq([["foo", "bar"], ["a", "b"]])).toEqual([]);
  });
});
