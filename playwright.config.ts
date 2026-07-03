import { defineConfig, devices } from "@playwright/test";
// Loads .env.e2e (E2E credentials — written by `npm run test:e2e:setup`) and
// .env.local (service-role key for cleanup) without clobbering the real env.
import "./e2e/support/env";

/**
 * E2E config for The Portal — runs against the DEPLOYED Netlify site (no local
 * webServer) so it doubles as a post-deploy check.
 *
 * Projects:
 *   smoke    — the original unauthenticated gating/render specs (no secrets).
 *   setup    — signs both QA roles in via the Supabase API, mints @supabase/ssr
 *              cookies into e2e/.auth/{owner,partner}.json, and resets the
 *              designated test product. Declares `cleanup` as its teardown, so
 *              the DB reset runs after the dependent projects EVEN on failure.
 *   partner  — money-path specs tagged @partner, partner storageState.
 *   owner    — money-path specs tagged @owner, owner storageState. Depends on
 *              partner because the money path is ordered: the partner sets the
 *              target before the owner's quote can PASS against it.
 *   cleanup  — service-role reset of the test product (teardown of setup).
 *
 * Run with:  npm run test:e2e   (first: npm run test:e2e:setup, once, to mint
 * .env.e2e; browsers via npx playwright install chromium)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Live site + Netlify cold starts: give tests and assertions generous ceilings.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    // Override with PLAYWRIGHT_BASE_URL to point at a preview deploy or localhost.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://the-portal-sourcing.netlify.app",
    trace: "on-first-retry",
  },
  projects: [
    // Unauthenticated gating + render — intentionally NO storageState.
    {
      name: "smoke",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      teardown: "cleanup",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "cleanup",
      testMatch: /cleanup\.teardown\.ts/,
    },
    {
      name: "partner",
      testMatch: /money-path\.spec\.ts/,
      grep: /@partner/,
      dependencies: ["setup"],
      fullyParallel: false, // the money path is ordered — run in file order
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/partner.json" },
    },
    {
      name: "owner",
      testMatch: /money-path\.spec\.ts/,
      grep: /@owner/,
      dependencies: ["partner"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/owner.json" },
    },
  ],
});
