#!/usr/bin/env tsx
/**
 * Applies the blog migration chain (src/db/migrations) to Neon.
 *
 * Requires BLOG_DATABASE_URL. Unlike scripts/db-migrate.ts this has no PGlite path:
 * the posts table needs pgvector, which PGlite does not ship.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { resolve } from 'node:path';

const url = process.env.BLOG_DATABASE_URL?.trim();
if (!url) {
  console.error('BLOG_DATABASE_URL is not set. Point it at the blog Neon connection string and re-run.');
  process.exit(1);
}

// Host only — never print the credentials in the connection string.
console.log(`Migrating blog schema → ${new URL(url).host}`);

const db = drizzle(neon(url));
await migrate(db, { migrationsFolder: resolve(process.cwd(), 'src/db/migrations') });

console.log('Blog migrations applied.');
process.exit(0);
