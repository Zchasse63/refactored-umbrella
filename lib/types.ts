/**
 * Domain types — the app's shared contract, aligned with BUILD_PLAN §6 (schema) and
 * the calculator/importer modules. Kept hand-written for now; once the dedicated
 * Supabase project exists, the generated DB types layer underneath these.
 */

export type Line = "appliance" | "beauty" | "foodservice";
export type Source = "RoyalStar" | "MKS" | "Greenway";
export type Role = "owner" | "partner";

/** Canonical photo-state enum (DESIGN_GUIDE §1.1 / §4). One set, everywhere. */
export type PhotoState = "good" | "clean-photo-needed" | "reshoot" | "missing";

export type Tier = "pursue" | "maybe" | "pass";
export type PipelineStatus =
  | "new"
  | "shortlisted"
  | "costing"
  | "quoted"
  | "decision";
export type Decision = "go" | "hold" | "pass";

export interface Spec {
  label: string;
  value: string;
}

export interface Product {
  /** Idempotency key, namespaced by line: `appliance:<slug>` / `beauty:<id>` / `greenway:<id>`. */
  external_ref: string;
  line: Line;
  brand: string | null;
  source: Source;
  name: string;
  model: string | null;
  group_name: string | null;
  subsection: string | null;
  categories: string[];
  specs: Spec[];
  features: string[];
  source_url: string | null;
  msrp: number | null;
  our_cost: number | null;
  our_cost_source: string | null;
  /** Derived data-cleaning fields. */
  photo_state: PhotoState;
  image_has_chinese: boolean;
  voltage_flag: boolean; // a spec lists 220V — verify for US
  export_ok: boolean; // image safe to put in a factory-facing RFQ
  primary_image_path: string | null; // public/ path, e.g. /products/appliance/<slug>.jpg
}

/** A competitor mini-product (Keepa-enriched). */
export interface Competitor {
  id: string;
  product_external_ref: string;
  status: "candidate" | "approved" | "rejected";
  title: string;
  brand: string | null;
  marketplace: "amazon" | "walmart" | "other";
  asin: string | null;
  retail_url: string | null;
  price: number | null;
  currency: string;
  rating: number | null;
  review_count: number | null;
  bsr: number | null;
  est_monthly_sales: number | null;
  monthly_sales_source: string | null;
  image_url: string | null;
  match_confidence: number | null;
  match_reason: string | null;
  source: "claude" | "manual" | "keepa";
}

/** Partner's working layer. */
export interface Selection {
  product_external_ref: string;
  tier: Tier | null;
  priority: number | null;
  target_sell_price: number | null;
  target_landed_cost: number | null; // derived + persisted
  calc_inputs: CalcInputs | null; // per-product override bag
  notes: string | null;
}

export interface FactoryQuote {
  product_external_ref: string;
  landed_cost_ddp: number;
  moq: number | null;
  lead_time_days: number | null;
  supplier: string | null;
  is_selected: boolean;
}

// ── Calculator types (see lib/calc/economics.ts) ────────────────────────────
export interface CostLine {
  key: string;
  label: string;
  pct: number; // 0..1, share of sell price
}
export interface Assumptions {
  grossMargin: number; // 0..1
  costStack: CostLine[];
}
export type CalcInputs = Partial<{
  sellPrice: number;
  grossMargin: number;
  costStack: CostLine[];
}> & { overridden?: boolean };
