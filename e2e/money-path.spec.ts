/**
 * AUTHENTICATED MONEY-PATH E2E — runs against the DEPLOYED site with real
 * sessions (see e2e/auth.setup.ts). All four specs exercise ONE designated
 * safe-to-mutate product: the 602 electric kettle (rendered "Electric Kettle",
 * model 602 — see the KETTLE constant for the display-name caveat).
 *
 * Project wiring (playwright.config.ts):
 *   setup → partner (@partner tests, partner storageState)
 *         → owner   (@owner tests, owner storageState; depends on partner)
 *         → cleanup teardown (service-role reset, runs even on failure)
 *
 * Flow order matters and is enforced by the project dependency chain plus
 * fullyParallel:false within each role project:
 *   (a) partner sets tier Pursue + target sell $40  → derived target landed $14.00
 *   (d) partner board shows the kettle with net % populated
 *   (b) owner quotes DDP $12.50                     → PASS + $1.50 headroom
 *   (c) owner exports the factory RFQ               → .xlsx download
 *
 * Numbers assumed from live global assumptions (verified 2026-07-03):
 * gross margin 0.65 → target landed = 0.35 × $40 = $14.00; quote $12.50 →
 * PASS (gross 68.8% ≥ 65.0%), headroom = 14.00 − 12.50 = +$1.50.
 */
import { test, expect, type Page } from "@playwright/test";
import { KETTLE, kettleState } from "./support/admin";

const PDP = `/p/${KETTLE.slug}`;
const EMDASH = "—";

// The Deal Calculator's number fields live inside wrapping <label> elements.
const sellInput = (page: Page) =>
  page.locator('label:has-text("Target sell") input[type="number"]');
const quotedInput = (page: Page) =>
  page.locator('label:has-text("Quoted DDP") input[type="number"]');
// "Target landed ← derived" row → the sibling span carries the derived value.
const derivedLanded = (page: Page) =>
  page
    .getByText("Target landed ← derived")
    .locator("xpath=following-sibling::span[1]");
// The VerdictLamp is the PDP's only role="status" element.
const verdictLamp = (page: Page) => page.getByRole("status");
// Five SKUs render as "Electric Kettle" — the model span "602" pins ours.
const kettleRow = (page: Page) =>
  page
    .locator("tbody tr", { hasText: KETTLE.displayName })
    .filter({ has: page.getByText(KETTLE.model, { exact: true }) });

test("(a) partner sets tier Pursue + target sell $40 → target landed derives to $14.00 and persists @partner", async ({
  page,
}) => {
  await page.goto(PDP);
  await expect(
    page.getByRole("heading", { name: KETTLE.displayName, level: 1 }),
  ).toBeVisible();

  // Clean slate (reset in auth.setup.ts): no quote yet → no PASS/FAIL lamp.
  await expect(verdictLamp(page)).toHaveCount(0);

  // Tier: Pursue. Target sell: $40.
  await page.getByRole("button", { name: "pursue", exact: true }).click();
  await sellInput(page).fill("40");

  // Derived target landed = (1 − 0.65) × 40 = $14.00, live before saving.
  await expect(derivedLanded(page)).toHaveText("$14.00");

  // Save → button confirms.
  await page.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();

  // Reload → everything persisted server-side.
  await page.reload();
  await expect(sellInput(page)).toHaveValue("40");
  await expect(derivedLanded(page)).toHaveText("$14.00");
  // Still no quote → PASS/FAIL only appears once a quote exists (owner's step).
  await expect(verdictLamp(page)).toHaveCount(0);

  // Tier persistence, asserted at the source of truth (tier text renders through
  // CSS `capitalize`, which makes DOM-text matching flaky — the DB row is exact).
  const state = await kettleState();
  expect(state.selections).toHaveLength(1);
  expect(state.selections[0].tier).toBe("pursue");
  expect(Number(state.selections[0].target_sell_price)).toBe(40);
});

test("(d) partner /board shows the kettle with net % populated (not em-dash) @partner", async ({
  page,
}) => {
  await page.goto("/board");
  const row = kettleRow(page);
  await expect(row).toBeVisible();

  // Column order: Product · Line · Tier · Target sell · Landed · Quote · Headroom · Net % · Status
  const netCell = row.locator("td").nth(7);
  await expect(netCell).not.toHaveText(EMDASH);
  await expect(netCell).toHaveText(/-?\d+(\.\d+)?%/);

  // And the partner's tier landed on the board too. Substring + case-insensitive
  // on the Tier cell: the deployed badge decorates the text (e.g. "●Pursue").
  await expect(row.locator("td").nth(2)).toContainText(/pursue/i);
});

test("(b) owner enters quoted DDP $12.50 → PASS verdict + headroom, persists @owner", async ({
  page,
}) => {
  await page.goto(PDP);
  await expect(
    page.getByRole("heading", { name: KETTLE.displayName, level: 1 }),
  ).toBeVisible();

  await quotedInput(page).fill("12.50");

  // Verdict computes live: gross (40 − 12.50)/40 = 68.8% ≥ 65.0% → PASS,
  // headroom 14.00 − 12.50 = +$1.50.
  const lamp = verdictLamp(page);
  await expect(lamp).toBeVisible();
  await expect(lamp).toContainText("PASS");
  await expect(lamp).toContainText("+$1.50 headroom");

  // Save → button confirms → reload proves persistence.
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();

  await page.reload();
  await expect(quotedInput(page)).toHaveValue("12.5");
  await expect(verdictLamp(page)).toContainText("PASS");
  await expect(verdictLamp(page)).toContainText("+$1.50 headroom");
});

test("(c) owner selects the kettle on /exports → RFQ .xlsx download fires @owner", async ({
  page,
}) => {
  // The RFQ builds server-side (exceljs + embedded images); give this test its
  // own ceiling so the 90s download wait below isn't cut off by the global 60s.
  test.setTimeout(120_000);
  await page.goto("/exports");
  await expect(page.getByRole("heading", { name: "Factory RFQ" })).toBeVisible();

  // Scope the export to exactly the kettle: clear the default selection
  // (pre-selects every product with a target sell), then filter down to the
  // kettle — the search matches "name model", and "602" is unique to it.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByPlaceholder("Search name or model…").fill(KETTLE.model);
  await page
    .getByRole("checkbox", { name: `Include ${KETTLE.displayName}` })
    .check();

  // The RFQ builds server-side (exceljs + embedded images) — allow a cold start.
  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: "Export Excel RFQ" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
});
