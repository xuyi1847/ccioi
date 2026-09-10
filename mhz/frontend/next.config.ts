import type { NextConfig } from "next";
const config: NextConfig = { output: "standalone", outputFileTracingRoot: process.cwd(), images: { remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }, { protocol: "https", hostname: "is1-ssl.mzstatic.com" }, { protocol: "https", hostname: "usercontent.jamendo.com" }, { protocol: "https", hostname: "images.jamendo.com" }] } };
export default config;
