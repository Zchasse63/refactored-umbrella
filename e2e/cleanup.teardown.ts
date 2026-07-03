/**
 * POST-SUITE CLEANUP — wired as the `teardown` of the "setup" project in
 * playwright.config.ts, so Playwright runs it after every project that depends
 * on setup has finished, EVEN when specs fail. The money-path specs mutate one
 * designated product on the live site; this returns it to its canonical state:
 * no selection row (tier/sell null) and no factory_quotes rows.
 */
import { test as teardown, expect } from "@playwright/test";
import { resetKettle, kettleState, KETTLE } from "./support/admin";

teardown(`reset ${KETTLE.slug}: selection + quotes back to null`, async () => {
  try {
    await resetKettle();
  } finally {
    // Verify the reset actually landed regardless of what happened above.
    const state = await kettleState();
    expect(state.quotes, "factory_quotes rows must be gone after cleanup").toHaveLength(0);
    expect(state.selections, "selections row must be gone after cleanup").toHaveLength(0);
  }
});
