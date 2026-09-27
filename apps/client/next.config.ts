import type { NextConfig } from 'next';

/**
 * Next.js config — RSC on, strict mode. The API lives in apps/server
 * (different origin) — client calls go to the public origin, never
 * proxied through Next.
 *
 * `output: 'standalone'` is deliberately NOT set here: combined with a
 * pnpm workspace it breaks Turbopack builds off-Docker (Invalid symlink /
 * distDirRoot). It gets re-enabled in the M1 Dockerfile, where the build
 * runs in-container against a hoisted layout — the environment it was
 * designed for.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
