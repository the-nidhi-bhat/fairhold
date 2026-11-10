import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Evidence uploads go through server actions; raise the default 1 MB limit.
    // The application still enforces its own 3 MB per-file cap.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * Baseline hardening. The deployment served only HSTS (which Vercel adds),
   * with no framing, MIME-sniffing or referrer protection at all.
   *
   * Deliberately conservative: these headers cannot break a Next.js app that
   * ships inline bootstrap scripts, so no CSP is set here. A real CSP needs a
   * nonce/hash pipeline and its own verification pass.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
