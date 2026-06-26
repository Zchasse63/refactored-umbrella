import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { getCatalog, getViewerRole, getPipelineStatuses } from "@/lib/data/queries";
import { computeDashboardStats } from "@/lib/data/stats";
import { can } from "@/lib/auth/capabilities";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { SelectionsTable } from "@/components/dashboard/selections-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · Portal" };

export default async function DashboardPage() {
  const [views, role, pipeline] = await Promise.all([getCatalog(), getViewerRole(), getPipelineStatuses()]);
  const stats = computeDashboardStats(views);

  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mb-4 text-[13px] text-muted-foreground">
          The negotiation at a glance — what’s targeted, quoted, and clearing.
        </p>

        <KpiCards stats={stats} />

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-section-label">Selections</div>
            {can(role, "factory_quotes.write") && (
              <Link
                href="/exports"
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-[12px] font-medium text-background transition hover:opacity-90"
              >
                <FileSpreadsheet className="size-3.5" /> Build RFQ
              </Link>
            )}
          </div>
          <SelectionsTable views={views} pipeline={pipeline} role={role!} />
        </div>
      </div>
    </div>
  );
}
