"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload, Check, X } from "lucide-react";
import { cn, money, EMDASH } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/capabilities";
import type { ProductView } from "@/lib/data/view";
import type { Role, Tier } from "@/lib/types";

const LINE_SHORT: Record<string, string> = { appliance: "Appl", beauty: "Beauty", foodservice: "Food" };
const TIER_VARIANT: Record<Tier, "pass" | "warn" | "neutral"> = { pursue: "pass", maybe: "warn", pass: "neutral" };

export function RfqBuilder({
  views,
  moq,
  role,
}: {
  views: ProductView[];
  moq: Record<string, number | null>;
  role: Role;
}) {
  const router = useRouter();
  const canExport = can(role, "factory_quotes.write"); // owner exports the RFQ + imports quotes
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(views.filter((v) => v.selection.target_sell_price != null).map((v) => v.product.external_ref)),
  );
  const [moqEdits, setMoqEdits] = useState<Record<string, number | null>>(() => ({ ...moq }));
  const [tier, setTier] = useState<Tier | "all">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ found: number; updated: number; skipped: { model: string; reason: string }[] } | null>(null);

  async function importQuotes(file: File) {
    setImportBusy(true);
    setImportError(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/rfq-import", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setImportError(j?.error ?? `Import failed (${res.status})`);
        return;
      }
      setImportResult(j);
      router.refresh();
    } catch {
      setImportError("Import failed — network error.");
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return views.filter((v) => {
      if (tier !== "all" && v.selection.tier !== tier) return false;
      if (needle && !(`${v.product.name} ${v.product.model ?? ""}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [views, tier, q]);

  const selectedViews = views.filter((v) => selected.has(v.product.external_ref));
  const imageCount = selectedViews.filter((v) => v.product.export_ok && v.product.primary_image_path).length;

  const toggle = (ref: string) =>
    setSelected((s) => { const n = new Set(s); n.has(ref) ? n.delete(ref) : n.add(ref); return n; });
  const setMoq = (ref: string, val: number | null) => setMoqEdits((s) => ({ ...s, [ref]: val }));

  async function exportExcel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rfq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productRefs: [...selected], moqEdits }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? `Export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rfq-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed — network error.");
    } finally {
      setBusy(false);
    }
  }

  const chips: { id: Tier | "all"; label: string }[] = [
    { id: "all", label: "All" }, { id: "pursue", label: "Pursue" }, { id: "maybe", label: "Maybe" }, { id: "pass", label: "Pass" },
  ];

  return (
    <div>
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-fail/30 bg-fail-muted px-3 py-2 text-[12px] text-fail-muted-foreground">
          {error}
          <button onClick={() => setError(null)} className="ml-auto opacity-70 hover:opacity-100" aria-label="Dismiss"><X className="size-3.5" /></button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {chips.map((c) => (
            <button key={c.id} onClick={() => setTier(c.id)}
              className={cn("rounded-full border px-2.5 py-0.5 text-[11px] capitalize transition",
                tier === c.id ? "border-foreground/20 bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}>
              {c.label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or model…"
          className="h-7 w-56 rounded-md border border-input bg-card px-2 text-[12px] outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <button onClick={() => setSelected(new Set(rows.map((v) => v.product.external_ref)))} className="rounded border border-border px-2 py-0.5 hover:bg-muted">Select shown</button>
          <button onClick={() => setSelected(new Set())} className="rounded border border-border px-2 py-0.5 hover:bg-muted">Clear</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[820px] text-[12px]">
          <thead>
            <tr className="border-b border-border-strong bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="w-8 px-2 py-2"></th>
              <th className="px-3 py-2 font-semibold">Product</th>
              <th className="px-2 py-2 font-semibold">Line</th>
              <th className="px-2 py-2 font-semibold">Tier</th>
              <th className="px-2 py-2 text-right font-semibold">Target landed (DDP)</th>
              <th className="px-2 py-2 text-right font-semibold">MOQ ask</th>
              <th className="px-2 py-2 font-semibold">Image</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v, i) => {
              const ref = v.product.external_ref;
              const checked = selected.has(ref);
              return (
                <tr key={ref} className={cn("border-b border-border last:border-0", i % 2 && "bg-muted/20", checked && "bg-target-muted/30")}>
                  <td className="px-2 py-1.5">
                    <input type="checkbox" checked={checked} onChange={() => toggle(ref)} className="size-3.5 accent-[var(--target)]" aria-label={`Include ${v.product.name}`} />
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{v.product.name}</span>
                    {v.product.model && <span className="numeric ml-1.5 text-[10px] text-muted-foreground">{v.product.model}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{LINE_SHORT[v.product.line]}</td>
                  <td className="px-2 py-1.5">
                    {v.selection.tier ? <Badge variant={TIER_VARIANT[v.selection.tier]} className="capitalize">{v.selection.tier}</Badge> : <span className="text-muted-foreground/50">{EMDASH}</span>}
                  </td>
                  <td className="numeric px-2 py-1.5 text-right text-target">{v.economics.targetLanded == null ? EMDASH : money(v.economics.targetLanded)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number" min={0} step={1}
                      value={moqEdits[ref] ?? ""}
                      placeholder="—"
                      onChange={(e) => setMoq(ref, e.target.value === "" ? null : Number(e.target.value))}
                      className="numeric w-20 rounded border border-input bg-card px-1.5 py-0.5 text-right text-[12px] outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {v.product.export_ok && v.product.primary_image_path
                      ? <span className="text-[11px] text-pass">embeds</span>
                      : <span className="text-[11px] text-muted-foreground/60">no image</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No products match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-muted-foreground">
          <b className="text-foreground">{selected.size}</b> selected · {imageCount} image{imageCount === 1 ? "" : "s"} will embed
        </span>
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={exportExcel}
            disabled={!canExport || selected.size === 0 || busy}
            title={!canExport ? "The owner exports the RFQ" : selected.size === 0 ? "Select products first" : undefined}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
            Export Excel RFQ
          </Button>
        </div>
      </div>
      {!canExport && <p className="mt-2 text-[11px] text-muted-foreground">The owner builds and sends factory RFQs. You can review the selection.</p>}

      {canExport && (
        <div className="mt-6 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold">
            <Upload className="size-3.5" /> Import factory quotes
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Upload the RFQ the factory filled in. We match by Model / SKU and update each quote — PASS/FAIL recomputes across the app.
          </p>
          {importError && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-fail/30 bg-fail-muted px-3 py-2 text-[12px] text-fail-muted-foreground">
              {importError}
              <button onClick={() => setImportError(null)} className="ml-auto opacity-70 hover:opacity-100" aria-label="Dismiss"><X className="size-3.5" /></button>
            </div>
          )}
          {importResult && (
            <div className="mt-2 rounded-md border border-pass/30 bg-pass-muted px-3 py-2 text-[12px] text-pass-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Check className="size-3.5" /> Imported {importResult.updated} of {importResult.found} quote{importResult.found === 1 ? "" : "s"}
                {importResult.skipped.length > 0 ? <span className="text-muted-foreground"> · {importResult.skipped.length} skipped</span> : null}
              </div>
              {importResult.skipped.length > 0 && (
                <div className="mt-1 max-h-24 overflow-y-auto text-[10px] text-muted-foreground">
                  {importResult.skipped.slice(0, 20).map((sk, i) => (
                    <div key={i}>{sk.model}: {sk.reason}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              disabled={importBusy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importQuotes(f); }}
              className="text-[12px] file:mr-2 file:rounded file:border file:border-border file:bg-card file:px-2 file:py-1 file:text-[12px] file:hover:bg-muted"
            />
            {importBusy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      )}
    </div>
  );
}
