export default function DashboardLoading() {
  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[78px] animate-pulse rounded-lg border border-border bg-muted/40" />
          ))}
        </div>
        <div className="mt-6 h-64 animate-pulse rounded-lg border border-border bg-muted/30" />
      </div>
    </div>
  );
}
