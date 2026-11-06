import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The "N" badge sits over the window's footer.
  devIndicators: false,
  partialPrefetching: true,
  turbopack: {
    // @wowserhq/io (BLP decoding in src/render/textures) requires `fs` from a shim; stub it in the browser.
    resolveAlias: { fs: { browser: "./src/render/textures/browser-fs-stub.js" } },
  },
};

export default nextConfig;
