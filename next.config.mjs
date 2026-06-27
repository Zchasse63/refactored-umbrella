/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @react-pdf/renderer (spec-sheet PDFs) must run as a real Node module, not be bundled by webpack
  experimental: { serverComponentsExternalPackages: ["@react-pdf/renderer"] },
  images: {
    // Product imagery is local (public/products/**) for now; remote loaders (m.media-amazon.com
    // for Keepa competitor thumbnails) are added when enrichment is wired.
    remotePatterns: [
      { protocol: "https", hostname: "m.media-amazon.com" },
    ],
  },
};

export default nextConfig;
