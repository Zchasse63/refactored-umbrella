export default function CatalogLoading() {
  return (
    <div data-register="storefront" className="text-[15px]">
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <div className="mb-6">
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-80 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="mb-6 flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-24 animate-pulse rounded-md bg-muted/60" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
