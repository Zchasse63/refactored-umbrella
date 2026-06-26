/**
 * The ONE role-capability map (BUILD_PLAN §7). Both the UI "isEditable" affordance
 * and the Supabase RLS policies (0002_rls.sql) derive from this — if they ever drift,
 * the two-sided trust model breaks. An integration test asserts each capability here
 * against the DB policy for each role.
 */
import type { Role } from "@/lib/types";

export type Capability =
  | "products.write"
  | "product_images.write"
  | "competitors.write"
  | "factory_quotes.write"
  | "assumptions.write"
  | "search_profiles.write"
  | "selections.write";

/** Who may author each field group. Owner = cost/catalog side; Partner = market side. */
export const CAPS: Record<Capability, Role> = {
  "products.write": "owner",
  "product_images.write": "owner",
  "competitors.write": "owner",
  "factory_quotes.write": "owner",
  "assumptions.write": "owner",
  "search_profiles.write": "owner",
  "selections.write": "partner",
};

export function can(role: Role | null | undefined, cap: Capability): boolean {
  return role != null && CAPS[cap] === role;
}

/** Pipeline transition matrix — mirrors public.can_transition() in SQL. */
export function canTransition(from: string, to: string, role: Role): boolean {
  if (from === to) return true;
  if (to === "decision") return true; // either role may decide
  if (role === "partner")
    return (from === "new" && to === "shortlisted") || (from === "shortlisted" && to === "new");
  if (role === "owner")
    return ["shortlisted->costing", "costing->quoted", "quoted->costing", "costing->shortlisted"].includes(
      `${from}->${to}`,
    );
  return false;
}
