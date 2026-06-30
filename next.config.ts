import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server build (.next/standalone) so the Docker runtime
  // image ships only the traced server + its dependencies. See Dockerfile.
  output: "standalone",
};

export default nextConfig;
