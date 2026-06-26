/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Product imagery is local (public/products/**) for now; remote loaders (m.media-amazon.com
    // for Keepa competitor thumbnails) are added when enrichment is wired.
    remotePatterns: [
      { protocol: "https", hostname: "m.media-amazon.com" },
    ],
  },
};

export default nextConfig;
