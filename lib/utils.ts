import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Canonical empty/guarded value — never "$0.00", never "NaN" (DESIGN_GUIDE §5.3.3). */
export const EMDASH = "—";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Money. `null`/`undefined`/non-finite → em-dash. */
export function money(v: number | null | undefined, cents = true): string {
  if (v == null || !Number.isFinite(v)) return EMDASH;
  return (cents ? usd2 : usd0).format(v);
}

/** Percent from a 0..1 ratio. 1 decimal by default. */
export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return EMDASH;
  return `${(v * 100).toFixed(digits)}%`;
}

export function int(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return EMDASH;
  return new Intl.NumberFormat("en-US").format(v);
}

/** Coarse relative time for authorship captions ("set by {memberName} · {relativeTime}"). */
export function relativeTime(d: Date | string | number, now: Date = new Date()): string {
  const then = new Date(d).getTime();
  const s = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.round(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
