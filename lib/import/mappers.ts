/**
 * Idempotent import mappers — pure transforms from the real on-disk catalog JSON
 * (RoyalStar appliances + beauty) into the Portal `Product` shape, with the
 * data-cleaning pass baked in (BUILD_PLAN §11): line-namespaced external_ref,
 * 220V voltage flag, canonical photo-state + export-ok quarantine.
 *
 * No I/O here — callers pass the parsed arrays. The DB upsert (by external_ref)
 * lands on top of these once the dedicated Supabase project exists.
 */
import { cleanSpecs } from "@/lib/data/clean";
import type { PhotoState, Product, Spec } from "@/lib/types";

const basename = (p?: string | null) =>
  p ? p.split("/").pop() ?? null : null;

// 220 V is the Chinese-market voltage landmine. Plain substring catches every form
// ("220 v ~", "220V", "220-240V", "AC220V") — matches the verified 46/70 reality.
const has220 = (specs: Spec[]) =>
  specs.some((s) => String(s.value).includes("220"));

// ── Appliances (RoyalStar) ──────────────────────────────────────────────────
export interface RawAppliance {
  slug: string;
  name: string;
  group?: string | null;
  subsection?: string | null;
  categories?: string[];
  specs?: Spec[];
  features?: string[];
  url?: string | null;
  image?: string | null;
  img_tier?: string | null;
  img_issues?: string[];
  needs_photo?: boolean;
}

function appliancePhotoState(a: RawAppliance): { photo_state: PhotoState; export_ok: boolean } {
  const issues = a.img_issues ?? [];
  if (!a.image) return { photo_state: "missing", export_ok: false };
  if (issues.includes("wrong_product")) return { photo_state: "reshoot", export_ok: false };
  if (a.img_tier === "poor") return { photo_state: "reshoot", export_ok: false };
  const dirty = ["text_overlay", "lifestyle", "food_dominant", "multiple_products", "chinese_text"];
  if (a.needs_photo || issues.some((i) => dirty.includes(i)))
    return { photo_state: "clean-photo-needed", export_ok: false };
  return { photo_state: "good", export_ok: true };
}

export function mapAppliance(a: RawAppliance): Product {
  const specs = cleanSpecs(a.specs);
  const file = basename(a.image);
  const { photo_state, export_ok } = appliancePhotoState(a);
  return {
    external_ref: `appliance:${a.slug}`,
    line: "appliance",
    brand: null, // neutral / unbranded — no maker mark in the data layer
    source: "RoyalStar",
    name: a.name,
    model: null,
    group_name: a.group ?? null,
    subsection: a.subsection ?? null,
    categories: a.categories ?? [],
    specs,
    features: a.features ?? [],
    summary: null,
    source_url: a.url ?? null,
    msrp: null,
    our_cost: null,
    our_cost_source: null,
    photo_state,
    image_has_chinese: (a.img_issues ?? []).includes("chinese_text"),
    voltage_flag: has220(specs),
    export_ok,
    primary_image_path: file ? `/products/appliance/${file}` : null,
  };
}

// ── Beauty / personal-care (MKS) ────────────────────────────────────────────
export interface RawBeauty {
  id: string;
  name: string;
  model?: string | null;
  section?: string | null;
  specs?: Spec[];
  selling_points?: string[];
  final_image?: string | null;
  image_quality?: string | null;
  image_has_chinese?: boolean;
  needs_clean_photo?: boolean;
  needs_reshoot?: boolean;
  qc_tier?: string | null;
}

function beautyPhotoState(b: RawBeauty): { photo_state: PhotoState; export_ok: boolean } {
  if (!b.final_image) return { photo_state: "missing", export_ok: false };
  if (b.needs_reshoot || b.qc_tier === "poor" || b.image_quality === "poor")
    return { photo_state: "reshoot", export_ok: false };
  if (b.image_has_chinese || b.needs_clean_photo)
    return { photo_state: "clean-photo-needed", export_ok: false };
  return { photo_state: "good", export_ok: true };
}

export function mapBeauty(b: RawBeauty): Product {
  const specs = cleanSpecs(b.specs);
  const file = basename(b.final_image);
  const { photo_state, export_ok } = beautyPhotoState(b);
  return {
    external_ref: `beauty:${b.id}`,
    line: "beauty",
    brand: null, // neutral / unbranded — no maker mark in the data layer
    source: "MKS",
    name: b.name,
    model: b.model ?? null,
    group_name: b.section ?? null,
    subsection: b.section ?? null,
    categories: b.section ? [b.section] : [],
    specs,
    features: b.selling_points ?? [],
    summary: null,
    source_url: null,
    msrp: null,
    our_cost: null,
    our_cost_source: null,
    photo_state,
    image_has_chinese: Boolean(b.image_has_chinese),
    voltage_flag: has220(specs),
    export_ok,
    primary_image_path: file ? `/products/beauty/${file}` : null,
  };
}

// ── Yuno Group USA — RoyalStar US sell-sheet (May 2026) ─────────────────────
// The real US-market catalog: 110-120V, import-ready Key Features, no images yet
// (placeholder track). Loaded alongside the legacy China-market set.
export interface RawYunoUS {
  sku: string;
  sku_sell_sheet?: string | null;
  slug: string;
  name: string;
  category: string;
  subcategory?: string | null;
  specs?: Spec[];
  features?: string[];
  voltage_flag?: boolean;
  us_voltage_confirmed?: boolean;
  status_note?: string | null;
  needs_verify?: boolean;
  has_photo?: boolean; // a clean product photo was extracted from the US sell-sheet deck
}

export function mapYunoUS(p: RawYunoUS): Product {
  const hasPhoto = p.has_photo === true;
  return {
    external_ref: `appliance:${p.slug}`,
    line: "appliance",
    brand: null, // neutral / unbranded
    source: "RoyalStar",
    name: p.name,
    model: p.sku,
    group_name: p.category,
    subsection: p.subcategory ?? p.category,
    categories: [p.category, p.subcategory].filter((x): x is string => !!x),
    specs: cleanSpecs(p.specs),
    features: p.features ?? [],
    summary: null, // filled by the AI copy-cleanup pass
    source_url: null,
    msrp: null,
    our_cost: null,
    our_cost_source: null,
    // sell-sheet photo if extracted; otherwise the "studio photo pending" placeholder
    photo_state: hasPhoto ? "good" : "missing",
    image_has_chinese: false,
    voltage_flag: Boolean(p.voltage_flag),
    export_ok: hasPhoto,
    primary_image_path: hasPhoto ? `/products/appliance/${p.slug}.jpg` : null,
  };
}

/** Top-level shapes of the catalog JSON files. */
export interface ApplianceCatalog { count?: number; products: RawAppliance[]; }
export interface BeautyCatalog { count?: number; sections?: string[]; products: RawBeauty[]; }
export interface YunoUSCatalog { count?: number; products: RawYunoUS[]; }

export function mapAppliances(c: ApplianceCatalog): Product[] {
  return c.products.map(mapAppliance);
}
export function mapBeautyCatalog(c: BeautyCatalog): Product[] {
  return c.products.map(mapBeauty);
}
export function mapYunoUSCatalog(c: YunoUSCatalog): Product[] {
  return c.products.map(mapYunoUS);
}

/**
 * Foodservice fixtures are stored ALREADY in Product shape (lib/data/source/foodservice.json,
 * dumped from the live catalog — hand-authored Greenway quotes + researched Amazon top-seller
 * sizes). This mapper just normalizes numerics and re-asserts required flags so a malformed
 * edit to the JSON fails loudly in tests rather than silently seeding garbage.
 */
export function mapFoodservice(rows: unknown[]): Product[] {
  return (rows as Record<string, unknown>[]).map((r) => {
    if (!r.external_ref || !r.name || r.line !== "foodservice") {
      throw new Error(`foodservice fixture row missing external_ref/name/line: ${JSON.stringify(r).slice(0, 120)}`);
    }
    return {
      ...(r as unknown as Product),
      msrp: r.msrp != null ? Number(r.msrp) : null,
      our_cost: r.our_cost != null ? Number(r.our_cost) : null,
      categories: (r.categories as string[]) ?? [],
      specs: (r.specs as Product["specs"]) ?? [],
      features: (r.features as string[]) ?? [],
      image_has_chinese: Boolean(r.image_has_chinese),
      voltage_flag: Boolean(r.voltage_flag),
      export_ok: Boolean(r.export_ok),
    };
  });
}
