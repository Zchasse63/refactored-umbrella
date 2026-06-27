/** Shared ProductView builder — used by both the demo fixtures and the live DB queries. */
import {
  DEFAULT_ASSUMPTIONS,
  LINE_OPEX_APPLIES,
  compute,
  type Economics,
} from "@/lib/calc/economics";
import type { Assumptions, Product, Selection } from "@/lib/types";

export interface ProductView {
  product: Product;
  slug: string;
  selection: Selection;
  quotedLanded: number | null;
  economics: Economics;
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
  fbaPerUnit: number | null = null,
): ProductView {
  const economics = compute({
    assumptions,
    sellPrice: selection.target_sell_price,
    quotedLanded,
    actualLanded: product.our_cost,
    applyOpex: LINE_OPEX_APPLIES[product.line],
    fbaPerUnit,
  });
  return { product, slug: productSlug(product), selection, quotedLanded, economics };
}
