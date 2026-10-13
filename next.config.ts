import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: { "/*": ["./.local-edit/**/*"] },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
