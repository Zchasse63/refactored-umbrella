export default function PipelineLoading() {
  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-80 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
