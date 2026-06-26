import { redirect } from "next/navigation";
import { getViewerRole } from "@/lib/data/queries";
import { TopBar } from "@/components/shell/top-bar";

export const dynamic = "force-dynamic";

/** Authenticated shell. Middleware gates no-user → /login; here we gate no-membership. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await getViewerRole();
  if (!role) redirect("/no-access");
  return (
    <div className="min-h-screen bg-background">
      <TopBar role={role} />
      <main>{children}</main>
    </div>
  );
}
