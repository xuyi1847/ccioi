import type { NextConfig } from "next";
const config: NextConfig = { output: "standalone", outputFileTracingRoot: process.cwd(), images: { remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }, { protocol: "https", hostname: "is1-ssl.mzstatic.com" }] } };
export default config;
