"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ProductCard } from "./product-card";
import type { ProductView } from "@/lib/data/fixtures";

type LineFilter = "all" | "appliance" | "beauty" | "foodservice";
type Sort = "relevance" | "margin" | "needs-photo" | "name";

const LINE_TABS: { key: LineFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "appliance", label: "Appliances" },
  { key: "beauty", label: "Beauty" },
  { key: "foodservice", label: "Foodservice" },
];

export function CatalogBrowser({ views }: { views: ProductView[] }) {
  const [q, setQ] = useState("");
  const [line, setLine] = useState<LineFilter>("all");
  const [needsPhotoOnly, setNeedsPhotoOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("relevance");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: views.length, appliance: 0, beauty: 0, foodservice: 0 };
    for (const v of views) c[v.product.line]++;
    return c;
  }, [views]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = views.filter((v) => {
      if (line !== "all" && v.product.line !== line) return false;
      if (needsPhotoOnly && v.product.photo_state === "good") return false;
      if (!needle) return true;
      const p = v.product;
      const hay = [p.name, p.model, p.subsection, p.group_name, ...p.specs.map((s) => `${s.label} ${s.value}`)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
    out = [...out].sort((a, b) => {
      if (sort === "name") return a.product.name.localeCompare(b.product.name);
      if (sort === "needs-photo")
        return Number(b.product.photo_state !== "good") - Number(a.product.photo_state !== "good");
      if (sort === "margin")
        return (b.economics.liveNetPct ?? -1) - (a.economics.liveNetPct ?? -1);
      return 0;
    });
    return out;
  }, [views, q, line, needsPhotoOnly, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${views.length} products by name, model, or spec`}
            className="pl-8"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-9 rounded-md border border-input bg-card px-2 text-[13px]"
        >
          <option value="relevance">Sort: Relevance</option>
          <option value="margin">Net margin ↓</option>
          <option value="needs-photo">Needs photo first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {LINE_TABS.filter((t) => t.key === "all" || (counts[t.key] ?? 0) > 0).map((t) => (
          <button
            key={t.key}
            onClick={() => setLine(t.key)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-medium transition",
              line === t.key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
            <span className="numeric ml-1.5 opacity-60">{counts[t.key] ?? 0}</span>
          </button>
        ))}
        <button
          onClick={() => setNeedsPhotoOnly((s) => !s)}
          className={cn(
            "rounded-full px-3 py-1 text-[12px] font-medium transition",
            needsPhotoOnly ? "bg-quoted-muted text-quoted-muted-foreground" : "border border-border text-muted-foreground hover:bg-muted",
          )}
        >
          Needs photo
        </button>
        <span className="numeric ml-auto text-[12px] text-muted-foreground">{filtered.length} products</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong py-16 text-center text-sm text-muted-foreground">
          No products match. Clear the search or filters.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((v) => (
            <ProductCard key={v.product.external_ref} view={v} />
          ))}
        </div>
      )}
    </div>
  );
}
