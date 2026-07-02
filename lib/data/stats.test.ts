import { describe, it, expect } from "vitest";
import { computeDashboardStats } from "./stats";
import { buildView } from "./view";
import type { Product, Selection } from "@/lib/types";

const product = (over: Partial<Product> = {}): Product => ({
  external_ref: "appliance:x", line: "appliance", brand: null, source: "RoyalStar",
  name: "X", model: null, group_name: null, subsection: null, categories: [], specs: [],
  features: [], summary: null, source_url: null, msrp: null, our_cost: null, our_cost_source: null,
  photo_state: "missing", image_has_chinese: false, voltage_flag: false, export_ok: false,
  primary_image_path: null, ...over,
});
const sel = (over: Partial<Selection> = {}): Selection => ({
  product_external_ref: "appliance:x", tier: null, priority: null, target_sell_price: null,
  target_landed_cost: null, calc_inputs: null, notes: null, updated_at: null, ...over,
});

describe("computeDashboardStats", () => {
  it("tier counts always sum to total", () => {
    const views = [
      buildView(product({ external_ref: "a" }), sel({ tier: "pursue", target_sell_price: 40 }), null),
      buildView(product({ external_ref: "b" }), sel({ tier: "maybe" }), null),
      buildView(product({ external_ref: "c" }), sel({ tier: "pass" }), null),
      buildView(product({ external_ref: "d" }), sel(), null), // unset
    ];
    const s = computeDashboardStats(views);
    expect(s.total).toBe(4);
    expect(s.pursue + s.maybe + s.pass + s.unset).toBe(s.total);
    expect(s.pursue).toBe(1);
    expect(s.unset).toBe(1);
  });

  it("counts quotes and PASS/FAIL verdicts, sums target sell", () => {
    const views = [
      buildView(product({ external_ref: "a" }), sel({ target_sell_price: 40 }), 12), // 40-12 = gross 70% > 65 → PASS
      buildView(product({ external_ref: "b" }), sel({ target_sell_price: 40 }), 20), // gross 50% < 65 → FAIL
      buildView(product({ external_ref: "c" }), sel({ target_sell_price: 30 }), null), // no quote
    ];
    const s = computeDashboardStats(views);
    expect(s.quoted).toBe(2);
    expect(s.passCount).toBe(1);
    expect(s.failCount).toBe(1);
    expect(s.withTarget).toBe(3);
    expect(s.totalTargetSell).toBeCloseTo(110, 5);
  });

  it("photo counts split good vs pending", () => {
    const views = [
      buildView(product({ external_ref: "a", photo_state: "good" }), sel(), null),
      buildView(product({ external_ref: "b", photo_state: "missing" }), sel(), null),
    ];
    const s = computeDashboardStats(views);
    expect(s.photosGood).toBe(1);
    expect(s.photosPending).toBe(1);
    expect(s.avgQuotedNetPct).toBeNull();
  });
});
