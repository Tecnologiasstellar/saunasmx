import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS_FOLDER, type Database } from '@/modules/database/client';
import * as schema from '@/modules/database/schema';

/**
 * A fresh in-memory PostgreSQL for each integration test file.
 * Real Postgres semantics (constraints, transactions, enums) with no server.
 */
export async function createTestDatabase(): Promise<Database> {
  const client = await PGlite.create();
  const db = drizzle(client, { schema });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-specific migrator, compatible at runtime.
  await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Database;
}
