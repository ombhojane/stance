import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // self-contained server bundle for the Cloud Run container
  output: "standalone",
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"] },
  experimental: {
    // tree-shake icon and animation packages down to what is actually imported
    optimizePackageImports: ["lucide-react", "motion"],
  },
  async headers() {
    return [
      {
        // the worker must never be served stale, or updates would never reach installed apps
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/art/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
