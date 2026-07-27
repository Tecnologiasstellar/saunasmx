import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  // PGlite and pg are node-only; keep them out of any client/edge bundle.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
};

export default nextConfig;
