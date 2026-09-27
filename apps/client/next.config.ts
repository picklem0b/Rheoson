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
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
};

export default nextConfig;
