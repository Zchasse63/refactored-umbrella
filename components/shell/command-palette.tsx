"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command, Search } from "lucide-react";
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

/** A real ⌘K command palette — replaces the former dead affordance. Jump to any page
 *  by keyboard (⌘/Ctrl+K to open, type to filter, ↑/↓ to move, Enter to go). */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? DESTINATIONS.filter((d) => d.label.toLowerCase().includes(n) || d.hint.toLowerCase().includes(n)) : DESTINATIONS;
  }, [q]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

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
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); const r = results[active]; if (r) go(r.href); }
                }}
                placeholder="Jump to a page…"
                aria-label="Search pages"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <ul className="max-h-72 overflow-y-auto p-1">
              {results.length === 0 ? (
                <li className="px-3 py-6 text-center text-[12px] text-muted-foreground">No matching page.</li>
              ) : (
                results.map((r, i) => (
                  <li key={r.href}>
                    <button
                      type="button"
                      onClick={() => go(r.href)}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] transition",
                        i === active ? "bg-muted" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="font-medium">{r.label}</span>
                      <span className="text-[11px] text-muted-foreground">{r.hint}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
