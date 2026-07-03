/**
 * Mint @supabase/ssr-compatible auth cookies from a supabase-js Session so
 * Playwright contexts are accepted by the Next.js middleware (createServerClient).
 *
 * Encoding — faithful to node_modules/@supabase/ssr@0.12 source:
 *   - storage key (cookie name): `sb-<project-ref>-auth-token`
 *     (default when no cookieOptions.name is configured — the middleware uses defaults)
 *   - value: "base64-" + base64url(JSON.stringify(session))   [cookies.js BASE64_PREFIX +
 *     stringToBase64URL — unpadded base64url of the UTF-8 bytes, identical to Node's
 *     Buffer.toString("base64url"); default cookieEncoding is "base64url"]
 *   - chunking (utils/chunker.js createChunks): if encodeURIComponent(value) exceeds
 *     MAX_CHUNK_SIZE = 3180 chars, split into cookies named `<key>.0`, `<key>.1`, …
 */

export const MAX_CHUNK_SIZE = 3180;

export interface CookieChunk {
  name: string;
  value: string;
}

/** Faithful port of createChunks from @supabase/ssr dist/main/utils/chunker.js. */
export function createChunks(key: string, value: string, chunkSize = MAX_CHUNK_SIZE): CookieChunk[] {
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= chunkSize) {
    return [{ name: key, value }];
  }
  const chunks: string[] = [];
  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, chunkSize);
    const lastEscapePos = encodedChunkHead.lastIndexOf("%");
    // Don't split in the middle of a %XX escape sequence.
    if (lastEscapePos > chunkSize - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    }
    let valueHead = "";
    // Back off until the head decodes cleanly (multi-byte unicode boundary).
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch (error) {
        if (
          error instanceof URIError &&
          encodedChunkHead.at(-3) === "%" &&
          encodedChunkHead.length > 3
        ) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
        } else {
          throw error;
        }
      }
    }
    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }
  return chunks.map((chunk, i) => ({ name: `${key}.${i}`, value: chunk }));
}

/** `sb-<project-ref>-auth-token` — ref is the subdomain of the supabase URL. */
export function storageKeyForUrl(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

/** Playwright storageState cookie shape. */
export interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

/**
 * Session (the object returned by signInWithPassword — access_token, refresh_token,
 * expires_at, user, …) → the exact cookie set @supabase/ssr would have written.
 * auth-js persists JSON.stringify(session), so that is what we encode.
 */
export function sessionToCookies(
  session: object,
  supabaseUrl: string,
  appUrl: string,
): StorageStateCookie[] {
  const key = storageKeyForUrl(supabaseUrl);
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const app = new URL(appUrl);
  // Mirrors @supabase/ssr DEFAULT_COOKIE_OPTIONS direction-of-travel: path "/",
  // sameSite lax, NOT httpOnly (the browser client must be able to read it).
  return createChunks(key, encoded).map(({ name, value }) => ({
    name,
    value,
    domain: app.hostname,
    path: "/",
    expires: -1, // session cookie — lives for the browser context, plenty for a test run
    httpOnly: false,
    secure: app.protocol === "https:",
    sameSite: "Lax" as const,
  }));
}
