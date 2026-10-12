import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "node:path";

// One .env for the whole repo (gitignored): RECLAIM_APP_ID/SECRET, HELIUS_API_KEY, … On Vercel these are project env vars.
config({ path: resolve(process.cwd(), "..", ".env"), quiet: true });

const nextConfig: NextConfig = {
  cacheComponents: true,
  // src/generated is read with fs at request time (lib/data.ts, api/faucet): ship it with every server function
  outputFileTracingIncludes: { "/**/*": ["./src/generated/**/*"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
