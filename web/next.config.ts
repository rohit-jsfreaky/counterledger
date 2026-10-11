import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "node:path";

// One .env for the whole repo (gitignored): RECLAIM_APP_ID/SECRET, HELIUS_API_KEY, … On Vercel these are project env vars.
config({ path: resolve(process.cwd(), "..", ".env"), quiet: true });

const nextConfig: NextConfig = {
  cacheComponents: true,
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
