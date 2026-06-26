/**
 * Display-side data cleaning. The factory source JSON occasionally stores a whole
 * machine-translated marketing sentence as a `spec.label` (with an empty value) —
 * those render as a giant, meaningless chip/row. A real spec has a short label and
 * a non-empty value. Keep only those; everything stays honest and legible.
 */
import type { Spec } from "@/lib/types";

export function isRealSpec(s: Spec | null | undefined): s is Spec {
  if (!s) return false;
  const label = String(s.label ?? "").trim();
  const value = String(s.value ?? "").trim();
  return label.length > 0 && label.length <= 40 && value.length > 0;
}

export function cleanSpecs(specs: Spec[] | null | undefined): Spec[] {
  return (specs ?? []).filter(isRealSpec);
}
