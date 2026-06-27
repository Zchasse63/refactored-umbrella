import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { PRODUCTS } from "@/lib/data/fixtures";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Constant-time compare against a DEDICATED seed secret (never the RLS-bypassing
 *  service-role key). HMAC both sides to a fixed 32-byte digest so neither the result
 *  NOR the secret's length leaks via timing. */
function seedSecretOk(provided: string | null): boolean {
  const expected = process.env.SEED_SECRET;
  if (!expected || !provided) return false;
  const digest = (s: string) => createHmac("sha256", "portal-seed-compare").update(s).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

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
  // Seeding is a privileged, RLS-bypassing operation: off in production unless
  // explicitly enabled, and gated by a dedicated secret (not the service-role key).
  const seedingAllowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_SEED === "1";
  if (!seedingAllowed) return NextResponse.json({ error: "seeding disabled" }, { status: 403 });
  if (!seedSecretOk(req.headers.get("x-seed-secret"))) {
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

    // 3. Pipeline status — give any product without a row a starting "new" status.
    //    NO demo economics are seeded. Selections (partner targets) and factory_quotes
    //    (owner quotes) are real user data: this route never creates or deletes them,
    //    so re-seeding products is always safe to run against live data.
    const { data: existingPipe } = await admin.from("pipeline_status").select("product_id");
    const hasPipe = new Set((existingPipe ?? []).map((r) => r.product_id));
    const pipelineRows = PRODUCTS.map((p) => idByRef.get(p.external_ref))
      .filter((pid): pid is string => !!pid && !hasPipe.has(pid))
      .map((pid) => ({ product_id: pid, status: "new", updated_by: ownerId }));

    let pipelineAdded = 0;
    if (pipelineRows.length) {
      const { error } = await admin.from("pipeline_status").insert(pipelineRows);
      if (error) throw new Error(`pipeline_status: ${error.message}`);
      pipelineAdded = pipelineRows.length;
    }

    return NextResponse.json({
      ok: true,
      counts: { users: 2, products: productRows.length, pipeline_added: pipelineAdded },
      note: "selections & factory_quotes are real user data — never seeded or cleared by this route",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
