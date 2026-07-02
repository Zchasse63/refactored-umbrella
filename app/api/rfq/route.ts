import { NextResponse, type NextRequest } from "next/server";
import path from "node:path";
import ExcelJS from "exceljs";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getAssumptions, getCatalog } from "@/lib/data/queries";
import { buildRfqRow, RFQ_COLUMNS } from "@/lib/data/rfq";
import { siteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  productRefs: string[];
  moqEdits?: Record<string, number | null>;
}

// only same-origin /products/*.jpg|png paths may be fetched (no SSRF, no traversal)
const SAFE_IMAGE = /^\/products\/[a-z0-9/_-]+\.(jpe?g|png)$/i;

export async function POST(req: NextRequest) {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // the owner builds + sends factory RFQs (the UI hides the button; enforce it here too)
  const { data: membership } = await sb.from("memberships").select("role").eq("user_id", user.id).maybeSingle();
  if (membership?.role !== "owner") return NextResponse.json({ error: "Only the owner can export RFQs" }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const refs = Array.isArray(body.productRefs) ? body.productRefs : [];
  if (refs.length === 0) return NextResponse.json({ error: "No products selected" }, { status: 400 });
  const moqEdits = body.moqEdits ?? {};

  try {
    const views = await getCatalog();
    const order = new Map(refs.map((r, i) => [r, i]));
    const selected = views
      .filter((v) => order.has(v.product.external_ref))
      .sort((a, b) => order.get(a.product.external_ref)! - order.get(b.product.external_ref)!);

    const rows = selected.map((v, i) => buildRfqRow(v, i + 1, moqEdits[v.product.external_ref] ?? null));

    // Snapshot exactly what we're sending + the assumptions it was computed under, so a
    // later global-assumptions change can never silently diverge from a sent RFQ.
    const assumptionsSnapshot = await getAssumptions();
    await sb.from("rfq_exports").insert({
      created_by: user.id,
      product_refs: selected.map((v) => v.product.external_ref),
      assumptions_snapshot: assumptionsSnapshot,
      rows_snapshot: rows,
    });

    // Pre-fetch clean product images from the CDN (public/ is not on the function's disk
    // on Netlify). Same-origin /products/*.{jpg,png} only.
    const origin = siteOrigin();
    const imageBuffers = new Map<string, { buf: Buffer; ext: "jpeg" | "png" }>();
    await Promise.all(
      rows
        .filter((r) => r.imagePath && SAFE_IMAGE.test(r.imagePath))
        .map(async (r) => {
          try {
            const resp = await fetch(new URL(r.imagePath!, origin).toString(), { redirect: "error" });
            if (!resp.ok) return;
            const ab = await resp.arrayBuffer();
            const e = path.extname(r.imagePath!).slice(1).toLowerCase();
            imageBuffers.set(r.imagePath!, { buf: Buffer.from(ab), ext: e === "png" ? "png" : "jpeg" });
          } catch {
            /* skip an image that fails to load — never fail the whole RFQ */
          }
        }),
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = "The Portal";
    const ws = wb.addWorksheet("RFQ", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = RFQ_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 22;

    const moneyCols = new Set(RFQ_COLUMNS.filter((c) => (c as any).money).map((c) => c.key));
    const imageColIdx = RFQ_COLUMNS.findIndex((c) => c.key === "imageCol");

    rows.forEach((r) => {
      const row = ws.addRow({
        index: r.index,
        name: r.name,
        model: r.model ?? "",
        category: r.category ?? "",
        keySpecs: r.keySpecs,
        targetLanded: r.targetLanded ?? "",
        moqAsk: r.moqAsk ?? "",
        targetSell: r.targetSell ?? "",
        voltage: r.voltage,
        imageCol: "",
      });
      row.alignment = { vertical: "top", wrapText: true };
      for (const key of moneyCols) {
        const cell = row.getCell(key);
        if (typeof cell.value === "number") cell.numFmt = '"$"#,##0.00';
      }
      const img = r.imagePath ? imageBuffers.get(r.imagePath) : undefined;
      if (img) {
        const imageId = wb.addImage({ buffer: img.buf as any, extension: img.ext });
        row.height = 56;
        ws.addImage(imageId, {
          tl: { col: imageColIdx + 0.15, row: row.number - 1 + 0.1 } as any,
          ext: { width: 72, height: 72 },
        });
      }
    });

    ws.addRow([]);
    const note = ws.addRow([
      `Target Landed Cost is DDP (duty-paid, delivered). MOQ Ask is our requested minimum. Generated ${new Date().toISOString().slice(0, 10)}.`,
    ]);
    note.font = { italic: true, color: { argb: "FF6B7280" }, size: 9 };

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rfq-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("rfq build:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't build the RFQ. Please try again." }, { status: 500 });
  }
}
