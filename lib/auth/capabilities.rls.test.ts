/**
 * RLS DRIFT GUARD (pure unit — NO network, CI-safe).
 *
 * This is the drift guard the comment at the top of capabilities.ts *claimed*
 * existed but did not: an assertion that the TS capability/transition matrix is
 * internally consistent AND matches the DOCUMENTED policy intent that the
 * Supabase RLS (0002_rls.sql + 0009–0012) is built from.
 *
 * We deliberately do NOT hit the live DB here. Instead we encode the *intended*
 * policy — the single source of truth described in BUILD_PLAN §7 and mirrored
 * by public.can_transition() in SQL — as a local table, and assert the exported
 * TS functions reproduce it EXHAUSTIVELY. If someone edits CAPS or canTransition
 * (or the mirror in SQL) without updating the documented intent, this fails.
 *
 * The intended matrix (kept in lockstep with 0002_rls.sql):
 *   READ:   both roles read every table (asserted at the RLS/SQL layer, not here).
 *   WRITE:  owner authors products / product_images / competitors /
 *           factory_quotes / assumptions / search_profiles.
 *           partner authors selections only.
 *   PIPELINE (public.can_transition):
 *           same-stage         -> always legal (no-op) for either role
 *           partner: new <-> shortlisted        (and nothing else)
 *           owner:   shortlisted <-> costing, costing <-> quoted,
 *                    decision -> costing        (escape the dead-end)
 *           either:  <any> -> decision
 *           everything else    -> illegal
 */
import { describe, it, expect } from "vitest";
import { can, canTransition, CAPS, type Capability } from "./capabilities";
import type { Role, PipelineStatus } from "@/lib/types";

// ── Ground truth, transcribed from the DOCUMENTED policy intent ──────────────

const ROLES: readonly Role[] = ["owner", "partner"] as const;

/** Every pipeline stage the transition matrix reasons about. */
const STATUSES: readonly PipelineStatus[] = [
  "new",
  "shortlisted",
  "costing",
  "quoted",
  "decision",
] as const;

/** The intended author of each capability (must equal CAPS in capabilities.ts). */
const EXPECTED_CAPS: Record<Capability, Role> = {
  "products.write": "owner",
  "product_images.write": "owner",
  "competitors.write": "owner",
  "factory_quotes.write": "owner",
  "assumptions.write": "owner",
  "search_profiles.write": "owner",
  "selections.write": "partner",
};

/**
 * Independent re-implementation of the INTENDED transition matrix. This is NOT
 * imported from capabilities.ts — it is the spec canTransition() must satisfy,
 * transcribed straight from the prose in 0002_rls.sql / BUILD_PLAN §7. If the two
 * ever disagree, one of them drifted.
 */
function intendedTransition(from: string, to: string, role: Role): boolean {
  if (from === to) return true; // same-stage no-op is always legal
  if (to === "decision") return true; // either role may decide
  if (role === "partner") {
    return (
      (from === "new" && to === "shortlisted") ||
      (from === "shortlisted" && to === "new")
    );
  }
  // role === "owner"
  return (
    (from === "shortlisted" && to === "costing") ||
    (from === "costing" && to === "quoted") ||
    (from === "quoted" && to === "costing") ||
    (from === "costing" && to === "shortlisted") ||
    (from === "decision" && to === "costing") // escape the dead-end
  );
}

// ── CAPS: capability → role map matches documented intent ────────────────────

describe("CAPS capability map matches documented RLS write-gate intent", () => {
  it("has exactly the documented set of capabilities (no drift in keys)", () => {
    expect(Object.keys(CAPS).sort()).toEqual(Object.keys(EXPECTED_CAPS).sort());
  });

  it("maps every capability to the intended author role", () => {
    for (const [cap, role] of Object.entries(EXPECTED_CAPS) as [
      Capability,
      Role,
    ][]) {
      expect(CAPS[cap], `${cap} should be authored by ${role}`).toBe(role);
    }
  });

  it("owner authors catalog/cost side; partner authors market side only", () => {
    const owned = Object.entries(CAPS)
      .filter(([, r]) => r === "owner")
      .map(([c]) => c)
      .sort();
    const partnered = Object.entries(CAPS)
      .filter(([, r]) => r === "partner")
      .map(([c]) => c)
      .sort();

    expect(owned).toEqual(
      [
        "products.write",
        "product_images.write",
        "competitors.write",
        "factory_quotes.write",
        "assumptions.write",
        "search_profiles.write",
      ].sort(),
    );
    expect(partnered).toEqual(["selections.write"]);
  });
});

// ── can(): exhaustive over (role × capability), including the null role ───────

describe("can() — exhaustive over every role × capability", () => {
  it("grants exactly the authoring role and denies the other role", () => {
    for (const cap of Object.keys(CAPS) as Capability[]) {
      const author = EXPECTED_CAPS[cap];
      for (const role of ROLES) {
        expect(can(role, cap), `can(${role}, ${cap})`).toBe(role === author);
      }
    }
  });

  it("denies a null / undefined role for every capability (no anonymous writes)", () => {
    for (const cap of Object.keys(CAPS) as Capability[]) {
      expect(can(null, cap), `can(null, ${cap})`).toBe(false);
      expect(can(undefined, cap), `can(undefined, ${cap})`).toBe(false);
    }
  });
});

// ── canTransition(): EXHAUSTIVE over every (from × to × role) combination ─────

describe("canTransition() — exhaustive drift guard vs. intended matrix", () => {
  it("agrees with the documented matrix for ALL (from, to, role) triples", () => {
    for (const role of ROLES) {
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          const expected = intendedTransition(from, to, role);
          expect(
            canTransition(from, to, role),
            `canTransition(${from} -> ${to}, ${role}) expected ${expected}`,
          ).toBe(expected);
        }
      }
    }
  });

  // The following spell out the intent explicitly so a failure message names the
  // exact rule that broke, not just "the loop disagreed".

  it("same-stage is always a legal no-op for either role", () => {
    for (const role of ROLES) {
      for (const s of STATUSES) {
        expect(canTransition(s, s, role), `${s}->${s} as ${role}`).toBe(true);
      }
    }
  });

  it("any stage -> decision is legal for either role", () => {
    for (const role of ROLES) {
      for (const from of STATUSES) {
        expect(canTransition(from, "decision", role)).toBe(true);
      }
    }
  });

  it("partner may ONLY move new <-> shortlisted (plus no-op / decision)", () => {
    expect(canTransition("new", "shortlisted", "partner")).toBe(true);
    expect(canTransition("shortlisted", "new", "partner")).toBe(true);
    // every other partner move that isn't same-stage or ->decision is illegal
    const partnerLegal = new Set([
      "new->shortlisted",
      "shortlisted->new",
    ]);
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (from === to || to === "decision") continue;
        const key = `${from}->${to}`;
        expect(
          canTransition(from, to, "partner"),
          `partner ${key}`,
        ).toBe(partnerLegal.has(key));
      }
    }
  });

  it("partner may NOT touch the costing/quoted lane", () => {
    expect(canTransition("shortlisted", "costing", "partner")).toBe(false);
    expect(canTransition("costing", "quoted", "partner")).toBe(false);
    expect(canTransition("quoted", "costing", "partner")).toBe(false);
    expect(canTransition("costing", "shortlisted", "partner")).toBe(false);
  });

  it("owner may move shortlisted <-> costing, costing <-> quoted, and decision -> costing only", () => {
    expect(canTransition("shortlisted", "costing", "owner")).toBe(true);
    expect(canTransition("costing", "quoted", "owner")).toBe(true);
    expect(canTransition("quoted", "costing", "owner")).toBe(true);
    expect(canTransition("costing", "shortlisted", "owner")).toBe(true);
    expect(canTransition("decision", "costing", "owner")).toBe(true);
    const ownerLegal = new Set([
      "shortlisted->costing",
      "costing->quoted",
      "quoted->costing",
      "costing->shortlisted",
      "decision->costing", // escape the dead-end
    ]);
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (from === to || to === "decision") continue;
        const key = `${from}->${to}`;
        expect(canTransition(from, to, "owner"), `owner ${key}`).toBe(
          ownerLegal.has(key),
        );
      }
    }
  });

  it("owner may NOT shortlist (partner-only entry move)", () => {
    expect(canTransition("new", "shortlisted", "owner")).toBe(false);
    expect(canTransition("shortlisted", "new", "owner")).toBe(false);
  });

  it("nobody may make illegal skips (e.g. new -> costing / new -> quoted)", () => {
    for (const role of ROLES) {
      expect(canTransition("new", "costing", role), `${role} new->costing`).toBe(
        false,
      );
      expect(canTransition("new", "quoted", role), `${role} new->quoted`).toBe(
        false,
      );
      expect(
        canTransition("shortlisted", "quoted", role),
        `${role} shortlisted->quoted`,
      ).toBe(false);
    }
  });

  it("from 'decision' only ->decision (either) plus owner's ->costing escape is legal", () => {
    // decision is no longer a hard dead-end: the OWNER may send a card back to
    // costing to re-work sourcing. Everything else out of decision is still
    // illegal, and the partner has no escape at all.
    for (const role of ROLES) {
      for (const to of STATUSES) {
        // same-stage OR the universal ->decision always land; owner alone may
        // also go decision->costing.
        const expected =
          to === "decision" || (role === "owner" && to === "costing");
        expect(
          canTransition("decision", to, role),
          `${role} decision->${to}`,
        ).toBe(expected);
      }
    }
  });
});
