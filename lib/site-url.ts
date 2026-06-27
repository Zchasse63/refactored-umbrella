/**
 * Canonical site origin, derived from server configuration — NEVER from request
 * headers (Host / X-Forwarded-Host are client-controllable → SSRF). Used to fetch
 * our own /products/*.{jpg,png} assets off the CDN for RFQ/spec-sheet embedding.
 *
 * Order: explicit NEXT_PUBLIC_SITE_URL → Netlify's injected URL/DEPLOY_PRIME_URL →
 * the known production origin as a last-resort constant.
 */
const FALLBACK_ORIGIN = "https://the-portal-sourcing.netlify.app";

export function siteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    FALLBACK_ORIGIN;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.origin;
  } catch {
    return FALLBACK_ORIGIN;
  }
}
