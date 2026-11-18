import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The desktop build (scripts/build-desktop.mjs) sets BC_STANDALONE=1 to get a
  // self-contained server under .next/standalone. `npm start` keeps the
  // regular output.
  output: process.env.BC_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: projectRoot,
  // The desktop app's install folder is read-only (and code-signed on macOS):
  // serve images as they are instead of writing an optimizer cache there.
  images: { unoptimized: process.env.BC_STANDALONE === "1" },
  eslint: {
    // Lint is run explicitly via `npm run lint`; do not fail production builds on it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
