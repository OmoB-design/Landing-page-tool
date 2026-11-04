import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Going back to a page within 30 s (brand tabs, lists) shows it at once instead of loading
    // it again. Saves and finished jobs call router.refresh, which clears it.
    staleTimes: { dynamic: 30 },
  },
  // Dev-only badge, off: bottom-left covers Settings in the icon rail and bottom-right the page
  // editor's send and Stop buttons (B3.1c). Next still shows its error overlay in development.
  devIndicators: false,
  async redirects() {
    return [{ source: "/", destination: "/home", permanent: false }];
  },
};

export default nextConfig;
