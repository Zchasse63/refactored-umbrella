import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "No access · Portal" };

export default function NoAccessPage() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-card">
      <h1 className="text-lg font-semibold tracking-tight">Awaiting access</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Your account isn&apos;t linked to this workspace yet. Ask the owner to add you, then sign in again.
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}
