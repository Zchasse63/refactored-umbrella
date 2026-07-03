"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command, Loader2, Search } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Destinations the ⌘K palette can jump to (mirrors the top-bar nav). */
const DESTINATIONS = [
  { label: "Catalog", href: "/catalog", hint: "Browse all products" },
  { label: "Products", href: "/products", hint: "Editable list" },
  { label: "Board", href: "/board", hint: "Ranked by headroom" },
  { label: "Pipeline", href: "/pipeline", hint: "Stage workflow" },
  { label: "Dashboard", href: "/dashboard", hint: "Negotiation at a glance" },
  { label: "Exports", href: "/exports", hint: "Factory RFQ" },
];

const LINE_LABEL: Record<string, string> = { appliance: "Appliance", beauty: "Beauty", foodservice: "Foodservice" };

interface ProductHit {
  external_ref: string;
  name: string;
  model: string | null;
  line: string;
}

/** One keyboard-navigable row — a page destination or a product hit. */
type Item =
  | { kind: "page"; label: string; hint: string; href: string }
  | { kind: "product"; hit: ProductHit; href: string };

/** A real ⌘K command palette — jump to any page, or search the catalog by name/model
 *  (⌘/Ctrl+K to open, type to filter, ↑/↓ to move, Enter to go). Product search kicks
 *  in at 2+ characters, debounced, against the products table. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [products, setProducts] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Monotonic ticket — a stale (slower) response must never clobber a newer one.
  const seq = useRef(0);
  const sb = useMemo(() => createSupabaseBrowser(), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setProducts([]);
      setSearching(false);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced product search on 2+ typed characters.
  useEffect(() => {
    const n = q.trim();
    // Strip PostgREST or-syntax delimiters so free text can't break the filter.
    const safe = n.replace(/[,()%]/g, " ").trim();
    if (!open || n.length < 2 || !safe) {
      seq.current++; // invalidate any in-flight response
      setProducts([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ticket = ++seq.current;
    const t = setTimeout(async () => {
      const { data } = await sb
        .from("products")
        .select("external_ref,name,model,line")
        .or(`name.ilike.%${safe}%,model.ilike.%${safe}%`)
        .limit(8);
      if (ticket !== seq.current) return; // superseded by newer keystroke / close
      setProducts((data as ProductHit[] | null) ?? []);
      setSearching(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, sb]);

  const pages = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? DESTINATIONS.filter((d) => d.label.toLowerCase().includes(n) || d.hint.toLowerCase().includes(n)) : DESTINATIONS;
  }, [q]);

  // Single flat list drives ↑/↓/Enter across both groups; grouping is render-only.
  const items = useMemo<Item[]>(
    () => [
      ...pages.map((d): Item => ({ kind: "page", label: d.label, hint: d.hint, href: d.href })),
      ...products.map((p): Item => ({ kind: "product", hit: p, href: `/p/${p.external_ref.split(":")[1]}` })),
    ],
    [pages, products],
  );
  // Clamp into range — results can shrink/grow underneath the cursor (debounced fetch).
  const act = items.length === 0 ? 0 : Math.min(Math.max(active, 0), items.length - 1);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const Row = ({ item, index }: { item: Item; index: number }) => (
    <li>
      <button
        type="button"
        onClick={() => go(item.href)}
        onMouseEnter={() => setActive(index)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] transition",
          index === act ? "bg-muted" : "hover:bg-muted/60",
        )}
      >
        {item.kind === "page" ? (
          <>
            <span className="font-medium">{item.label}</span>
            <span className="text-[11px] text-muted-foreground">{item.hint}</span>
          </>
        ) : (
          <>
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-medium">{item.hit.name}</span>
              {item.hit.model && <span className="numeric shrink-0 text-[10px] text-muted-foreground">{item.hit.model}</span>}
            </span>
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
              {LINE_LABEL[item.hit.line] ?? item.hit.line}
            </span>
          </>
        )}
      </button>
    </li>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command menu (Command or Control + K)"
        className="hidden items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground md:flex"
      >
        <Command className="size-3" aria-hidden /> K
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-background/60 pt-[15vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Command menu"
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(act + 1, items.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(act - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); const r = items[act]; if (r) go(r.href); }
                }}
                placeholder="Jump to a page or search products…"
                aria-label="Search pages and products"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {searching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Searching products" />}
            </div>
            <ul className="max-h-72 overflow-y-auto p-1">
              {items.length === 0 && !searching ? (
                <li className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  {q.trim().length >= 2 ? "No matching page or product." : "No matching page."}
                </li>
              ) : (
                <>
                  {pages.length > 0 && (
                    <li aria-hidden className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Pages
                    </li>
                  )}
                  {pages.map((d, i) => (
                    <Row key={d.href} item={items[i]} index={i} />
                  ))}
                  {products.length > 0 && (
                    <li aria-hidden className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Products
                    </li>
                  )}
                  {products.map((p, i) => (
                    <Row key={p.external_ref} item={items[pages.length + i]} index={pages.length + i} />
                  ))}
                </>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
