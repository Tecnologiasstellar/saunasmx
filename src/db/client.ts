import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Blog database handle: Neon over HTTP, which is the cheap path on Vercel
 * (no pool to keep warm, no connection burned per serverless invocation).
 *
 * Separate from src/modules/database/client.ts on purpose — see src/db/schema.ts.
 */

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

/** True when this environment has a blog database configured at all. */
export function blogConfigured(): boolean {
  return !!process.env.BLOG_DATABASE_URL?.trim();
}

export function getBlogDb() {
  if (cached) return cached;

  // Deliberately NOT DATABASE_URL: that one points at the marketplace database,
  // and the blog lives in its own Neon project. No fallback — reading the wrong
  // database should fail loudly rather than return confusing "table not found".
  const url = process.env.BLOG_DATABASE_URL?.trim();
  if (!url) throw new Error('BLOG_DATABASE_URL is required (the blog Neon connection string).');

  cached = drizzle(neon(url), { schema });
  return cached;
}

export { schema };
