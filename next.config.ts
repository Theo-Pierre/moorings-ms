import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./data/drive/**/*", "./public/reports/**/*"],
  },
};

export default nextConfig;
