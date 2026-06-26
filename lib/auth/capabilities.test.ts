import { describe, it, expect } from "vitest";
import { can, canTransition } from "./capabilities";

describe("capability map", () => {
  it("partner authors selections; owner authors quotes/catalog", () => {
    expect(can("partner", "selections.write")).toBe(true);
    expect(can("owner", "selections.write")).toBe(false);
    expect(can("owner", "factory_quotes.write")).toBe(true);
    expect(can("partner", "factory_quotes.write")).toBe(false);
    expect(can(null, "selections.write")).toBe(false);
  });
});

describe("canTransition — mirrors public.can_transition() in SQL", () => {
  it("partner may move new ↔ shortlisted only", () => {
    expect(canTransition("new", "shortlisted", "partner")).toBe(true);
    expect(canTransition("shortlisted", "new", "partner")).toBe(true);
    expect(canTransition("shortlisted", "costing", "partner")).toBe(false);
    expect(canTransition("costing", "quoted", "partner")).toBe(false);
  });

  it("owner may move shortlisted → costing → quoted (and back)", () => {
    expect(canTransition("shortlisted", "costing", "owner")).toBe(true);
    expect(canTransition("costing", "quoted", "owner")).toBe(true);
    expect(canTransition("quoted", "costing", "owner")).toBe(true);
    expect(canTransition("new", "shortlisted", "owner")).toBe(false); // owner can't shortlist
  });

  it("either role may send to decision; same-stage is a no-op pass", () => {
    expect(canTransition("quoted", "decision", "owner")).toBe(true);
    expect(canTransition("new", "decision", "partner")).toBe(true);
    expect(canTransition("costing", "costing", "partner")).toBe(true);
  });

  it("illegal jumps are rejected", () => {
    expect(canTransition("new", "quoted", "owner")).toBe(false);
    expect(canTransition("new", "costing", "partner")).toBe(false);
  });
});
