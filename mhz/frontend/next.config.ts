import type { NextConfig } from "next";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const config: NextConfig = {
  output: process.env.MHZ_STATIC_EXPORT === "1" ? "export" : "standalone",
  outputFileTracingRoot: process.cwd(),
  basePath,
  assetPrefix: basePath || undefined,
};
export default config;
