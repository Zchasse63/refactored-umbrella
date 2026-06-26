import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client — bypasses RLS. SERVER ONLY (importers, admin tasks, seeding). */
export function createSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
