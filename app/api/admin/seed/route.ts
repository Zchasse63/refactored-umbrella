import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { PRODUCTS, demoSelection, demoQuote } from "@/lib/data/fixtures";
import { targetLanded, DEFAULT_GROSS_MARGIN } from "@/lib/calc/economics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function ensureUser(admin: ReturnType<typeof createSupabaseAdmin>, email: string, password: string, display: string) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: display },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user!.id;
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-secret") !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdmin();
  try {
    // 1. users + memberships
    const ownerId = await ensureUser(admin, process.env.QA_OWNER_EMAIL!, process.env.QA_OWNER_PASSWORD!, "Owner");
    const partnerId = await ensureUser(admin, process.env.QA_PARTNER_EMAIL!, process.env.QA_PARTNER_PASSWORD!, "Partner");
    await admin.from("memberships").upsert(
      [
        { user_id: ownerId, role: "owner", display_name: "Owner" },
        { user_id: partnerId, role: "partner", display_name: "Partner" },
      ],
      { onConflict: "user_id" },
    );

    // 2. products (idempotent by external_ref)
    const productRows = PRODUCTS.map((p) => ({
      external_ref: p.external_ref,
      line: p.line,
      brand: p.brand,
      source: p.source,
      name: p.name,
      model: p.model,
      group_name: p.group_name,
      subsection: p.subsection,
      categories: p.categories,
      specs: p.specs,
      features: p.features,
      source_url: p.source_url,
      msrp: p.msrp,
      our_cost: p.our_cost,
      our_cost_source: p.our_cost_source,
      photo_state: p.photo_state,
      image_has_chinese: p.image_has_chinese,
      voltage_flag: p.voltage_flag,
      export_ok: p.export_ok,
      primary_image_path: p.primary_image_path,
      created_by: ownerId,
    }));
    const { error: pErr } = await admin.from("products").upsert(productRows, { onConflict: "external_ref" });
    if (pErr) throw new Error(`products: ${pErr.message}`);

    const { data: idRows, error: idErr } = await admin.from("products").select("id, external_ref");
    if (idErr) throw new Error(`product ids: ${idErr.message}`);
    const idByRef = new Map((idRows ?? []).map((r) => [r.external_ref, r.id]));

    // 3. clean reseed of the demo layers
    await admin.from("factory_quotes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await admin.from("selections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await admin.from("pipeline_status").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const pipelineRows: any[] = [];
    const selectionRows: any[] = [];
    const quoteRows: any[] = [];
    PRODUCTS.forEach((p, i) => {
      const pid = idByRef.get(p.external_ref);
      if (!pid) return;
      pipelineRows.push({ product_id: pid, status: "new", updated_by: ownerId });
      const sel = demoSelection(p, i);
      if (sel.target_sell_price != null || sel.tier) {
        selectionRows.push({
          product_id: pid,
          partner_user_id: partnerId,
          tier: sel.tier,
          target_sell_price: sel.target_sell_price,
          target_landed_cost:
            sel.target_sell_price != null ? targetLanded(sel.target_sell_price, DEFAULT_GROSS_MARGIN) : null,
          updated_by: partnerId,
        });
      }
      const q = demoQuote(p, i, sel.target_sell_price);
      if (q != null) {
        quoteRows.push({
          product_id: pid,
          landed_cost_ddp: q,
          moq: 1000,
          lead_time_days: 35,
          supplier: "Demo factory",
          is_selected: true,
          created_by: ownerId,
        });
      }
    });

    const ins = async (table: string, rows: any[]) => {
      if (!rows.length) return 0;
      const { error } = await admin.from(table).insert(rows);
      if (error) throw new Error(`${table}: ${error.message}`);
      return rows.length;
    };

    const counts = {
      users: 2,
      products: productRows.length,
      pipeline: await ins("pipeline_status", pipelineRows),
      selections: await ins("selections", selectionRows),
      quotes: await ins("factory_quotes", quoteRows),
    };
    return NextResponse.json({ ok: true, counts });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
