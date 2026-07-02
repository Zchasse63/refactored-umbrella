import { describe, it, expect } from "vitest";
import { applyFilters, sortViews, categoryFacets, tierFacets, EMPTY_FILTERS, type CatalogFilters } from "./catalog-filter";
import { buildView } from "./view";
import type { Product, Selection } from "@/lib/types";

const product = (over: Partial<Product> = {}): Product => ({
  external_ref: "appliance:x", line: "appliance", brand: null, source: "RoyalStar", name: "Widget", model: null,
  group_name: "Coffee / Espresso", subsection: null, categories: [], specs: [], features: [], summary: null,
  source_url: null, msrp: null, our_cost: null, our_cost_source: null, photo_state: "good",
  image_has_chinese: false, voltage_flag: false, export_ok: true, primary_image_path: "/x.jpg", ...over,
});
const sel = (over: Partial<Selection> = {}): Selection => ({
  product_external_ref: "x", tier: null, priority: null, target_sell_price: null, target_landed_cost: null, calc_inputs: null, notes: null, updated_at: null, ...over,
});
const f = (over: Partial<CatalogFilters> = {}): CatalogFilters => ({ ...EMPTY_FILTERS, ...over });

const views = [
  buildView(product({ external_ref: "a", name: "Drip Coffee Maker", group_name: "Coffee / Espresso", voltage_flag: false, photo_state: "good" }), sel({ tier: "pursue", target_sell_price: 49.99 }), 12),
  buildView(product({ external_ref: "b", name: "Air Fryer", group_name: "Air Fryers", voltage_flag: true, photo_state: "missing" }), sel({ tier: "maybe", target_sell_price: 89.99 }), 40),
  buildView(product({ external_ref: "c", name: "Ice Maker", group_name: "Ice Makers", line: "appliance", photo_state: "good" }), sel(), null),
  buildView(product({ external_ref: "d", name: "Facial Steamer", group_name: "Skincare", line: "beauty" }), sel({ tier: "pursue", target_sell_price: 29.99 }), null),
];

describe("applyFilters", () => {
  it("text search matches name/specs", () => {
    expect(applyFilters(views, f({ q: "coffee" })).map((v) => v.product.external_ref)).toEqual(["a"]);
  });
  it("line + category filters", () => {
    expect(applyFilters(views, f({ line: "beauty" })).map((v) => v.product.external_ref)).toEqual(["d"]);
    expect(applyFilters(views, f({ categories: ["Air Fryers", "Ice Makers"] })).map((v) => v.product.external_ref).sort()).toEqual(["b", "c"]);
  });
  it("tier (incl. unset), voltage, photo filters", () => {
    expect(applyFilters(views, f({ tiers: ["unset"] })).map((v) => v.product.external_ref)).toEqual(["c"]);
    expect(applyFilters(views, f({ voltage: "us" })).every((v) => !v.product.voltage_flag)).toBe(true);
    expect(applyFilters(views, f({ photo: "needs" })).map((v) => v.product.external_ref)).toEqual(["b"]);
  });
  it("quote PASS/FAIL + price range", () => {
    // a: 49.99 sell, quote 12 → landed target 17.50, 12<17.5 → PASS
    expect(applyFilters(views, f({ quote: "pass" })).map((v) => v.product.external_ref)).toEqual(["a"]);
    expect(applyFilters(views, f({ priceMin: 50 })).map((v) => v.product.external_ref)).toEqual(["b"]);
  });
});

describe("sortViews", () => {
  it("target-desc puts the highest target first and is deterministic with nulls", () => {
    const out = sortViews(views, "target-desc").map((v) => v.product.external_ref);
    expect(out[0]).toBe("b"); // 89.99
    expect(out).toHaveLength(4);
    expect(sortViews(views, "target-desc")).toEqual(sortViews(views, "target-desc")); // stable / no NaN
  });
  it("name A–Z", () => {
    expect(sortViews(views, "name").map((v) => v.product.name)).toEqual(["Air Fryer", "Drip Coffee Maker", "Facial Steamer", "Ice Maker"]);
  });
});

describe("facets", () => {
  it("category + tier counts", () => {
    expect(categoryFacets(views).find((c) => c.value === "Coffee / Espresso")!.count).toBe(1);
    expect(tierFacets(views).find((t) => t.value === "pursue")!.count).toBe(2);
    expect(tierFacets(views).find((t) => t.value === "unset")!.count).toBe(1);
  });
});
