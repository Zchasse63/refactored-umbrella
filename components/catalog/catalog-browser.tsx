"use client";

import { useMemo, useState } from "react";
import { Search, SearchX, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCard } from "./product-card";
import { CatalogSidebar } from "./catalog-sidebar";
import { applyFilters, sortViews, EMPTY_FILTERS, isFiltered, type CatalogFilters, type CatalogSort } from "@/lib/data/catalog-filter";
import type { ProductView } from "@/lib/data/fixtures";

const SORTS: { key: CatalogSort; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "name", label: "Name A–Z" },
  { key: "target-desc", label: "Target sell ↓" },
  { key: "target-asc", label: "Target sell ↑" },
  { key: "net", label: "Net margin ↓" },
  { key: "headroom", label: "Headroom ↓" },
  { key: "needs-photo", label: "Needs photo" },
];

export function CatalogBrowser({ views }: { views: ProductView[] }) {
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<CatalogSort>("relevance");
  const [showFilters, setShowFilters] = useState(false);

  const result = useMemo(() => sortViews(applyFilters(views, filters), sort), [views, filters, sort]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className={cn("shrink-0 lg:w-[230px]", showFilters ? "block" : "hidden lg:block")}>
        <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          <CatalogSidebar views={views} filters={filters} onChange={setFilters} />
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] lg:hidden", isFiltered(filters) ? "border-target text-target" : "border-border")}
          >
            <SlidersHorizontal className="size-4" /> Filters
          </button>
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder={`Search ${views.length} products…`} className="pl-8" />
          </div>
          <Select aria-label="Sort products" value={sort} onChange={(e) => setSort(e.target.value as CatalogSort)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>Sort: {s.label}</option>
            ))}
          </Select>
        </div>

        <div className="text-[12px] text-muted-foreground">
          {result.length === views.length ? `${views.length} products` : `${result.length} of ${views.length} products`}
        </div>

        {result.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No products match"
            hint="Nothing matches your search and filters. Clear them to see the full catalog."
            action={
              isFiltered(filters) ? (
                <button onClick={() => setFilters(EMPTY_FILTERS)} className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-target hover:bg-muted">
                  Clear filters
                </button>
              ) : null
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {result.map((v) => (
              <ProductCard key={v.product.external_ref} view={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
