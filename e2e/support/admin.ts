/**
 * Service-role helpers for the money-path E2E suite.
 *
 * The suite mutates ONE designated, safe-to-mutate product on the live site:
 * the 602 electric kettle. These helpers reset it to its canonical clean state
 * (no selection row, no factory quotes — verified to be the pre-suite state),
 * used both BEFORE the run (deterministic start) and AFTER it (cleanup, via the
 * Playwright teardown project so it fires even when tests fail).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

/** The one designated test product. Appliance line — safe to mutate. */
export const KETTLE = {
  slug: "602-electric-kettle",
  ref: "appliance:602-electric-kettle",
  name: "602 Electric kettle",
} as const;

export function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function kettleProductId(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb
    .from("products")
    .select("id")
    .eq("external_ref", KETTLE.ref)
    .single();
  if (error || !data) {
    throw new Error(`Could not resolve test product ${KETTLE.ref}: ${error?.message ?? "not found"}`);
  }
  return data.id as string;
}

/**
 * Reset the kettle to a clean slate: DELETE all factory_quotes rows and the
 * selections row (tier/sell/landed all gone — equivalent to "null", and exactly
 * the state the product was in before the suite ever ran).
 */
export async function resetKettle(): Promise<void> {
  const sb = adminClient();
  const productId = await kettleProductId(sb);
  const quotes = await sb.from("factory_quotes").delete().eq("product_id", productId);
  if (quotes.error) throw new Error(`factory_quotes cleanup failed: ${quotes.error.message}`);
  const selections = await sb.from("selections").delete().eq("product_id", productId);
  if (selections.error) throw new Error(`selections cleanup failed: ${selections.error.message}`);
}

/** Current DB state for the kettle — used to verify cleanup actually landed. */
export async function kettleState(): Promise<{ selections: unknown[]; quotes: unknown[] }> {
  const sb = adminClient();
  const productId = await kettleProductId(sb);
  const [sel, q] = await Promise.all([
    sb.from("selections").select("id, tier, target_sell_price").eq("product_id", productId),
    sb.from("factory_quotes").select("id, landed_cost_ddp").eq("product_id", productId),
  ]);
  if (sel.error) throw new Error(`selections readback failed: ${sel.error.message}`);
  if (q.error) throw new Error(`factory_quotes readback failed: ${q.error.message}`);
  return { selections: sel.data ?? [], quotes: q.data ?? [] };
}
