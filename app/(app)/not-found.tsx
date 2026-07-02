import Link from "next/link";

/** Neutral 404 inside the authenticated shell — reachable via notFound() on the PDP
 *  and any unmatched segment under the app group. */
export default function AppNotFound() {
  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto flex max-w-[1400px] items-center justify-center px-4 py-24">
        <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            404
          </p>
          <p className="text-base font-semibold text-foreground">Page not found</p>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or may have been moved.
          </p>
          <Link
            href="/catalog"
            className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-border-strong bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
