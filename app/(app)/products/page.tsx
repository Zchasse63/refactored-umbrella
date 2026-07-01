import { getAssumptions, getCatalog, getViewerRole } from "@/lib/data/queries";
import { ProductsList } from "@/components/products/products-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products · Portal" };

export default async function ProductsPage() {
  const [views, role, assumptions] = await Promise.all([getCatalog(), getViewerRole(), getAssumptions()]);
  return (
    <div data-register="cockpit" className="text-[13px]">
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Products</h1>
        <p className="mb-4 text-[13px] text-muted-foreground">{views.length} items · editable list</p>
        <ProductsList views={views} role={role!} assumptions={assumptions} />
      </div>
    </div>
  );
}
