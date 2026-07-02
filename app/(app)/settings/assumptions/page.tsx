import { getAssumptions, getViewerRole } from "@/lib/data/queries";
import { AssumptionsEditor } from "@/components/settings/assumptions-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assumptions · Portal" };

export default async function AssumptionsPage() {
  const [assumptions, role] = await Promise.all([getAssumptions(), getViewerRole()]);
  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Global assumptions</h1>
        <p className="mb-5 max-w-xl text-[13px] text-muted-foreground">
          The shared cost model. Change it once and every product&apos;s target landed cost recomputes — this is the number the partner negotiates and the factory quotes against.
        </p>
        <AssumptionsEditor initial={assumptions} canEdit={role === "owner"} />
      </div>
    </div>
  );
}
