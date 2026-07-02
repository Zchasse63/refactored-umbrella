/**
 * The real product catalog (appliances + beauty + foodservice) mapped in-memory from the
 * committed source JSON. Used as the IMPORTER SEED SOURCE for
 * the products table (and a no-DB fallback for the product shape). No demo economics
 * are generated here — target prices and factory quotes are real user data created in
 * the app, never synthesized.
 */
import appliancesJson from "@/lib/data/source/appliances.json";
import beautyJson from "@/lib/data/source/beauty.json";
import yunoUsJson from "@/lib/data/source/yuno_us_appliances.json";
import foodserviceJson from "@/lib/data/source/foodservice.json";
import {
  mapAppliances,
  mapBeautyCatalog,
  mapYunoUSCatalog,
  mapFoodservice,
  type ApplianceCatalog,
  type BeautyCatalog,
  type YunoUSCatalog,
} from "@/lib/import/mappers";
import type { Product } from "@/lib/types";

export type { ProductView } from "@/lib/data/view";
export { productSlug } from "@/lib/data/view";

export const PRODUCTS: Product[] = [
  ...mapAppliances(appliancesJson as unknown as ApplianceCatalog),
  ...mapBeautyCatalog(beautyJson as unknown as BeautyCatalog),
  ...mapYunoUSCatalog(yunoUsJson as unknown as YunoUSCatalog),
  ...mapFoodservice(foodserviceJson as unknown[]),
];
