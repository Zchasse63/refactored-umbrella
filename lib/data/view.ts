/** Shared ProductView builder — used by both the demo fixtures and the live DB queries. */
import {
  DEFAULT_ASSUMPTIONS,
  LINE_OPEX_APPLIES,
  compute,
  type Economics,
} from "@/lib/calc/economics";
import type { FbaEstimate } from "@/lib/calc/fba";
import { estimateFobCost, type FobEstimate } from "@/lib/calc/fob";
import type { Assumptions, Product, Selection } from "@/lib/types";

export interface ProductView {
  product: Product;
  slug: string;
  selection: Selection;
  quotedLanded: number | null;
  economics: Economics;
  fbaEstimate: FbaEstimate | null;
  fobEstimate: FobEstimate | null; // extrapolated Greenway FOB cost when no real quote exists
}

export const productSlug = (p: Product) => p.external_ref.split(":")[1];

export function emptySelection(ref: string): Selection {
  return {
    product_external_ref: ref,
    tier: null,
    priority: null,
    target_sell_price: null,
    target_landed_cost: null,
    calc_inputs: null,
    notes: null,
  };
}

export function buildView(
  product: Product,
  selection: Selection,
  quotedLanded: number | null,
  assumptions: Assumptions = DEFAULT_ASSUMPTIONS,
  fbaEstimate: FbaEstimate | null = null,
): ProductView {
  // No real Greenway quote? Extrapolate the FOB cost from the product's own specs.
  const fobEstimate = product.our_cost == null ? estimateFobCost(product.group_name, product.specs) : null;
  const effectiveCost = product.our_cost ?? fobEstimate?.fobPerPack ?? null;
  const economics = compute({
    assumptions,
    sellPrice: selection.target_sell_price,
    quotedLanded,
    actualLanded: effectiveCost,
    applyOpex: LINE_OPEX_APPLIES[product.line],
    fbaPerUnit: fbaEstimate?.fee ?? null,
  });
  return { product, slug: productSlug(product), selection, quotedLanded, economics, fbaEstimate, fobEstimate };
}
