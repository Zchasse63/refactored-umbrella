import { defineConfig, devices } from "@playwright/test";

/**
 * Money-path E2E config for The Portal.
 *
 * These specs run against the DEPLOYED Netlify site (no local webServer) so they
 * double as a post-deploy smoke check. They intentionally require NO auth secrets
 * — they cover gating + render only. Authenticated money-path specs (set target →
 * PASS flips, RFQ download) need a seeded test session and are tracked as a
 * follow-up (see e2e/smoke.spec.ts header).
 *
 * Run with:  npm run test:e2e   (browsers must be installed: npx playwright install)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    // Override with PLAYWRIGHT_BASE_URL to point at a preview deploy or localhost.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://the-portal-sourcing.netlify.app",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
