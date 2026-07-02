export default function ProductsLoading() {
  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-1 h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="mb-4 h-4 w-40 animate-pulse rounded bg-muted/60" />
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
