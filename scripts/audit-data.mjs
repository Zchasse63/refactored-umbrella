/**
 * Data-semantic auditor (test layer L4). Verifies invariants that neither unit tests
 * nor Playwright DOM checks can see: orphaned rows, image paths that don't exist on
 * disk, photo_state↔path mismatches, missing AI copy, duplicate slugs, voltage sanity.
 * Read-only. Exits non-zero if any hard invariant fails (CI-gateable).
 *
 *   node scripts/audit-data.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PUBLIC = path.resolve(process.cwd(), "public");

const fail = [], warn = [];
const check = (cond, msg, hard = true) => { if (!cond) (hard ? fail : warn).push(msg); };

const { data: products, error } = await sb.from("products")
  .select("id, external_ref, line, name, name_clean, summary, features_clean, model, model_clean, group_name, photo_state, primary_image_path, voltage_flag, specs");
if (error) throw error;
const ids = new Set(products.map((p) => p.id));

// 1. identity / dupes
const refs = products.map((p) => p.external_ref);
check(new Set(refs).size === refs.length, `duplicate external_ref (${refs.length - new Set(refs).size})`);
const slugs = products.map((p) => p.external_ref?.split(":")[1]);
const dupeSlug = slugs.filter((s, i) => slugs.indexOf(s) !== i);
check(dupeSlug.length === 0, `duplicate slug: ${[...new Set(dupeSlug)].join(", ")}`);

// 2. copy coverage (AI cleanup)
for (const p of products) {
  check(!!(p.name_clean || p.name), `no name: ${p.external_ref}`);
  check(!!p.summary, `missing summary: ${p.external_ref}`, false);
  check(Array.isArray(p.features_clean) && p.features_clean.length > 0, `no features_clean: ${p.external_ref}`, false);
}

// 3. photo_state <-> primary_image_path consistency + file exists on disk
for (const p of products) {
  const hasPath = !!p.primary_image_path;
  if (p.photo_state === "good") check(hasPath, `photo_state=good but no image path: ${p.external_ref}`);
  if (hasPath) {
    check(p.primary_image_path.startsWith("/products/"), `bad image path: ${p.external_ref} -> ${p.primary_image_path}`);
    const f = path.join(PUBLIC, p.primary_image_path);
    check(fs.existsSync(f), `image file missing on disk: ${p.primary_image_path}`);
  }
}

// 4. specs cleanliness (no junk marketing-sentence labels left)
for (const p of products) {
  for (const s of p.specs ?? []) {
    check(!(String(s.label || "").length > 40), `junk spec label survived: ${p.external_ref}`, false);
  }
}

// 5. orphans: selections / factory_quotes / pipeline_status must reference live products
for (const tbl of ["selections", "factory_quotes", "pipeline_status"]) {
  const { data } = await sb.from(tbl).select("product_id");
  const orphans = (data ?? []).filter((r) => !ids.has(r.product_id));
  check(orphans.length === 0, `${tbl} has ${orphans.length} orphaned rows`);
}

// 6. voltage sanity: US Yuno categories should mostly be NOT flagged 220V
const usCats = new Set(["Coffee / Espresso", "Air Fryers", "Multifunction Ovens & Toasters", "Rice & Pressure Cookers", "Blenders & Food Processors"]);
const usFlagged = products.filter((p) => usCats.has(p.group_name) && p.voltage_flag).length;
check(usFlagged < 6, `unexpectedly many US small-appliances flagged 220V: ${usFlagged}`, false);

console.log(`Audited ${products.length} products.`);
console.log(`HARD failures: ${fail.length} | warnings: ${warn.length}`);
for (const m of fail) console.log("  ✗ " + m);
for (const m of warn) console.log("  ⚠ " + m);
process.exit(fail.length ? 1 : 0);
