/**
 * AUTH SETUP (Playwright project-dependency pattern).
 *
 * For each role we sign in Node-side with @supabase/supabase-js (anon key +
 * E2E_* credentials from .env.e2e — written by `npm run test:e2e:setup`), then
 * mint the exact cookies @supabase/ssr expects (see support/supabase-cookies.ts)
 * and save them as Playwright storageState files that the "owner" / "partner"
 * projects consume. Each setup test also boots a real context against the site
 * to prove the middleware accepts the minted session before any spec runs.
 *
 * This file also resets the designated test product to a clean slate so the
 * money-path specs always start deterministic.
 */
import fs from "node:fs";
import path from "node:path";
import { test as setup, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { requireEnv, ROOT } from "./support/env";
import { sessionToCookies } from "./support/supabase-cookies";
import { resetKettle } from "./support/admin";

const AUTH_DIR = path.join(ROOT, "e2e", ".auth");

const ROLES = [
  { role: "owner", emailVar: "E2E_OWNER_EMAIL", passwordVar: "E2E_OWNER_PASSWORD" },
  { role: "partner", emailVar: "E2E_PARTNER_EMAIL", passwordVar: "E2E_PARTNER_PASSWORD" },
] as const;

setup("reset the kettle test product to a clean slate", async () => {
  await resetKettle();
});

for (const { role, emailVar, passwordVar } of ROLES) {
  setup(`authenticate ${role}`, async ({ browser, baseURL }) => {
    const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const sb = createClient(supabaseUrl, requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await sb.auth.signInWithPassword({
      email: requireEnv(emailVar),
      password: requireEnv(passwordVar),
    });
    expect(error, `signInWithPassword failed for ${role}: ${error?.message}`).toBeNull();
    expect(data.session, `no session returned for ${role}`).toBeTruthy();

    const cookies = sessionToCookies(data.session!, supabaseUrl, baseURL!);
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const stateFile = path.join(AUTH_DIR, `${role}.json`);
    fs.writeFileSync(stateFile, JSON.stringify({ cookies, origins: [] }, null, 2));

    // Prove the middleware (@supabase/ssr) accepts the minted cookies: a protected
    // route must render, not bounce to /login.
    const context = await browser.newContext({ storageState: stateFile });
    const page = await context.newPage();
    await page.goto(`${baseURL}/catalog`);
    await expect(page).not.toHaveURL(/\/login/);
    await context.close();
  });
}
