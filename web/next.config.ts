import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  agentRules: false,
  // The detection engine lives in ../engine and is shared with the indexer. `lib/engine` is a
  // symlink to ../engine/src; this extra root lets Turbopack follow it without watching the
  // whole repository (which holds large raw data).
  experimental: {
    turbopackAdditionalRoots: {
      engine: { path: path.join(__dirname, '../engine') },
    },
  },
};

export default nextConfig;
