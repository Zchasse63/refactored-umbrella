export default function ProductDetailLoading() {
  return (
    <div data-register="storefront" className="text-[15px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-3 h-4 w-48 animate-pulse rounded bg-muted/60" />
        <div className="mb-4 h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-[420px] animate-pulse rounded-lg border border-border bg-muted/30" />
          <div className="space-y-3">
            <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/30" />
            <div className="h-56 animate-pulse rounded-lg border border-border bg-muted/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
