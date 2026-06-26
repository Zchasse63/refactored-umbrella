"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { targetLanded, DEFAULT_GROSS_MARGIN } from "@/lib/calc/economics";
import type { Tier } from "@/lib/types";

type Result = { ok: true } | { error: string };

async function resolveProduct(ref: string) {
  const sb = createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };
  const { data: product } = await sb.from("products").select("id").eq("external_ref", ref).maybeSingle();
  if (!product) return { ok: false as const, error: "Product not found" };
  return { ok: true as const, sb, user, productId: product.id };
}

function revalidate(ref: string) {
  revalidatePath("/catalog");
  revalidatePath("/products");
  revalidatePath(`/p/${ref.split(":")[1]}`);
}

/** Partner: save prospect tier + target sell (RLS gates to the partner role). */
export async function saveSelection(
  ref: string,
  patch: { tier?: Tier | null; target_sell_price?: number | null },
): Promise<Result> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  const sell = patch.target_sell_price ?? null;
  const target_landed_cost = sell != null ? targetLanded(sell, DEFAULT_GROSS_MARGIN) : null;
  const { error } = await r.sb.from("selections").upsert(
    {
      product_id: r.productId,
      partner_user_id: r.user.id,
      tier: patch.tier ?? null,
      target_sell_price: sell,
      target_landed_cost,
      updated_by: r.user.id,
    },
    { onConflict: "product_id,partner_user_id" },
  );
  if (error) return { error: error.message };
  revalidate(ref);
  return { ok: true };
}

/** Owner: save a factory quote (DDP) as the selected quote (RLS gates to the owner role). */
export async function saveQuote(ref: string, landed: number | null): Promise<Result> {
  const r = await resolveProduct(ref);
  if (!r.ok) return { error: r.error };
  // clear any prior selected quote, then add the new one (one selected per product)
  await r.sb.from("factory_quotes").update({ is_selected: false }).eq("product_id", r.productId).eq("is_selected", true);
  if (landed != null) {
    const { error } = await r.sb.from("factory_quotes").insert({
      product_id: r.productId,
      landed_cost_ddp: landed,
      is_selected: true,
      created_by: r.user.id,
    });
    if (error) return { error: error.message };
  }
  revalidate(ref);
  return { ok: true };
}
