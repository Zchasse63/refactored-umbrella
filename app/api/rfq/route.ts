import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getCatalog } from "@/lib/data/queries";
import { buildRfqRow, RFQ_COLUMNS } from "@/lib/data/rfq";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  productRefs: string[];
  moqEdits?: Record<string, number | null>;
}

export async function POST(req: NextRequest) {
  // auth: must be a signed-in member (RLS still applies to the reads below)
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

    const rows = selected.map((v, i) =>
      buildRfqRow(v, i + 1, moqEdits[v.product.external_ref] ?? null),
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = "The Portal";
    wb.created = new Date();
    const ws = wb.addWorksheet("RFQ", { views: [{ state: "frozen", ySplit: 1 }] });

    ws.columns = RFQ_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 22;

    const moneyCols = new Set(RFQ_COLUMNS.filter((c) => (c as any).money).map((c) => c.key));

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
      // embed a clean product image (export_ok only)
      if (r.imagePath) {
        // containment: never read outside public/products, regardless of the DB value
        const productsDir = path.resolve(process.cwd(), "public", "products");
        const file = path.resolve(process.cwd(), "public", r.imagePath.replace(/^\/+/, ""));
        const safe = file === productsDir || file.startsWith(productsDir + path.sep);
        if (safe && fs.existsSync(file)) {
          const ext = path.extname(file).slice(1).toLowerCase();
          const imageId = wb.addImage({ buffer: fs.readFileSync(file) as any, extension: ext === "jpg" ? "jpeg" : (ext as any) });
          row.height = 56;
          const col = RFQ_COLUMNS.findIndex((c) => c.key === "imageCol");
          ws.addImage(imageId, {
            tl: { col: col + 0.15, row: row.number - 1 + 0.1 },
            ext: { width: 72, height: 72 },
          });
        }
      }
    });

    // a small footer note (neutral / unbranded by default)
    ws.addRow([]);
    const note = ws.addRow([`Target Landed Cost is DDP (duty-paid, delivered). MOQ Ask is our requested minimum. Generated ${new Date().toISOString().slice(0, 10)}.`]);
    note.font = { italic: true, color: { argb: "FF6B7280" }, size: 9 };

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `rfq-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : "RFQ build failed").slice(0, 300) }, { status: 500 });
  }
}
