/**
 * One-off batch: run competitor discovery on every foodservice product, reusing the app's
 * exact discovery modules (same profile → Keepa finder → verify judge → rich mapper →
 * insert-first replace). Admin client for writes. Run: npx tsx scripts/discover-foodservice.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// load .env.local into process.env (tsx doesn't auto-load it)
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) {
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const { buildSearchProfile } = await import("@/lib/ai/build-profile");
const { keepaFinder } = await import("@/lib/keepa/product-finder");
const { getKeepaProducts, mapKeepaToCompetitor } = await import("@/lib/keepa/client");
const { verifyCompetitor } = await import("@/lib/ai/verify-competitor");

const OWNER = "1f467381-73d9-4df6-886d-0136fde445d4";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WEAK_ONLY = process.argv.includes("--weak"); // only (re)run products with < 2 competitors

const { data: allProducts, error } = await sb
  .from("products").select("id, external_ref, name, line, specs").eq("line", "foodservice").order("name");
if (error) throw error;
let products = allProducts!;
if (WEAK_ONLY) {
  const { data: comps } = await sb.from("competitors").select("product_id").eq("status", "approved");
  const counts = new Map<string, number>();
  for (const c of comps ?? []) counts.set((c as any).product_id, (counts.get((c as any).product_id) ?? 0) + 1);
  products = products.filter((p) => (counts.get(p.id) ?? 0) < 2);
}
console.log(`discovering ${products.length} foodservice products${WEAK_ONLY ? " (weak only)" : ""}\n`);

let okCount = 0;
for (const prow of products) {
  const product = { name: prow.name, line: prow.line, specs: prow.specs ?? [] } as any;
  const ourDesc = `${product.name} | ${(product.specs || []).map((s: any) => `${s.label}: ${s.value}`).join("; ")}`;
  try {
    const profile = await buildSearchProfile(product, []);
    const sort = [["monthlySold", "desc"]] as [string, "asc" | "desc"][];
    // Title-only (no price band): commodity foodservice items span a wide price range, and the
    // verify judge rejects wrong products — so favour recall, then let the judge filter.
    let asins = await keepaFinder({ title: profile.title, sort });
    if (!asins.length) {
      const short = profile.title.split(/\s+/).slice(0, 3).join(" ");
      if (short && short.toLowerCase() !== profile.title.toLowerCase()) asins = await keepaFinder({ title: short, sort });
    }
    asins = asins.slice(0, 8);
    if (!asins.length) { console.log(`  ✗ ${product.name} — 0 candidates (title="${profile.title}")`); continue; }

    const { products: kp } = await getKeepaProducts(asins);
    const rows: any[] = [];
    for (const p of kp) {
      const cand = mapKeepaToCompetitor(p);
      let verdict;
      try { verdict = await verifyCompetitor(ourDesc, `${cand.title} (ASIN ${cand.asin}, $${cand.price ?? "?"})`); } catch { continue; }
      if (verdict.is_match && verdict.confidence >= 0.5)
        rows.push({ product_id: prow.id, status: "approved", ...cand, match_confidence: verdict.confidence, match_reason: verdict.reason, created_by: OWNER, enriched_at: new Date().toISOString() });
    }
    if (!rows.length) { console.log(`  ✗ ${product.name} — found ${kp.length}, kept 0`); continue; }

    const { data: existing } = await sb.from("competitors").select("id").eq("product_id", prow.id);
    const oldIds = (existing ?? []).map((e: any) => e.id);
    const { error: insErr } = await sb.from("competitors").insert(rows);
    if (insErr) { console.log(`  ! ${product.name} — insert err: ${insErr.message}`); continue; }
    if (oldIds.length) await sb.from("competitors").delete().in("id", oldIds);
    okCount++;
    console.log(`  ✓ ${product.name} — found ${kp.length}, kept ${rows.length}`);
  } catch (e: any) {
    console.log(`  ! ${product.name} — ERR ${e?.message ?? e}`);
  }
  await sleep(3000); // throttle so the wide pull doesn't exhaust Keepa's 20-tokens/min plan
}
console.log(`\ndone — ${okCount}/${products.length} got competitors`);
process.exit(0);
