import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  // PGlite and pg are node-only; keep them out of any client/edge bundle.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  images: {
    // Blog hero photos are discovered by the daily agent and stored as Pexels
    // CDN URLs — they cannot be committed to public/img like the rest, because
    // the agent runs against a read-only filesystem. Scoped to this one host so
    // a bad row can never turn the optimizer into an open image proxy.
    remotePatterns: [{ protocol: 'https', hostname: 'images.pexels.com', pathname: '/photos/**' }],
  },
};

export default nextConfig;
