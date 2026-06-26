"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<"" | "password" | "magic">("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading("password");
    const { error } = await createSupabaseBrowser().auth.signInWithPassword({ email, password });
    setLoading("");
    if (error) return setMsg(error.message);
    router.push(next || "/catalog");
    router.refresh();
  }

  async function magicLink() {
    if (!email) return setMsg("Enter your email first.");
    setMsg(null);
    setLoading("magic");
    const { error } = await createSupabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next || "/catalog")}` },
    });
    setLoading("");
    setMsg(error ? error.message : "Check your inbox for a sign-in link.");
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-xs text-primary-foreground">P</span>
        <span className="text-lg font-semibold tracking-tight">Portal</span>
      </div>
      <p className="mb-5 text-[13px] text-muted-foreground">Invite-only workspace. Sign in to continue.</p>

      <form onSubmit={signIn} className="space-y-3">
        <div>
          <label className="mb-1 block text-[12px] text-muted-foreground">Email</label>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-muted-foreground">Password</label>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <Button type="submit" className="w-full" disabled={loading !== ""}>
          {loading === "password" && <Loader2 className="size-4 animate-spin" />} Sign in
        </Button>
      </form>

      <div className="my-4 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={magicLink} disabled={loading !== ""}>
        {loading === "magic" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Email me a magic link
      </Button>

      {msg && <p className="mt-4 text-center text-[12px] text-muted-foreground" role="status">{msg}</p>}
    </div>
  );
}
