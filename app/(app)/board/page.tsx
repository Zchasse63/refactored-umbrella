import { getCatalog, getViewerRole } from "@/lib/data/queries";
import { BoardTable } from "@/components/board/board-table";
import { ColdStartBanner } from "@/components/shell/cold-start-banner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Board · Portal" };

export default async function BoardPage() {
  const [views, role] = await Promise.all([getCatalog(), getViewerRole()]);
  const hasTargets = views.some((v) => v.selection.tier != null || v.selection.target_sell_price != null);
  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Board</h1>
        <p className="mb-4 text-[13px] text-muted-foreground">
          Every SKU ranked by the number that matters — headroom under the target landed cost.
        </p>
        {!hasTargets && <ColdStartBanner role={role!} />}
        <BoardTable views={views} role={role!} />
      </div>
    </div>
  );
}
