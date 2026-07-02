"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Route-segment error boundary for the authenticated shell. Catches render/data
 *  failures on the force-dynamic routes so a DB blip degrades to a considered card
 *  instead of Next's raw error page. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for observability; the user only ever sees the friendly card.
    console.error(error);
  }, [error]);

  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto flex max-w-[1400px] items-center justify-center px-4 py-24">
        <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-base font-semibold text-foreground">Something went wrong</p>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            We couldn&apos;t load this page. This is usually temporary — please try again in a moment.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Try again
            </button>
            <Link
              href="/catalog"
              className="inline-flex h-8 items-center justify-center rounded-md border border-border-strong bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Back to catalog
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
