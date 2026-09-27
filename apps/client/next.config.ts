import type { NextConfig } from 'next';

/**
 * Next.js config — RSC on, strict mode. The API lives in apps/server
 * (different origin) — client calls go to the public origin, never
 * proxied through Next.
 *
 * `output: 'standalone'` produces the self-contained server bundle the
 * container image ships. It requires the build to run from the workspace
 * root (where `next` can resolve pnpm's hoisted layout), so it is enabled
 * only when `NEXT_STANDALONE=1` — which the Dockerfile sets. Local builds
 * and turborepo keep the plain output, where a standalone bundle would only
 * add tracing work for an artifact nothing reads.
 *
 * The `.js` → `.ts` extension alias exists because `@rheoson/shared` is
 * consumed as **source**: its relative imports carry explicit `.js`
 * specifiers so Node's ESM resolver (the server runs TypeScript directly
 * through `tsx`) can find them. Node, tsx and Vite all try the TypeScript
 * file first; webpack does not, so without this a client build fails with
 * `Module not found: Can't resolve './types.js'` — which reads like a missing
 * file rather than a resolution rule.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
