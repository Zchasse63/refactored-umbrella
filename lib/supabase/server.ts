import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Per-request server client bound to the auth cookie (RLS-enforced as the signed-in user).
 *  Async since Next 15: cookies() returns a Promise — every caller awaits this factory. */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component — middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
