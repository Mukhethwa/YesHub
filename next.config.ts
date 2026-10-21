import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The SME portal moved from /dashboard to /sme; /dashboard is now the enterprise dashboard
  async redirects() {
    return [
      { source: "/onboarding", destination: "/sme/register", permanent: false },
      { source: "/dashboard/:section(documents|profile|matches)", destination: "/sme/:section", permanent: false },
    ];
  },
  experimental: {
    // The build cache (restored on Vercel between deploys) has served stale Tailwind CSS: theme edits and
    // new classes were missing. Compile CSS from source on every production build.
    turbopackFileSystemCacheForBuild: false,
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
