/**
 * MONEY-PATH SMOKE E2E — gating + render only, NO auth secrets required.
 *
 * These run against the deployed site (baseURL in playwright.config.ts). They are
 * deliberately resilient: no hardcoded timeouts, only web-first assertions that
 * auto-wait/retry, and no login attempt (no test credentials are available).
 *
 * Coverage here:
 *   (a) an unauthenticated visit to a protected route (/catalog) redirects to /login
 *   (b) /login renders the invite-only magic-link form
 *   (c) the login page loads with no console errors
 *
 * FOLLOW-UP (not covered here — needs a seeded test session):
 *   The authenticated "money path" — logging in, setting a target on the PDP so the
 *   PASS/PURSUE verdict flips, and downloading the factory RFQ — can only be
 *   exercised with a real authenticated session. That requires seeding a known
 *   test user + membership and injecting its Supabase session (e.g. via a
 *   storageState fixture or a /api/admin/seed-backed test-login route). Tracked as
 *   a follow-up; do NOT add credentials to this file.
 */
import { test, expect } from "@playwright/test";

const PROTECTED_ROUTE = "/catalog";

test.describe("Portal — auth gating & login render (unauthenticated)", () => {
  test("(a) protected route redirects an unauthenticated visitor to /login", async ({
    page,
  }) => {
    await page.goto(PROTECTED_ROUTE);

    // Middleware sends unauthenticated users to /login?next=<original path>.
    await expect(page).toHaveURL(/\/login(\?|$)/);

    // The original destination is preserved so post-login lands back on it.
    const url = new URL(page.url());
    expect(url.searchParams.get("next")).toBe(PROTECTED_ROUTE);
  });

  test("(b) /login renders the invite-only magic-link form", async ({ page }) => {
    await page.goto("/login");

    // Invite-only copy from components/auth/login-form.tsx.
    await expect(page.getByText(/invite-only workspace/i)).toBeVisible();

    // Email field for the magic link.
    await expect(page.getByPlaceholder(/name@company\.com/i)).toBeVisible();

    // The magic-link action itself — the money-path entry point.
    await expect(
      page.getByRole("button", { name: /magic link/i }),
    ).toBeVisible();

    // And the primary password sign-in button.
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });

  test("(c) the login page loads with no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/login", { waitUntil: "networkidle" });

    // Anchor on rendered content so we assert only after the page settled.
    await expect(page.getByText(/invite-only workspace/i)).toBeVisible();

    expect(errors, `console errors on /login:\n${errors.join("\n")}`).toEqual([]);
  });
});
