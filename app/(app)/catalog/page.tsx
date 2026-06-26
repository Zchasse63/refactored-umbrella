import { getCatalog } from "@/lib/data/queries";
import { CatalogBrowser } from "@/components/catalog/catalog-browser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog · Portal" };

export default async function CatalogPage() {
  const views = await getCatalog();
  return (
    <div data-register="storefront" className="text-[15px]">
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {views.length} products · appliances + beauty + foodservice. Appliances start with no cost —
            generating the target landed cost to negotiate is the job.
          </p>
        </div>
        <CatalogBrowser views={views} />
      </div>
    </div>
  );
}
