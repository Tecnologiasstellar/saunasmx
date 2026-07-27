import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/database/schema.ts',
  out: './src/modules/database/migrations',
  // Generation is offline; migrations are committed and applied by scripts/db-migrate.ts.
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/placeholder' },
  strict: true,
  verbose: true,
});
