import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Going back to a page within 30 s (brand tabs, lists) shows it at once instead of loading
    // it again. Saves and finished jobs call router.refresh, which clears it.
    staleTimes: { dynamic: 30 },
  },
  // Dev-only badge; bottom-left would cover the Settings item in the icon rail.
  devIndicators: { position: "bottom-right" },
  async redirects() {
    return [{ source: "/", destination: "/home", permanent: false }];
  },
};

export default nextConfig;
