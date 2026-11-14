import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.CODELENS_NEXT_DIST_DIR
    ? { distDir: process.env.CODELENS_NEXT_DIST_DIR }
    : {}),
  poweredByHeader: false,
  output: "standalone",
  serverExternalPackages: ["postgres"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
