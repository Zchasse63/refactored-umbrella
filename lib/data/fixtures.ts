/**
 * The real 127-product catalog mapped in-memory. Now used as the IMPORTER SEED SOURCE
 * (and a no-DB fallback). The deterministic demo selection/quote layer is what we seed
 * into Supabase so the deployed app shows realistic economics until the partner edits.
 */
import appliancesJson from "@/lib/data/source/appliances.json";
import beautyJson from "@/lib/data/source/beauty.json";
import {
  mapAppliances,
  mapBeautyCatalog,
  type ApplianceCatalog,
  type BeautyCatalog,
} from "@/lib/import/mappers";
import { buildView, productSlug, type ProductView } from "@/lib/data/view";
import type { Product, Selection, Tier } from "@/lib/types";

export type { ProductView } from "@/lib/data/view";
export { productSlug } from "@/lib/data/view";

export const PRODUCTS: Product[] = [
  ...mapAppliances(appliancesJson as unknown as ApplianceCatalog),
  ...mapBeautyCatalog(beautyJson as unknown as BeautyCatalog),
];

const tierFor = (i: number): Tier => (i % 3 === 0 ? "pursue" : i % 3 === 1 ? "maybe" : "pass");

function demoSell(i: number): number | null {
  if (i % 4 === 3) return null; // ~25% have no target yet (honest empty state)
  return 20 + ((i * 7) % 9) * 5 + (i % 2 === 0 ? 9.99 : 4.99);
}

export function demoSelection(p: Product, i: number): Selection {
  const sell = demoSell(i);
  return {
    product_external_ref: p.external_ref,
    tier: sell == null ? null : tierFor(i),
    priority: null,
    target_sell_price: sell,
    target_landed_cost: null,
    calc_inputs: null,
    notes: null,
  };
}

export function demoQuote(p: Product, i: number, sell: number | null): number | null {
  if (sell == null || i % 6 !== 0) return null;
  const target = sell * 0.35;
  return Math.round((i % 12 === 0 ? target * 1.06 : target * 0.89) * 100) / 100;
}

export function productView(p: Product, i: number): ProductView {
  const selection = demoSelection(p, i);
  return buildView(p, selection, demoQuote(p, i, selection.target_sell_price));
}

export function allProductViews(): ProductView[] {
  return PRODUCTS.map(productView);
}

export function getProductView(slug: string): ProductView | null {
  const idx = PRODUCTS.findIndex((p) => productSlug(p) === slug);
  return idx < 0 ? null : productView(PRODUCTS[idx], idx);
}
