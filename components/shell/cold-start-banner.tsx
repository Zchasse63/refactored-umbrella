import Link from "next/link";
import { Compass } from "lucide-react";
import type { Role } from "@/lib/types";

/** Shown on cockpit views while NO product has a target yet — the whole app reads as a
 *  wall of em-dashes until the partner sets the first target, so point them at step one. */
export function ColdStartBanner({ role }: { role: Role }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-target/30 bg-target-muted/30 p-3">
      <Compass className="mt-0.5 size-4 shrink-0 text-target" aria-hidden />
      <div className="text-[12px]">
        <div className="font-semibold text-foreground">No targets set yet — this is where the deal starts.</div>
        <p className="mt-0.5 text-muted-foreground">
          {role === "partner" ? (
            <>
              Open any product from the{" "}
              <Link href="/catalog" className="font-medium text-target underline underline-offset-2">catalog</Link>, set a{" "}
              <span className="font-medium text-foreground">target sell price</span>, and the target landed cost + PASS/FAIL fill in automatically. Every number here comes alive once the first target lands.
            </>
          ) : (
            <>
              The partner sets target sell prices — that&apos;s what fills these columns. Meanwhile, open a product to attach Amazon competitors and enter factory quotes.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
