/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @react-pdf/renderer (spec-sheet PDFs) must run as a real Node module, not be bundled by webpack
  serverExternalPackages: ["@react-pdf/renderer"], // top-level since Next 15 (was experimental.serverComponentsExternalPackages)
  images: {
    // Product imagery is local (public/products/**) for now; remote loaders (m.media-amazon.com
    // for Keepa competitor thumbnails) are added when enrichment is wired.
    remotePatterns: [
      { protocol: "https", hostname: "m.media-amazon.com" },
    ],
  },
  // Security headers applied to every route. Intentionally NO restrictive CSP script-src:
  // Next.js emits inline bootstrap scripts and the app loads Google Fonts, both of which a
  // strict script-src would break. Clickjacking is covered via X-Frame-Options / frame-ancestors.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
