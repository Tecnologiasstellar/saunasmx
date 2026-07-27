import { defineConfig } from 'drizzle-kit';

/**
 * Blog-only drizzle config. Separate from drizzle.config.ts because the blog
 * needs pgvector (Neon) and the marketplace schema must stay applicable to the
 * embedded PGlite used in local dev and tests. See src/db/schema.ts.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.BLOG_DATABASE_URL ?? 'postgresql://localhost:5432/placeholder' },
  strict: true,
  verbose: true,
});
