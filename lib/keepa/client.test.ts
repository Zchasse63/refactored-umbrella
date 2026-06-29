import { describe, it, expect } from "vitest";
import { ktmToISO, reviewsAdded90d } from "./client";

describe("ktmToISO", () => {
  it("converts Keepa-time minutes (epoch 2011-01-01) to ISO", () => {
    // 2020-01-01 is 3287 days after 2011-01-01 = 4,733,280 Keepa minutes
    expect(ktmToISO(4733280)).toBe("2020-01-01T00:00:00.000Z");
  });
  it("returns null for missing/zero", () => {
    expect(ktmToISO(undefined)).toBeNull();
    expect(ktmToISO(0)).toBeNull();
    expect(ktmToISO(-5)).toBeNull();
  });
});

describe("reviewsAdded90d", () => {
  const nowKtm = Math.floor(Date.now() / 60000) - 21564000;
  const KMIN_DAY = 1440;

  it("returns latest − value at/before the 90d cutoff (flat [ktm,val,...] array)", () => {
    // points: 200d ago (50), 100d ago (80, the baseline — older than 90d), 10d ago (120, within window)
    const csv = [nowKtm - 200 * KMIN_DAY, 50, nowKtm - 100 * KMIN_DAY, 80, nowKtm - 10 * KMIN_DAY, 120];
    expect(reviewsAdded90d(csv)).toBe(40); // 120 − 80
  });
  it("uses the earliest known value when nothing is older than 90d", () => {
    const csv = [nowKtm - 30 * KMIN_DAY, 10, nowKtm - 5 * KMIN_DAY, 25];
    expect(reviewsAdded90d(csv)).toBe(15); // 25 − 10
  });
  it("never goes negative and handles missing/invalid", () => {
    expect(reviewsAdded90d(null)).toBeNull();
    expect(reviewsAdded90d([])).toBeNull();
    expect(reviewsAdded90d([nowKtm, -1])).toBeNull(); // latest unknown
    expect(reviewsAdded90d([nowKtm - 100 * KMIN_DAY, 200, nowKtm, 150])).toBe(0); // count "dropped" → clamp 0
  });
});
