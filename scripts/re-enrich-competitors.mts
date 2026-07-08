/**
 * Non-destructive competitor re-enrichment (KEEPA_INTEGRATION §9 / review backlog).
 * Re-pulls every competitor ASIN from Keepa and UPDATEs the row's market data in place
 * (price/BSR/reviews/intel/image/enriched_at). Never touches status, match_* or
 * created_by — approval decisions and the learn-loop survive refreshes.
 * Run: npx tsx scripts/re-enrich-competitors.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) {
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
const { getKeepaProducts, mapKeepaToCompetitor } = await import("@/lib/keepa/client");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Paginate past PostgREST's 1000-row cap — a single unbounded select truncates, silently
// leaving every row past the first 1000 unrefreshed.
const comps: { id: string; asin: string }[] = [];
for (let from = 0; ; from += 1000) {
  const { data: page, error } = await sb.from("competitors").select("id, asin").not("asin", "is", null).order("id").range(from, from + 999);
  if (error) throw error;
  comps.push(...(page ?? []));
  if (!page || page.length < 1000) break;
}
const asins = Array.from(new Set(comps.map((c) => c.asin)));
console.log(`re-enriching ${comps.length} competitor rows across ${asins.length} ASINs`);

const byAsin = new Map<string, ReturnType<typeof mapKeepaToCompetitor>>();
for (let i = 0; i < asins.length; i += 100) {
  const { products, tokensLeft } = await getKeepaProducts(asins.slice(i, i + 100));
  for (const p of products) byAsin.set(p.asin, mapKeepaToCompetitor(p));
  console.log(`  batch ${i / 100 + 1}: ${products.length} products (tokensLeft ${tokensLeft})`);
}

let updated = 0, missing = 0;
for (const c of comps) {
  const cand = byAsin.get(c.asin);
  if (!cand) { missing++; continue; }
  const { error: upErr } = await sb.from("competitors").update({
    title: cand.title ?? undefined,
    brand: cand.brand,
    price: cand.price,
    rating: cand.rating,
    review_count: cand.review_count,
    bsr: cand.bsr,
    est_monthly_sales: cand.est_monthly_sales,
    monthly_sales_source: cand.monthly_sales_source,
    image_url: cand.image_url,
    retail_url: cand.retail_url,
    package_length_mm: cand.package_length_mm,
    package_width_mm: cand.package_width_mm,
    package_height_mm: cand.package_height_mm,
    package_weight_g: cand.package_weight_g,
    price_avg90: cand.price_avg90,
    price_min90: cand.price_min90,
    price_max90: cand.price_max90,
    bsr_avg90: cand.bsr_avg90,
    bsr_best: cand.bsr_best,
    reviews_added_90d: cand.reviews_added_90d,
    variations_count: cand.variations_count,
    buy_box_is_fba: cand.buy_box_is_fba,
    buy_box_price: cand.buy_box_price,
    offer_count: cand.offer_count,
    listed_since: cand.listed_since,
    fba_pick_pack_fee: cand.fba_pick_pack_fee,
    referral_pct: cand.referral_pct,
    enriched_at: new Date().toISOString(),
  }).eq("id", c.id);
  if (upErr) console.error(`  ! ${c.asin}: ${upErr.message}`);
  else updated++;
}
console.log(`done — ${updated} rows refreshed, ${missing} ASINs not returned by Keepa`);
process.exit(0);
