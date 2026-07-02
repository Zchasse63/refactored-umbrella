export default function AssumptionsLoading() {
  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-1 h-7 w-52 animate-pulse rounded bg-muted" />
        <div className="mb-5 h-4 w-full max-w-xl animate-pulse rounded bg-muted/60" />
        <div className="max-w-xl space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
