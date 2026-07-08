import { NextResponse, type NextRequest } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getProductViewBySlug } from "@/lib/data/queries";
import { SpecSheet, type SpecSheetData } from "@/lib/pdf/spec-sheet";
import { siteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SAFE_IMAGE = /^\/products\/[a-z0-9/_-]+\.(jpe?g|png)$/i;

export async function GET(req: NextRequest) {
  // members only (product info; both roles may download)
  const sb = await createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const view = await getProductViewBySlug(slug);
  if (!view) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const p = view.product;

  // pre-fetch the image as a data: URI (reliable on serverless vs @react-pdf's own loader)
  let imageDataUri: string | null = null;
  if (p.export_ok && p.primary_image_path && SAFE_IMAGE.test(p.primary_image_path)) {
    try {
      const r = await fetch(new URL(p.primary_image_path, siteOrigin()).toString(), { redirect: "error" });
      if (r.ok) {
        const b = Buffer.from(await r.arrayBuffer());
        const mime = p.primary_image_path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        imageDataUri = `data:${mime};base64,${b.toString("base64")}`;
      }
    } catch {
      /* fall back to the placeholder */
    }
  }

  try {
    const data: SpecSheetData = {
      name: p.name,
      model: p.model,
      category: p.group_name,
      summary: p.summary,
      specs: p.specs,
      features: p.features,
      voltageFlag: p.voltage_flag,
      imageDataUri,
      generatedAt: new Date().toISOString().slice(0, 10),
    };
    // cast: SpecSheet renders a <Document> at runtime; @react-pdf's types want the element typed as DocumentProps
    const buffer = await renderToBuffer(React.createElement(SpecSheet, { data }) as any);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${slug}-spec-sheet.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("spec-sheet:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't build the spec sheet. Please try again." }, { status: 500 });
  }
}
