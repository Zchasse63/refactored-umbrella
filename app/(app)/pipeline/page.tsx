import { getCatalogWithPipeline, getViewerRole } from "@/lib/data/queries";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pipeline · Portal" };

export default async function PipelinePage() {
  const [views, role] = await Promise.all([getCatalogWithPipeline(), getViewerRole()]);
  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Pipeline</h1>
        <p className="mb-4 text-[13px] text-muted-foreground">
          The shared workflow — from unscreened to a Go / Hold / Pass decision.
        </p>
        <PipelineBoard views={views} role={role!} />
      </div>
    </div>
  );
}
