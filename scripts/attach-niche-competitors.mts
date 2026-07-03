/**
 * Hand-attach validated Amazon competitors to niche foodservice products that automated
 * discovery couldn't fill (AMAZON-ONLY rule: every competitor is a real Amazon listing
 * pulled + enriched via Keepa). Non-destructive: never deletes or updates existing rows.
 *
 * Modes:
 *   npx tsx scripts/attach-niche-competitors.mts verify
 *       — print approved-competitor count per target product
 *   npx tsx scripts/attach-niche-competitors.mts search <out.json>
 *       — for each target still at 0 approved, run the configured Keepa Product Finder
 *         queries (sorted by monthlySold), enrich the top ASINs, and dump candidates
 *         (asin/title/price/sales) to <out.json> for like-for-like review
 *   npx tsx scripts/attach-niche-competitors.mts attach <keeps.json>
 *       — insert the hand-picked ASINs; keeps.json shape: { "<external_ref>": ["ASIN", ...] }
 *
 * The judge step between `search` and `attach` is deliberate and manual: an operator (or
 * Claude) reads each candidate title and keeps only strict size/type matches — no bundles,
 * no wrong sizes, no accessories. This script never auto-approves finder output.
 */
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
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

const { keepaFinder } = await import("@/lib/keepa/product-finder");
const { getKeepaProducts, mapKeepaToCompetitor } = await import("@/lib/keepa/client");

const OWNER = "1f467381-73d9-4df6-886d-0136fde445d4";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Target products + the Finder title queries to try for each (in order). */
const TARGETS: { ref: string; queries: string[] }[] = [
  {
    ref: "foodservice:colossal-straw-8-5in-1600",
    queries: ["colossal straw 12mm", "extra wide boba straw", "12mm boba straws"],
  },
  {
    ref: "foodservice:can-liner-12-16gal-24x33-1mil-ld",
    queries: ["12-16 gallon trash bags", "24x33 trash can liner", "16 gallon trash can liners"],
  },
  {
    ref: "foodservice:can-liner-40-45gal-40x48-16mic-hd",
    queries: ["45 gallon high density can liner", "40x48 natural trash liner", "45 gallon trash can liners high density"],
  },
  {
    ref: "foodservice:produce-roll-10x15-hd-1400",
    queries: ["produce roll bags 10x15", "produce bags roll clear", "plastic produce bags on a roll"],
  },
  {
    ref: "foodservice:thank-you-1-8-small-100ct",
    // NOTE: only SMALL (~10x5x18) bags are like-for-like; standard 11.5x6.5x21 is a different product
    queries: ["small thank you bags", "1/8 t-shirt bags 10x5x18", "thank you t-shirt bags small size"],
  },
  {
    ref: "foodservice:thank-you-1-8-small-350ct",
    queries: ["small thank you bags", "1/8 t-shirt bags 10x5x18", "thank you t-shirt bags small size"],
  },
];

const MAX_PER_QUERY = 8; // top-N ASINs kept from each Finder query
const MAX_CANDIDATES = 12; // union cap per product before enrichment

async function loadTargets() {
  const refs = TARGETS.map((t) => t.ref);
  const { data, error } = await sb
    .from("products")
    .select("id, external_ref, name")
    .eq("line", "foodservice")
    .in("external_ref", refs);
  if (error) throw error;
  return TARGETS.map((t) => {
    const p = data!.find((x) => x.external_ref === t.ref);
    return { ...t, product: p ?? null };
  });
}

async function approvedCount(productId: string): Promise<number> {
  const { count, error } = await sb
    .from("competitors")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("status", "approved");
  if (error) throw error;
  return count ?? 0;
}

async function verify() {
  for (const t of await loadTargets()) {
    if (!t.product) { console.log(`MISSING  ${t.ref} — no product row`); continue; }
    const n = await approvedCount(t.product.id);
    console.log(`${String(n).padStart(2)} approved  ${t.ref}  (${t.product.name})`);
  }
}

async function search(outPath: string) {
  const sort = [["monthlySold", "desc"]] as [string, "asc" | "desc"][];
  const out: Record<string, { product_id: string; name: string; candidates: any[] }> = {};
  const seenQueries = new Map<string, string[]>(); // query → asins (dedupe across products sharing queries)

  for (const t of await loadTargets()) {
    if (!t.product) { console.log(`✗ ${t.ref} — no product row, skipping`); continue; }
    const existing = await approvedCount(t.product.id);
    if (existing > 0) { console.log(`• ${t.ref} — already has ${existing} approved, skipping`); continue; }

    const union: string[] = [];
    for (const q of t.queries) {
      if (union.length >= MAX_CANDIDATES) break;
      let asins = seenQueries.get(q);
      if (!asins) {
        asins = (await keepaFinder({ title: q, sort })).slice(0, MAX_PER_QUERY);
        seenQueries.set(q, asins);
        await sleep(2000); // gentle on the 20-tokens/min plan
      }
      console.log(`  finder "${q}" → ${asins.length} asins`);
      for (const a of asins) if (!union.includes(a)) union.push(a);
    }
    const candidates = union.slice(0, MAX_CANDIDATES);
    if (!candidates.length) { console.log(`✗ ${t.ref} — 0 candidates from all queries`); continue; }

    const { products: kp, tokensLeft } = await getKeepaProducts(candidates);
    const rows = kp.map((p) => {
      const c = mapKeepaToCompetitor(p);
      return {
        asin: c.asin, title: c.title, brand: c.brand, price: c.price,
        est_monthly_sales: c.est_monthly_sales, review_count: c.review_count, rating: c.rating,
      };
    });
    out[t.ref] = { product_id: t.product.id, name: t.product.name, candidates: rows };
    console.log(`✓ ${t.ref} — ${rows.length} candidates enriched (tokensLeft ${tokensLeft})`);
    await sleep(3000);
  }
  await writeFile(outPath, JSON.stringify(out, null, 2));
  console.log(`\nwrote candidates → ${outPath}`);
}

async function attach(keepsPath: string) {
  const keeps = JSON.parse(readFileSync(keepsPath, "utf8")) as Record<string, string[]>;
  const targets = await loadTargets();
  const allAsins = Array.from(new Set(Object.values(keeps).flat()));
  if (!allAsins.length) { console.log("nothing to attach"); return; }

  const byAsin = new Map<string, ReturnType<typeof mapKeepaToCompetitor>>();
  for (let i = 0; i < allAsins.length; i += 100) {
    const { products } = await getKeepaProducts(allAsins.slice(i, i + 100));
    for (const p of products) byAsin.set(p.asin, mapKeepaToCompetitor(p));
  }

  for (const [ref, asins] of Object.entries(keeps)) {
    const t = targets.find((x) => x.ref === ref);
    if (!t?.product) { console.log(`✗ ${ref} — not a known target product, skipping`); continue; }
    const { data: existing, error: exErr } = await sb
      .from("competitors").select("asin").eq("product_id", t.product.id);
    if (exErr) throw exErr;
    const have = new Set((existing ?? []).map((e: any) => e.asin));

    const rows: any[] = [];
    for (const asin of asins) {
      if (have.has(asin)) { console.log(`  • ${ref} — ${asin} already attached, skipping`); continue; }
      const cand = byAsin.get(asin);
      if (!cand) { console.log(`  ! ${ref} — ${asin} not returned by Keepa, skipping`); continue; }
      rows.push({
        product_id: t.product.id,
        status: "approved",
        ...cand,
        match_confidence: 0.95,
        match_reason: "hand-attached (validated)",
        created_by: OWNER,
        enriched_at: new Date().toISOString(),
      });
    }
    if (!rows.length) { console.log(`✗ ${ref} — nothing new to insert`); continue; }
    const { error: insErr } = await sb.from("competitors").insert(rows);
    if (insErr) { console.log(`! ${ref} — insert err: ${insErr.message}`); continue; }
    console.log(`✓ ${ref} — attached ${rows.length}: ${rows.map((r) => r.asin).join(", ")}`);
  }
}

const [mode, arg] = process.argv.slice(2);
if (mode === "verify") await verify();
else if (mode === "search" && arg) await search(arg);
else if (mode === "attach" && arg) await attach(arg);
else {
  console.log("usage: npx tsx scripts/attach-niche-competitors.mts verify | search <out.json> | attach <keeps.json>");
  process.exit(1);
}
process.exit(0);
