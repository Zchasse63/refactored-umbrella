"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { CommandPalette } from "./command-palette";
import type { Role } from "@/lib/types";

const NAV: { href: string; label: string; ready: boolean; ownerOnly?: boolean }[] = [
  { href: "/catalog", label: "Catalog", ready: true },
  { href: "/products", label: "Products", ready: true },
  { href: "/board", label: "Board", ready: true },
  { href: "/pipeline", label: "Pipeline", ready: true },
  { href: "/dashboard", label: "Dashboard", ready: true },
  { href: "/exports", label: "Exports", ready: true },
  { href: "/settings/assumptions", label: "Assumptions", ready: true, ownerOnly: true },
];

export function TopBar({ role }: { role: Role }) {
  const path = usePathname();
  const router = useRouter();
  const nav = NAV.filter((n) => !n.ownerOnly || role === "owner");

  async function signOut() {
    await createSupabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-4 px-4">
        <Link href="/catalog" className="flex shrink-0 items-center gap-1.5 font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-[11px] text-primary-foreground">P</span>
          <span className="hidden sm:inline">Portal</span>
        </Link>

        {/* Scrollable on narrow screens so every destination stays reachable; brand and
            role/sign-out stay pinned. */}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-[13px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav.map((n) =>
            n.ready ? (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 transition",
                  path.startsWith(n.href) ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {n.label}
              </Link>
            ) : (
              <span key={n.href} className="cursor-default rounded-md px-2.5 py-1.5 text-muted-foreground/40" title="Coming in Phase 1–2">
                {n.label}
              </span>
            ),
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <CommandPalette />
          <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] capitalize">
            <span
              className={cn(
                "size-2 rounded-full",
                role === "owner" ? "bg-accent-owner" : "border border-accent-partner bg-transparent",
              )}
              aria-hidden
            />
            {role}
          </span>
          <button onClick={signOut} className="text-muted-foreground transition hover:text-foreground" title="Sign out" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
