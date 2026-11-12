import type { NextConfig } from "next";

// No framing, no MIME sniffing, a short referrer. /api/collect and /beacon.js are called from other sites, so CORS is
// set on those routes only, not here.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // PGlite loads its WebAssembly from its own folder, which breaks when bundled
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Short cache so a beacon fix reaches every site within the hour
      { source: "/beacon.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
