import { describe, it, expect } from "vitest";
import { sortBoardViews } from "./board-sort";
import { buildView } from "./view";
import type { Product, Selection } from "@/lib/types";

const product = (ref: string, name: string): Product => ({
  external_ref: ref, line: "appliance", brand: null, source: "RoyalStar", name, model: null,
  group_name: null, subsection: null, categories: [], specs: [], features: [], summary: null,
  source_url: null, msrp: null, our_cost: null, our_cost_source: null, photo_state: "missing",
  image_has_chinese: false, voltage_flag: false, export_ok: false, primary_image_path: null,
});
const sel = (over: Partial<Selection> = {}): Selection => ({
  product_external_ref: "x", tier: null, priority: null, target_sell_price: null,
  target_landed_cost: null, calc_inputs: null, notes: null, updated_at: null, ...over,
});

describe("sortBoardViews", () => {
  // mix of quoted (real headroom) and unquoted (null → −Infinity) rows
  const views = [
    buildView(product("a", "Alpha"), sel({ target_sell_price: 40 }), 10), // headroom positive, PASS
    buildView(product("b", "Bravo"), sel({ target_sell_price: 40 }), 20), // headroom smaller/neg
    buildView(product("c", "Charlie"), sel({ target_sell_price: 30 }), null), // no quote
    buildView(product("d", "Delta"), sel(), null), // nothing
  ];

  it("does not throw and keeps every row when sorting unquoted-heavy data by headroom", () => {
    const out = sortBoardViews(views, "headroom", "desc", "all");
    expect(out).toHaveLength(4);
    // the two unquoted rows must still be present (no NaN-drop)
    expect(out.map((v) => v.product.external_ref).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("is deterministic across repeated sorts (NaN guard)", () => {
    const a = sortBoardViews(views, "headroom", "desc", "all").map((v) => v.product.external_ref);
    const b = sortBoardViews(views, "headroom", "desc", "all").map((v) => v.product.external_ref);
    expect(a).toEqual(b);
  });

  it("sorts by name asc correctly", () => {
    const out = sortBoardViews(views, "name", "asc", "all").map((v) => v.product.name);
    expect(out).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
  });

  it("filters by tier", () => {
    const tiered = [
      buildView(product("a", "A"), sel({ tier: "pursue" }), null),
      buildView(product("b", "B"), sel({ tier: "pass" }), null),
    ];
    expect(sortBoardViews(tiered, "name", "asc", "pursue")).toHaveLength(1);
  });
});
