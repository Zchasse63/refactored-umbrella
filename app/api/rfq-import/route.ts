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
    if ("result" in v) {
      const r = v.result;
      if (r == null || (typeof r === "object" && "error" in r)) return null; // error cell
      if (r instanceof Date) return r.getTime();
      return r as string | number;
    }
    if ("text" in v) return v.text ?? null;              // hyperlink
    if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
  }
  return null; // unknown object cell — never coerce to "[object Object]" (would poison matching)
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
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });

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
    const modelCounts = new Map<string, number>();
    for (const p of products ?? []) if (p.model) {
      const k = String(p.model).trim().toLowerCase();
      modelCounts.set(k, (modelCounts.get(k) ?? 0) + 1);
    }
    const byModel = new Map<string, string>();
    for (const p of products ?? []) if (p.model) {
      const k = String(p.model).trim().toLowerCase();
      if ((modelCounts.get(k) ?? 0) === 1) byModel.set(k, p.id); // skip ambiguous SKUs entirely
    }

    let updated = 0;
    const skipped: { model: string; reason: string }[] = [];
    for (const row of imported) {
      const key = row.model.trim().toLowerCase();
      const productId = byModel.get(key);
      if (!productId) {
        const reason = (modelCounts.get(key) ?? 0) > 1 ? "ambiguous — multiple products share this SKU" : "no product with that model/SKU";
        skipped.push({ model: row.model, reason });
        continue;
      }
      if (row.quote == null) { skipped.push({ model: row.model, reason: "MOQ filled but no quote price — quote required" }); continue; }
      // Atomic deselect+insert in one transaction (set_selected_quote RPC) — no race with
      // the partial unique index, no window where the product has zero selected quotes.
      const { error } = await sb.rpc("set_selected_quote", {
        p_product_id: productId,
        p_landed: row.quote,
        p_moq: row.moq,
        p_supplier: "RFQ import",
      });
      if (error) { console.error("rfq-import set_selected_quote:", error.message); skipped.push({ model: row.model, reason: "couldn't save this quote" }); continue; }
      updated++;
    }

    for (const path of ["/dashboard", "/board", "/products", "/exports"]) revalidatePath(path);
    return NextResponse.json({ ok: true, found: imported.length, updated, skipped });
  } catch (e) {
    console.error("rfq-import:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't read that file. Make sure it's the exported RFQ workbook." }, { status: 500 });
  }
}
