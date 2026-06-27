import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { createSupabaseServer } from "@/lib/supabase/server";
import { parseReturnedRfq } from "@/lib/data/rfq";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cellValue(cell: ExcelJS.Cell): string | number | null {
  const v = cell.value as any;
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? null;          // formula
    if ("text" in v) return v.text ?? null;              // hyperlink
    if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
  }
  return String(v);
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: membership } = await sb.from("memberships").select("role").eq("user_id", user.id).maybeSingle();
  if (membership?.role !== "owner") return NextResponse.json({ error: "Only the owner can import quotes" }, { status: 403 });

  let file: File | null = null;
  try {
    const f = (await req.formData()).get("file");
    if (f instanceof File) file = f;
  } catch {
    /* fallthrough */
  }
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return NextResponse.json({ error: "Empty workbook" }, { status: 400 });

    const rows: (string | number | null)[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const arr: (string | number | null)[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => arr.push(cellValue(cell)));
      rows.push(arr);
    });

    const imported = parseReturnedRfq(rows);
    if (imported.length === 0) {
      return NextResponse.json(
        { error: "No factory quotes found. Fill in the 'Factory Quote (DDP)' column and keep the 'Model / SKU' column." },
        { status: 400 },
      );
    }

    const { data: products } = await sb.from("products").select("id, model");
    const byModel = new Map<string, string>();
    for (const p of products ?? []) if (p.model) byModel.set(String(p.model).trim().toLowerCase(), p.id);

    let updated = 0;
    const skipped: { model: string; reason: string }[] = [];
    for (const row of imported) {
      const productId = byModel.get(row.model.toLowerCase());
      if (!productId) { skipped.push({ model: row.model, reason: "no product with that model/SKU" }); continue; }
      if (row.quote == null) { skipped.push({ model: row.model, reason: "no quote value" }); continue; }
      // mirror saveQuote: clear any prior selected quote, then insert the new selected one
      await sb.from("factory_quotes").update({ is_selected: false }).eq("product_id", productId).eq("is_selected", true);
      const { error } = await sb.from("factory_quotes").insert({
        product_id: productId,
        landed_cost_ddp: row.quote,
        moq: row.moq,
        is_selected: true,
        supplier: "RFQ import",
        created_by: user.id,
      });
      if (error) { skipped.push({ model: row.model, reason: error.message }); continue; }
      updated++;
    }

    for (const path of ["/dashboard", "/board", "/products", "/exports"]) revalidatePath(path);
    return NextResponse.json({ ok: true, found: imported.length, updated, skipped });
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : "Import failed").slice(0, 300) }, { status: 500 });
  }
}
