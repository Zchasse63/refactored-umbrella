/**
 * Env loader for the E2E suite — no dotenv dependency.
 *
 * Loads (in order, never overriding vars already set in the process env):
 *   .env.e2e   — E2E credentials + supabase url/anon key (written by
 *                scripts/e2e-setup-accounts.mjs; gitignored)
 *   .env.local — SUPABASE_SERVICE_ROLE_KEY for the cleanup helper (gitignored)
 *
 * In CI both files may be absent; the same variables are then expected to be
 * provided directly through the environment.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Robust under both CJS transpilation and native ESM (package.json has "type": "module").
const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

/** Project root (e2e/support/ → two levels up). */
export const ROOT = path.resolve(HERE, "..", "..");

function loadEnvFile(file: string): void {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue; // real env always wins
    process.env[key] = raw.trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadEnvFile(".env.e2e");
loadEnvFile(".env.local");

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Run \`npm run test:e2e:setup\` first (writes .env.e2e), ` +
        `or provide it via the environment.`,
    );
  }
  return v;
}
