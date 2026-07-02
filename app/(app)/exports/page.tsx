import { Download } from "lucide-react";
import { getCatalog, getViewerRole, getFactoryMoqs } from "@/lib/data/queries";
import { RfqBuilder } from "@/components/exports/rfq-builder";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exports · Portal" };

export default async function ExportsPage() {
  const [views, role, moq] = await Promise.all([getCatalog(), getViewerRole(), getFactoryMoqs()]);
  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Factory RFQ</h1>
        <p className="mb-4 max-w-2xl text-[13px] text-muted-foreground">
          Build the request you take to the factory. The negotiation number is the
          <span className="text-target"> target landed cost (DDP)</span> — and the MOQ ask is how you request a minimum.
          Clean product images embed automatically.
        </p>
        <RfqBuilder views={views} moq={moq} role={role!} />

        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <div className="text-[12px]">
            <div className="font-semibold">Spreadsheet export</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Every product in the catalog as a CSV — name, tier, target sell, target landed (DDP), quote, net % and pipeline stage.
            </p>
          </div>
          <div className="ml-auto">
            <Button asChild variant="outline" size="sm">
              <a href="/api/export" download>
                <Download className="size-3.5" /> Download full catalog CSV
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
