import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";
import { buildView, emptySelection, type ProductView } from "@/lib/data/view";
import { DEFAULT_ASSUMPTIONS } from "@/lib/calc/economics";
import type { Assumptions, Competitor, Product, Selection } from "@/lib/types";

const num = (v: unknown): number | null => (v == null ? null : Number(v));

function rowToProduct(r: any): Product {
  return {
    external_ref: r.external_ref,
    line: r.line,
    brand: r.brand,
    source: r.source,
    name: r.name,
    model: r.model,
    group_name: r.group_name,
    subsection: r.subsection,
    categories: r.categories ?? [],
    specs: r.specs ?? [],
    features: r.features ?? [],
    source_url: r.source_url,
    msrp: num(r.msrp),
    our_cost: num(r.our_cost),
    our_cost_source: r.our_cost_source,
    photo_state: r.photo_state,
    image_has_chinese: !!r.image_has_chinese,
    voltage_flag: !!r.voltage_flag,
    export_ok: !!r.export_ok,
    primary_image_path: r.primary_image_path,
  };
}

function rowToSelection(s: any, ref: string): Selection {
  return {
    product_external_ref: ref,
    tier: s.tier,
    priority: s.priority,
    target_sell_price: num(s.target_sell_price),
    target_landed_cost: num(s.target_landed_cost),
    calc_inputs: s.calc_inputs,
    notes: s.notes,
  };
}

export async function getAssumptions(): Promise<Assumptions> {
  const sb = createSupabaseServer();
  const { data } = await sb.from("assumptions").select("gross_margin, cost_stack").eq("id", 1).single();
  if (!data) return DEFAULT_ASSUMPTIONS;
  return { grossMargin: Number(data.gross_margin), costStack: data.cost_stack };
}

export async function getCatalog(): Promise<ProductView[]> {
  const sb = createSupabaseServer();
  const [{ data: products }, { data: selections }, { data: quotes }, assumptions] = await Promise.all([
    sb.from("products").select("*").order("line").order("name"),
    sb.from("selections").select("*"),
    sb.from("factory_quotes").select("product_id, landed_cost_ddp").eq("is_selected", true),
    getAssumptions(),
  ]);
  const selByProduct = new Map((selections ?? []).map((s: any) => [s.product_id, s]));
  const quoteByProduct = new Map((quotes ?? []).map((q: any) => [q.product_id, Number(q.landed_cost_ddp)]));
  return (products ?? []).map((r: any) => {
    const product = rowToProduct(r);
    const s = selByProduct.get(r.id);
    const selection = s ? rowToSelection(s, product.external_ref) : emptySelection(product.external_ref);
    return buildView(product, selection, quoteByProduct.get(r.id) ?? null, assumptions);
  });
}

export async function getProductViewBySlug(slug: string): Promise<ProductView | null> {
  const sb = createSupabaseServer();
  const refs = ["appliance", "beauty", "foodservice"].map((l) => `${l}:${slug}`);
  const { data: product } = await sb.from("products").select("*").in("external_ref", refs).maybeSingle();
  if (!product) return null;
  const [{ data: sel }, { data: quote }, assumptions] = await Promise.all([
    sb.from("selections").select("*").eq("product_id", product.id).maybeSingle(),
    sb.from("factory_quotes").select("landed_cost_ddp").eq("product_id", product.id).eq("is_selected", true).maybeSingle(),
    getAssumptions(),
  ]);
  const p = rowToProduct(product);
  const selection = sel ? rowToSelection(sel, p.external_ref) : emptySelection(p.external_ref);
  return buildView(p, selection, quote ? Number(quote.landed_cost_ddp) : null, assumptions);
}

export async function getCompetitors(ref: string): Promise<Competitor[]> {
  const sb = createSupabaseServer();
  const refs = ["appliance", "beauty", "foodservice"].map((l) => `${l}:${ref.split(":")[1]}`);
  const { data: product } = await sb.from("products").select("id").in("external_ref", refs).maybeSingle();
  if (!product) return [];
  const { data } = await sb
    .from("competitors")
    .select("*")
    .eq("product_id", product.id)
    .order("est_monthly_sales", { ascending: false, nullsFirst: false });
  return (data ?? []).map((c: any) => ({
    id: c.id,
    product_external_ref: ref,
    status: c.status,
    title: c.title,
    brand: c.brand,
    marketplace: c.marketplace,
    asin: c.asin,
    retail_url: c.retail_url,
    price: num(c.price),
    currency: c.currency,
    rating: num(c.rating),
    review_count: c.review_count,
    bsr: c.bsr,
    est_monthly_sales: c.est_monthly_sales,
    monthly_sales_source: c.monthly_sales_source,
    image_url: c.image_url,
    match_confidence: num(c.match_confidence),
    match_reason: c.match_reason,
    source: c.source,
  }));
}

/** Current user's role (for UI affordances). */
export async function getViewerRole(): Promise<"owner" | "partner" | null> {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("memberships").select("role").eq("user_id", user.id).maybeSingle();
  return (data?.role as "owner" | "partner") ?? null;
}
